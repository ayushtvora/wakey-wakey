import Foundation
import UserNotifications

/// Free-Apple-ID installs stop launching when their provisioning profile expires (7 days),
/// and their AlarmKit alarms stop ringing with them.
///
/// The profile embedded in the app is the one from the install. A SideStore refresh only
/// installs a new profile on the device and leaves the app bundle alone, so the embedded date
/// goes stale after the first refresh. The "Record SideStore refresh" Shortcuts action (run
/// right after SideStore's "Refresh All Apps") stores the refresh time, and the expiry is the
/// later of the embedded date and that refresh + 7 days.
public enum WakeySigning {
  public struct Info {
    /// Best known expiry: the later of `installExpiresAt` and `lastRefreshAt` + 7 days.
    let expiresAt: Date
    /// From the profile embedded in the app (the install's own profile).
    let installExpiresAt: Date
    let lastRefreshAt: Date?
    let createdAt: Date?
    let teamName: String?

    func asDictionary() -> [String: Any] {
      var d: [String: Any] = [
        "expiresAt": expiresAt.timeIntervalSince1970 * 1000,
        "installExpiresAt": installExpiresAt.timeIntervalSince1970 * 1000,
      ]
      if let lastRefreshAt { d["lastRefreshAt"] = lastRefreshAt.timeIntervalSince1970 * 1000 }
      if let createdAt { d["createdAt"] = createdAt.timeIntervalSince1970 * 1000 }
      if let teamName { d["teamName"] = teamName }
      return d
    }
  }

  /// Free-account profiles last 7 days from signing.
  static let profileLifetime: TimeInterval = 7 * 24 * 3600
  private static let lastRefreshKey = "wakey.lastRefreshAt"

  public static var lastRefreshAt: Date? {
    UserDefaults.standard.object(forKey: lastRefreshKey) as? Date
  }

  /// Called by the Shortcuts action after a successful SideStore refresh.
  @discardableResult
  public static func recordRefresh(at date: Date = Date()) async -> [Double] {
    UserDefaults.standard.set(date, forKey: lastRefreshKey)
    WakeyAlarmController.shared.log("SideStore refresh recorded")
    return await scheduleReminders()
  }

  static func info() -> Info? {
    guard let embedded = provisioningInfo() else { return nil }
    let refreshed = lastRefreshAt
    let fromRefresh = refreshed.map { $0.addingTimeInterval(profileLifetime) }
    return Info(
      expiresAt: max(embedded.expiresAt, fromRefresh ?? .distantPast),
      installExpiresAt: embedded.expiresAt,
      lastRefreshAt: refreshed,
      createdAt: embedded.createdAt,
      teamName: embedded.teamName)
  }

  private struct Embedded {
    let expiresAt: Date
    let createdAt: Date?
    let teamName: String?
  }

  /// nil when there is no embedded profile (simulator, or an App Store build).
  private static func provisioningInfo() -> Embedded? {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let data = try? Data(contentsOf: url)
    else { return nil }
    // The file is a CMS envelope around a plain XML plist; cut the plist out.
    guard let start = data.range(of: Data("<?xml".utf8)),
      let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex)
    else { return nil }
    let plistData = data.subdata(in: start.lowerBound..<end.upperBound)
    guard
      let plist = try? PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any],
      let expiresAt = plist["ExpirationDate"] as? Date
    else { return nil }
    return Embedded(
      expiresAt: expiresAt,
      createdAt: plist["CreationDate"] as? Date,
      teamName: plist["TeamName"] as? String)
  }

  private static let prefix = "wakey.expiry."

  /// Reminder times: 8 PM two days and one day before expiry, and 3 hours before it.
  static func reminderDates(expiresAt: Date, now: Date = Date(), calendar: Calendar = .current) -> [Date] {
    let expiryDay = calendar.startOfDay(for: expiresAt)
    var dates: [Date] = []
    for daysBefore in [2, 1] {
      if let day = calendar.date(byAdding: .day, value: -daysBefore, to: expiryDay),
        let evening = calendar.date(bySettingHour: 20, minute: 0, second: 0, of: day)
      {
        dates.append(evening)
      }
    }
    dates.append(expiresAt.addingTimeInterval(-3 * 3600))
    return dates
      .filter { $0 > now.addingTimeInterval(60) && $0 < expiresAt }
      .sorted()
  }

  /// Idempotent: keeps existing reminders if they were made for this same expiry date, and
  /// replaces them when the date moves (a recorded refresh).
  /// Returns the reminder times (epoch ms) now pending, or [] without notification permission.
  static func scheduleReminders() async -> [Double] {
    let center = UNUserNotificationCenter.current()
    guard let info = Self.info() else { return [] }
    let tag = "\(prefix)\(Int(info.expiresAt.timeIntervalSince1970))."

    let pending = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix(prefix) }
    let current = pending.filter { $0.identifier.hasPrefix(tag) }
    if !current.isEmpty {
      return current.compactMap { ($0.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate() }
        .map { $0.timeIntervalSince1970 * 1000 }
    }
    center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier))

    let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    guard granted else { return [] }

    let appName =
      Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Wakey Wakey"
    let fmt = DateFormatter()
    fmt.dateFormat = "EEE h:mm a"
    let expiryText = fmt.string(from: info.expiresAt)

    var scheduled: [Double] = []
    for (i, date) in reminderDates(expiresAt: info.expiresAt).enumerated() {
      let content = UNMutableNotificationContent()
      content.title = "\(appName) expires \(expiryText)"
      content.body =
        "Refresh it in SideStore (or reinstall with Sideloadly) before then. After it expires, the app won't open and your alarms won't ring."
      content.sound = .default
      let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
      let request = UNNotificationRequest(
        identifier: "\(tag)\(i)", content: content,
        trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
      do {
        try await center.add(request)
        scheduled.append(date.timeIntervalSince1970 * 1000)
      } catch {
        WakeyAlarmController.shared.log("expiry reminder failed: \(error)")
      }
    }
    WakeyAlarmController.shared.log("expiry \(info.expiresAt), \(scheduled.count) reminders")
    return scheduled
  }
}
