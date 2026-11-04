import Foundation
import UserNotifications

/// Free-Apple-ID installs stop launching when their provisioning profile expires (7 days),
/// and their AlarmKit alarms stop ringing with them. This reads the expiry date from the
/// profile embedded in the app and schedules local reminders before it.
enum WakeySigning {
  struct Info {
    let expiresAt: Date
    let createdAt: Date?
    let teamName: String?

    func asDictionary() -> [String: Any] {
      var d: [String: Any] = ["expiresAt": expiresAt.timeIntervalSince1970 * 1000]
      if let createdAt { d["createdAt"] = createdAt.timeIntervalSince1970 * 1000 }
      if let teamName { d["teamName"] = teamName }
      return d
    }
  }

  /// nil when there is no embedded profile (simulator, or an App Store build).
  static func provisioningInfo() -> Info? {
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
    return Info(
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

  /// Idempotent: keeps existing reminders if they were made for this same expiry date.
  /// Returns the reminder times (epoch ms) now pending, or [] without notification permission.
  static func scheduleReminders() async -> [Double] {
    let center = UNUserNotificationCenter.current()
    guard let info = provisioningInfo() else { return [] }
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
        "Reinstall it with Sideloadly (or refresh in SideStore) before then. After it expires, the app won't open and your alarms won't ring."
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
