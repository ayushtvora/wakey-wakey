import ActivityKit
import AlarmKit
import AppIntents
import Foundation
import SwiftUI

/// Empty metadata payload attached to every Wakey alarm.
public struct WakeyAlarmMetadata: AlarmMetadata {
  public init() {}
}

/// Implemented in the *app target* (see app-target/WakeyIntents.swift) because Xcode only
/// extracts App Intent metadata from the app target, not from CocoaPods static libraries.
/// The controller locates the implementation at runtime via its fixed Objective-C name.
public protocol WakeyIntentProviding: AnyObject {
  init()
  func stopIntent(alarmID: String) -> any LiveActivityIntent
  func startChallengeIntent(alarmID: String) -> any LiveActivityIntent
}

/// The subset of an app alarm the native side needs to schedule it and handle its buttons.
public struct AlarmSpec: Codable, Equatable {
  public var id: String
  public var label: String
  public var hour: Int
  public var minute: Int
  /// 0 = Sunday … 6 = Saturday. Empty = one-off.
  public var days: [Int]
  public var snoozeMinutes: Int

  public init(id: String, label: String, hour: Int, minute: Int, days: [Int], snoozeMinutes: Int) {
    self.id = id
    self.label = label
    self.hour = hour
    self.minute = minute
    self.days = days
    self.snoozeMinutes = snoozeMinutes
  }
}

/// What a scheduled AlarmKit alarm is for.
struct ScheduledInfo: Codable {
  enum Kind: String, Codable { case main, test, followUp }
  var kind: Kind
  /// The app alarm this belongs to.
  var appAlarmId: String
  var label: String
  var snoozeMinutes: Int
  /// Fixed fire date (test and follow-up alarms).
  var fireDate: Date?
  /// For main alarms: the spec it was scheduled from, to detect changes.
  var spec: AlarmSpec?
}

/// One morning: the alarm ringing until the challenge chain is done.
public struct WakeSession: Codable {
  public var sessionId: String
  public var appAlarmId: String
  public var label: String
  public var isTest: Bool
  /// When the alarm first rang (its scheduled time). The 10-minute deadline counts from here.
  public var firstRangAt: Date
  /// "ringing" (no challenge started yet), "challenging", "completed", or "missed"
  /// (recorded later by the app because no button was ever pressed).
  public var state: String
  public var followUpAlarmIds: [String]
  public var completedAt: Date?
  public var punishedAt: Date?

  var isOpen: Bool { completedAt == nil && state != "missed" }

  func asDictionary() -> [String: Any] {
    var d: [String: Any] = [
      "sessionId": sessionId,
      "appAlarmId": appAlarmId,
      "label": label,
      "isTest": isTest,
      "firstRangAt": firstRangAt.timeIntervalSince1970 * 1000,
      "state": state,
      "followUpAlarmIds": followUpAlarmIds,
    ]
    if let completedAt { d["completedAt"] = completedAt.timeIntervalSince1970 * 1000 }
    if let punishedAt { d["punishedAt"] = punishedAt.timeIntervalSince1970 * 1000 }
    return d
  }
}

public struct PunishmentSettings: Codable {
  public var enabled: Bool = false
  public var webhookUrl: String = ""
  public var userName: String = ""
  /// Current win streak, kept up to date by the app; used in the message.
  public var currentStreak: Int = 0
}

public final class WakeyAlarmController: @unchecked Sendable {
  public static let shared = WakeyAlarmController()

  /// Rules shared with @wakey/core (wake.ts). Keep in sync.
  public static let reRingSeconds: TimeInterval = 60
  public static let punishAfter: TimeInterval = 10 * 60
  /// A ring more than this long after an open session's first ring starts a new session.
  static let sessionMaxAge: TimeInterval = 6 * 60 * 60
  static let maxStoredSessions = 300

  private let manager = AlarmManager.shared
  private let defaults = UserDefaults.standard
  private let lock = NSRecursiveLock()

  private enum Key {
    static let scheduled = "wakey.scheduled"
    static let sessions = "wakey.sessions"
    static let handled = "wakey.handledAlarmIds"
    static let punishment = "wakey.punishment"
    static let log = "wakey.debugLog"
    static let kvPrefix = "wakey.kv."
  }

  init() {
    if WakeyBackup.restoreIfEmpty(into: defaults) {
      log("Restored settings, alarms and history from the Keychain backup")
    }
  }

  /// Copies the app's data to the Keychain so a reinstall gets it back (see WakeyBackup).
  private func backUp() {
    WakeyBackup.save(from: defaults)
  }

  private lazy var intentProvider: WakeyIntentProviding? = {
    guard let cls = NSClassFromString("WakeyIntentProvider") as? WakeyIntentProviding.Type else {
      log("ERROR: WakeyIntentProvider class not found in app target")
      return nil
    }
    return cls.init()
  }()

  // MARK: - Authorization

  public var authorizationState: String {
    switch manager.authorizationState {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }

  public func requestAuthorization() async throws -> String {
    _ = try await manager.requestAuthorization()
    return authorizationState
  }

  // MARK: - Syncing app alarms

  /// Makes AlarmKit match the app's enabled alarms. Unchanged alarms are left alone, and an
  /// alarm that is ringing right now is never cancelled.
  public func syncAlarms(_ specs: [AlarmSpec]) async {
    let live = Dictionary(uniqueKeysWithValues: ((try? manager.alarms) ?? []).map { ($0.id.uuidString, $0) })
    var scheduled = loadScheduled()
    let wanted = Dictionary(specs.map { ($0.id.uppercased(), $0) }, uniquingKeysWith: { a, _ in a })

    // Remove main alarms that were deleted or disabled.
    for (id, info) in scheduled where info.kind == .main && wanted[id] == nil {
      if live[id]?.state == .alerting { continue }
      cancel(id: id)
      scheduled[id] = nil
      log("sync: removed \(short(id))")
    }

    for (id, spec) in wanted {
      let isLive = live[id] != nil
      if isLive, scheduled[id]?.spec == spec { continue }
      if live[id]?.state == .alerting { continue }
      if isLive { cancel(id: id) }
      do {
        try await scheduleMain(id: id, spec: spec)
        scheduled[id] = ScheduledInfo(
          kind: .main, appAlarmId: spec.id, label: spec.label, snoozeMinutes: spec.snoozeMinutes,
          fireDate: nil, spec: spec)
        log("sync: scheduled \(short(id)) '\(spec.label)' \(spec.hour):\(String(format: "%02d", spec.minute)) days=\(spec.days)")
      } catch {
        log("sync: ERROR scheduling \(short(id)): \(error.localizedDescription)")
      }
    }

    // Forget bookkeeping for alarms AlarmKit no longer has (fired one-offs, follow-ups).
    let liveNow = Set(((try? manager.alarms) ?? []).map { $0.id.uuidString })
    for (id, info) in scheduled where info.kind != .main && !liveNow.contains(id) {
      scheduled[id] = nil
    }
    saveScheduled(scheduled)
  }

  /// Rings once after `seconds`, behaving exactly like the given alarm (same challenge chain),
  /// but its session is marked as a test so it doesn't affect the streak.
  public func scheduleTestAlarm(spec: AlarmSpec, seconds: Double) async throws -> String {
    let id = UUID()
    let date = Date().addingTimeInterval(seconds)
    try await schedule(id: id, title: "\(spec.label) (test)", schedule: .fixed(date))
    var scheduled = loadScheduled()
    scheduled[id.uuidString] = ScheduledInfo(
      kind: .test, appAlarmId: spec.id, label: spec.label, snoozeMinutes: spec.snoozeMinutes,
      fireDate: date, spec: nil)
    saveScheduled(scheduled)
    log("test alarm \(short(id.uuidString)) for '\(spec.label)' in \(Int(seconds))s")
    return id.uuidString
  }

  public func listAlarms() -> [[String: Any]] {
    let scheduled = loadScheduled()
    return ((try? manager.alarms) ?? []).map { alarm in
      let info = scheduled[alarm.id.uuidString]
      var d: [String: Any] = [
        "id": alarm.id.uuidString,
        "state": String(describing: alarm.state),
        "kind": info?.kind.rawValue ?? "unknown",
        "label": info?.label ?? "",
      ]
      if let appAlarmId = info?.appAlarmId { d["appAlarmId"] = appAlarmId }
      if case .fixed(let date)? = alarm.schedule { d["fireDate"] = date.timeIntervalSince1970 * 1000 }
      return d
    }
  }

  // MARK: - Intent handlers (called from the app-target intents)

  /// "Start challenge" pressed: silence the ring, schedule the snooze, open the app.
  public func handleStartChallenge(alarmID: String) async {
    log("START CHALLENGE on \(short(alarmID))")
    markHandled(alarmID)
    if let uuid = UUID(uuidString: alarmID) { try? manager.stop(id: uuid) }
    guard var session = sessionFor(alarmID: alarmID) else { return }
    session.state = "challenging"
    saveSession(session)
    let snooze = TimeInterval(snoozeMinutes(for: alarmID, session: session) * 60)
    await scheduleFollowUp(in: snooze, reason: "snooze", sessionId: session.sessionId)
    await punishIfOverdue(sessionId: session.sessionId)
  }

  /// Alarm stopped with the system Stop button. If the challenge isn't done, ring again in 1 minute.
  public func handleStop(alarmID: String) async {
    if consumeHandled(alarmID) {
      log("stop on \(short(alarmID)) ignored (handled by Start challenge)")
      return
    }
    log("STOP on \(short(alarmID))")
    guard var session = sessionFor(alarmID: alarmID) else { return }
    if session.completedAt != nil {
      log("session already completed, not re-ringing")
      return
    }
    if session.state != "challenging" { session.state = "ringing" }
    saveSession(session)
    await scheduleFollowUp(in: Self.reRingSeconds, reason: "re-ring", sessionId: session.sessionId)
    await punishIfOverdue(sessionId: session.sessionId)
  }

  // MARK: - Sessions

  /// The open session the user should be completing (at most one).
  public func activeSession() -> WakeSession? {
    let now = Date()
    return loadSessions().last { $0.isOpen && now.timeIntervalSince($0.firstRangAt) < Self.sessionMaxAge }
  }

  public func history() -> [WakeSession] { loadSessions() }

  /// Challenge chain finished: cancel every pending follow-up alarm and close the session.
  public func completeSession(sessionId: String) -> WakeSession? {
    lock.lock(); defer { lock.unlock() }
    guard var session = loadSessions().first(where: { $0.sessionId == sessionId }), session.isOpen else {
      return nil
    }
    for id in session.followUpAlarmIds { cancel(id: id) }
    session.state = "completed"
    session.completedAt = Date()
    saveSession(session)
    log("COMPLETED session \(short(sessionId)) after \(Int(Date().timeIntervalSince(session.firstRangAt)))s")
    return session
  }

  /// Records a morning where the alarm rang but no button was ever pressed (detected by the app).
  public func recordMissed(appAlarmId: String, label: String, firstRangAt: Date) -> WakeSession {
    lock.lock(); defer { lock.unlock() }
    let session = WakeSession(
      sessionId: UUID().uuidString, appAlarmId: appAlarmId, label: label, isTest: false,
      firstRangAt: firstRangAt, state: "missed", followUpAlarmIds: [], completedAt: nil, punishedAt: nil)
    saveSession(session)
    log("recorded missed '\(label)' at \(firstRangAt.formatted(date: .abbreviated, time: .shortened))")
    return session
  }

  // MARK: - Punishment

  public var punishmentSettings: PunishmentSettings {
    get {
      guard let data = defaults.data(forKey: Key.punishment),
        let s = try? JSONDecoder().decode(PunishmentSettings.self, from: data)
      else { return PunishmentSettings() }
      return s
    }
    set {
      if let data = try? JSONEncoder().encode(newValue) { defaults.set(data, forKey: Key.punishment) }
      backUp()
    }
  }

  /// Atomically marks the session as punished. Returns false if it already was (or doesn't exist),
  /// so the app and the intents can never both send the message.
  public func claimPunishment(sessionId: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard var session = loadSessions().first(where: { $0.sessionId == sessionId }),
      session.punishedAt == nil, session.completedAt == nil
    else { return false }
    session.punishedAt = Date()
    saveSession(session)
    return true
  }

  private func punishIfOverdue(sessionId: String) async {
    let settings = punishmentSettings
    guard settings.enabled, let url = URL(string: settings.webhookUrl), !settings.webhookUrl.isEmpty else { return }
    guard let session = loadSessions().first(where: { $0.sessionId == sessionId }),
      session.completedAt == nil, session.punishedAt == nil,
      Date().timeIntervalSince(session.firstRangAt) > Self.punishAfter
    else { return }
    guard claimPunishment(sessionId: sessionId) else { return }

    // Same wording as discordPunishmentPayload in @wakey/core.
    let minutes = Int(Date().timeIntervalSince(session.firstRangAt) / 60)
    let name = settings.userName.isEmpty ? "Someone" : settings.userName
    let streak = session.isTest ? 0 : settings.currentStreak
    let streakLine = streak > 0 ? " They just lost a \(streak)-day streak." : ""
    let prefix = session.isTest ? "[TEST] " : ""
    let content =
      "\(prefix)⏰ \(name) still hasn't gotten up. Their \"\(session.label)\" alarm has been going for \(minutes) minutes.\(streakLine)"

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["username": "Wakey Wakey", "content": content])
    request.timeoutInterval = 15
    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      log("PUNISHMENT sent to Discord (HTTP \(status))")
    } catch {
      log("PUNISHMENT failed: \(error.localizedDescription)")
    }
  }

  // MARK: - Small key-value store for the app (alarms JSON, settings)

  public func getItem(_ key: String) -> String? { defaults.string(forKey: Key.kvPrefix + key) }
  public func setItem(_ key: String, _ value: String?) {
    if let value { defaults.set(value, forKey: Key.kvPrefix + key) } else { defaults.removeObject(forKey: Key.kvPrefix + key) }
    backUp()
  }

  // MARK: - Debug log

  public func debugLog() -> [String] { defaults.stringArray(forKey: Key.log) ?? [] }
  public func clearDebugLog() { defaults.removeObject(forKey: Key.log) }

  public func log(_ message: String) {
    lock.lock(); defer { lock.unlock() }
    let stamp = Date().formatted(date: .omitted, time: .standard)
    var entries = defaults.stringArray(forKey: Key.log) ?? []
    entries.append("\(stamp)  \(message)")
    if entries.count > 300 { entries.removeFirst(entries.count - 300) }
    defaults.set(entries, forKey: Key.log)
  }

  // MARK: - Private: scheduling

  private func scheduleMain(id: String, spec: AlarmSpec) async throws {
    guard let uuid = UUID(uuidString: id) else { throw NSError(domain: "Wakey", code: 1) }
    let weekdays: [Locale.Weekday] = spec.days.sorted().compactMap { Self.weekday($0) }
    let relative = Alarm.Schedule.Relative(
      time: .init(hour: spec.hour, minute: spec.minute),
      repeats: weekdays.isEmpty ? .never : .weekly(weekdays)
    )
    try await schedule(id: uuid, title: spec.label, schedule: .relative(relative))
  }

  private func schedule(id: UUID, title: String, schedule: Alarm.Schedule) async throws {
    let attributes = AlarmAttributes<WakeyAlarmMetadata>(
      presentation: AlarmPresentation(alert: makeAlert(title: title), countdown: nil, paused: nil),
      metadata: WakeyAlarmMetadata(),
      tintColor: .orange
    )
    let config = AlarmManager.AlarmConfiguration<WakeyAlarmMetadata>(
      countdownDuration: nil,
      schedule: schedule,
      attributes: attributes,
      stopIntent: intentProvider?.stopIntent(alarmID: id.uuidString),
      secondaryIntent: intentProvider?.startChallengeIntent(alarmID: id.uuidString),
      sound: .default
    )
    _ = try await manager.schedule(id: id, configuration: config)
  }

  private func makeAlert(title: String) -> AlarmPresentation.Alert {
    let titleResource = LocalizedStringResource(stringLiteral: title)
    let challengeButton = AlarmButton(
      text: "Start challenge",
      textColor: .white,
      systemImageName: "brain.head.profile"
    )
    if #available(iOS 26.1, *) {
      // 26.1+: the system supplies the Stop button itself.
      return AlarmPresentation.Alert(
        title: titleResource,
        secondaryButton: challengeButton,
        secondaryButtonBehavior: .custom
      )
    } else {
      return AlarmPresentation.Alert(
        title: titleResource,
        stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle"),
        secondaryButton: challengeButton,
        secondaryButtonBehavior: .custom
      )
    }
  }

  private func scheduleFollowUp(in seconds: TimeInterval, reason: String, sessionId: String) async {
    guard let session = loadSessions().first(where: { $0.sessionId == sessionId }) else { return }
    let id = UUID()
    let date = Date().addingTimeInterval(seconds)
    do {
      try await schedule(id: id, title: "\(session.label) (\(reason))", schedule: .fixed(date))
      lock.lock()
      var scheduled = loadScheduled()
      scheduled[id.uuidString] = ScheduledInfo(
        kind: .followUp, appAlarmId: session.appAlarmId, label: session.label,
        snoozeMinutes: snoozeMinutes(for: id.uuidString, session: session), fireDate: date, spec: nil)
      saveScheduled(scheduled)
      if var updated = loadSessions().first(where: { $0.sessionId == sessionId }) {
        updated.followUpAlarmIds.append(id.uuidString)
        saveSession(updated)
      }
      lock.unlock()
      log("\(reason) \(short(id.uuidString)) in \(Int(seconds))s")
    } catch {
      log("ERROR scheduling \(reason): \(error.localizedDescription)")
    }
  }

  private func cancel(id: String) {
    guard let uuid = UUID(uuidString: id) else { return }
    try? manager.cancel(id: uuid)
  }

  private static func weekday(_ day: Int) -> Locale.Weekday? {
    switch day {
    case 0: return .sunday
    case 1: return .monday
    case 2: return .tuesday
    case 3: return .wednesday
    case 4: return .thursday
    case 5: return .friday
    case 6: return .saturday
    default: return nil
    }
  }

  // MARK: - Private: sessions

  /// Finds the open session this ringing alarm belongs to, or starts a new one.
  private func sessionFor(alarmID: String) -> WakeSession? {
    lock.lock(); defer { lock.unlock() }
    let now = Date()
    let key = alarmID.uppercased()
    let info = loadScheduled()[key]

    if let existing = loadSessions().last(where: {
      $0.isOpen && now.timeIntervalSince($0.firstRangAt) < Self.sessionMaxAge
        && ($0.followUpAlarmIds.contains(key) || (info != nil && $0.appAlarmId == info!.appAlarmId))
    }) {
      return existing
    }
    if info?.kind == .followUp {
      // Follow-up for a session that was already completed or expired: nothing to do.
      log("follow-up \(short(key)) has no open session")
      return nil
    }

    let firstRangAt: Date
    if let fireDate = info?.fireDate {
      firstRangAt = fireDate
    } else if let spec = info?.spec {
      firstRangAt = Self.mostRecentOccurrence(hour: spec.hour, minute: spec.minute, before: now)
    } else {
      firstRangAt = now
    }
    let session = WakeSession(
      sessionId: UUID().uuidString,
      appAlarmId: info?.appAlarmId ?? key,
      label: info?.label ?? "Alarm",
      isTest: info?.kind == .test,
      firstRangAt: firstRangAt,
      state: "ringing",
      followUpAlarmIds: [],
      completedAt: nil,
      punishedAt: nil
    )
    saveSession(session)
    log("new session \(short(session.sessionId)) for '\(session.label)'\(session.isTest ? " (test)" : "")")
    return session
  }

  static func mostRecentOccurrence(hour: Int, minute: Int, before now: Date) -> Date {
    let cal = Calendar.current
    let today = cal.date(bySettingHour: hour, minute: minute, second: 0, of: now) ?? now
    if today <= now { return today }
    return cal.date(byAdding: .day, value: -1, to: today) ?? today
  }

  private func snoozeMinutes(for alarmID: String, session: WakeSession) -> Int {
    let scheduled = loadScheduled()
    if let m = scheduled[alarmID.uppercased()]?.snoozeMinutes { return max(1, m) }
    if let m = scheduled.values.first(where: { $0.kind == .main && $0.appAlarmId == session.appAlarmId })?.snoozeMinutes {
      return max(1, m)
    }
    return 5
  }

  private func loadSessions() -> [WakeSession] {
    guard let data = defaults.data(forKey: Key.sessions) else { return [] }
    return (try? JSONDecoder().decode([WakeSession].self, from: data)) ?? []
  }

  /// Inserts or replaces by sessionId.
  private func saveSession(_ session: WakeSession) {
    lock.lock(); defer { lock.unlock() }
    var sessions = loadSessions()
    if let i = sessions.firstIndex(where: { $0.sessionId == session.sessionId }) {
      sessions[i] = session
    } else {
      sessions.append(session)
    }
    sessions.sort { $0.firstRangAt < $1.firstRangAt }
    if sessions.count > Self.maxStoredSessions { sessions.removeFirst(sessions.count - Self.maxStoredSessions) }
    if let data = try? JSONEncoder().encode(sessions) { defaults.set(data, forKey: Key.sessions) }
    backUp()
  }

  private func loadScheduled() -> [String: ScheduledInfo] {
    guard let data = defaults.data(forKey: Key.scheduled) else { return [:] }
    return (try? JSONDecoder().decode([String: ScheduledInfo].self, from: data)) ?? [:]
  }

  private func saveScheduled(_ scheduled: [String: ScheduledInfo]) {
    if let data = try? JSONEncoder().encode(scheduled) { defaults.set(data, forKey: Key.scheduled) }
  }

  private func markHandled(_ id: String) {
    lock.lock(); defer { lock.unlock() }
    var ids = Set(defaults.stringArray(forKey: Key.handled) ?? [])
    ids.insert(id.uppercased())
    defaults.set(Array(ids), forKey: Key.handled)
  }

  private func consumeHandled(_ id: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    var ids = Set(defaults.stringArray(forKey: Key.handled) ?? [])
    guard ids.remove(id.uppercased()) != nil else { return false }
    defaults.set(Array(ids), forKey: Key.handled)
    return true
  }

  private func short(_ id: String) -> String { String(id.prefix(8)) }
}
