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

/// A wake-up "session": the original alarm plus every snooze / re-ring alarm scheduled
/// because the challenge wasn't finished yet. Only completing the challenge ends it.
public struct WakeySession: Codable {
  public var sessionId: String
  public var originAlarmId: String
  public var title: String
  /// "ringing" (alarm went off, no challenge started), "challenging", or "completed"
  public var state: String
  public var followUpAlarmIds: [String]
  public var startedAt: Date
  public var completedAt: Date?

  func contains(alarmId: String) -> Bool {
    originAlarmId == alarmId || followUpAlarmIds.contains(alarmId)
  }

  func asDictionary() -> [String: Any] {
    var d: [String: Any] = [
      "sessionId": sessionId,
      "originAlarmId": originAlarmId,
      "title": title,
      "state": state,
      "followUpAlarmIds": followUpAlarmIds,
      "startedAt": startedAt.timeIntervalSince1970 * 1000,
    ]
    if let completedAt { d["completedAt"] = completedAt.timeIntervalSince1970 * 1000 }
    return d
  }
}

public final class WakeyAlarmController: @unchecked Sendable {
  public static let shared = WakeyAlarmController()

  private let manager = AlarmManager.shared
  private let defaults = UserDefaults.standard
  private let lock = NSLock()

  private enum Key {
    static let session = "wakey.session"
    static let titles = "wakey.alarmTitles"
    static let handled = "wakey.handledAlarmIds"
    static let log = "wakey.debugLog"
    static let snoozeSeconds = "wakey.snoozeSeconds"
    static let reRingSeconds = "wakey.reRingSeconds"
  }

  private lazy var intentProvider: WakeyIntentProviding? = {
    guard let cls = NSClassFromString("WakeyIntentProvider") as? WakeyIntentProviding.Type else {
      log("ERROR: WakeyIntentProvider class not found in app target")
      return nil
    }
    return cls.init()
  }()

  // MARK: - Settings

  public var snoozeSeconds: Int {
    get { (defaults.object(forKey: Key.snoozeSeconds) as? Int) ?? 300 }
    set { defaults.set(newValue, forKey: Key.snoozeSeconds) }
  }

  public var reRingSeconds: Int {
    get { (defaults.object(forKey: Key.reRingSeconds) as? Int) ?? 60 }
    set { defaults.set(newValue, forKey: Key.reRingSeconds) }
  }

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

  // MARK: - Scheduling

  @discardableResult
  public func scheduleAlarm(at date: Date, title: String, id: UUID = UUID()) async throws -> String {
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      secondaryButton: AlarmButton(
        text: "Start challenge",
        textColor: .white,
        systemImageName: "brain.head.profile"
      ),
      secondaryButtonBehavior: .custom
    )
    let attributes = AlarmAttributes<WakeyAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert, countdown: nil, paused: nil),
      metadata: WakeyAlarmMetadata(),
      tintColor: .orange
    )
    let idString = id.uuidString
    let config = AlarmManager.AlarmConfiguration<WakeyAlarmMetadata>(
      countdownDuration: nil,
      schedule: .fixed(date),
      attributes: attributes,
      stopIntent: intentProvider?.stopIntent(alarmID: idString),
      secondaryIntent: intentProvider?.startChallengeIntent(alarmID: idString),
      sound: .default
    )
    _ = try await manager.schedule(id: id, configuration: config)
    setTitle(title, for: idString)
    log("scheduled \(short(idString)) '\(title)' at \(date.formatted(date: .omitted, time: .standard))")
    return idString
  }

  public func cancelAlarm(id: String) {
    guard let uuid = UUID(uuidString: id) else { return }
    do {
      try manager.cancel(id: uuid)
      log("cancelled \(short(id))")
    } catch {
      log("cancel \(short(id)) failed: \(error.localizedDescription)")
    }
  }

  public func listAlarms() -> [[String: Any]] {
    let alarms = (try? manager.alarms) ?? []
    let titles = defaults.dictionary(forKey: Key.titles) as? [String: String] ?? [:]
    return alarms.map { alarm in
      var d: [String: Any] = [
        "id": alarm.id.uuidString,
        "state": String(describing: alarm.state),
        "title": titles[alarm.id.uuidString] ?? "",
      ]
      if case .fixed(let date)? = alarm.schedule {
        d["fireDate"] = date.timeIntervalSince1970 * 1000
      }
      return d
    }
  }

  // MARK: - Intent handlers (called from the app-target intents)

  /// "Start challenge" pressed on the ringing alarm: silence it, schedule the snooze,
  /// and mark the session as challenging. The intent then opens the app.
  public func handleStartChallenge(alarmID: String) async {
    log("START CHALLENGE pressed on \(short(alarmID))")
    markHandled(alarmID)
    if let uuid = UUID(uuidString: alarmID) {
      try? manager.stop(id: uuid)
    }
    var session = currentOrNewSession(for: alarmID)
    session.state = "challenging"
    saveSession(session)
    await scheduleFollowUp(in: snoozeSeconds, reason: "snooze", session: session)
  }

  /// Alarm stopped (system Stop button). If the challenge isn't done, ring again soon.
  public func handleStop(alarmID: String) async {
    if consumeHandled(alarmID) {
      log("stop on \(short(alarmID)) ignored (already handled by Start challenge)")
      return
    }
    log("STOP pressed on \(short(alarmID))")
    var session = currentOrNewSession(for: alarmID)
    if session.state == "completed" {
      log("session already completed, not re-ringing")
      return
    }
    if session.state != "challenging" { session.state = "ringing" }
    saveSession(session)
    await scheduleFollowUp(in: reRingSeconds, reason: "re-ring", session: session)
  }

  // MARK: - Sessions

  public func activeSession() -> WakeySession? {
    guard let s = loadSession(), s.state != "completed" else { return nil }
    return s
  }

  /// Challenge solved: cancel every pending follow-up alarm and close the session.
  public func completeSession() -> Bool {
    guard var session = loadSession(), session.state != "completed" else { return false }
    for id in session.followUpAlarmIds { cancelAlarm(id: id) }
    session.state = "completed"
    session.completedAt = Date()
    saveSession(session)
    log("CHALLENGE COMPLETED, session \(short(session.sessionId)) closed")
    return true
  }

  // MARK: - Debug log

  public func debugLog() -> [String] {
    defaults.stringArray(forKey: Key.log) ?? []
  }

  public func clearDebugLog() {
    defaults.removeObject(forKey: Key.log)
  }

  public func log(_ message: String) {
    lock.lock(); defer { lock.unlock() }
    let stamp = Date().formatted(date: .omitted, time: .standard)
    var entries = defaults.stringArray(forKey: Key.log) ?? []
    entries.append("\(stamp)  \(message)")
    if entries.count > 200 { entries.removeFirst(entries.count - 200) }
    defaults.set(entries, forKey: Key.log)
  }

  // MARK: - Private

  private func scheduleFollowUp(in seconds: Int, reason: String, session: WakeySession) async {
    let date = Date().addingTimeInterval(TimeInterval(seconds))
    do {
      let id = try await scheduleAlarm(at: date, title: "\(session.title) (\(reason))")
      var updated = loadSession() ?? session
      updated.followUpAlarmIds.append(id)
      saveSession(updated)
    } catch {
      log("ERROR scheduling \(reason): \(error.localizedDescription)")
    }
  }

  private func currentOrNewSession(for alarmID: String) -> WakeySession {
    if let s = loadSession(), s.state != "completed", s.contains(alarmId: alarmID) {
      return s
    }
    let title = (defaults.dictionary(forKey: Key.titles) as? [String: String])?[alarmID] ?? "Alarm"
    let s = WakeySession(
      sessionId: UUID().uuidString,
      originAlarmId: alarmID,
      title: title.replacingOccurrences(of: #" \((snooze|re-ring)\)$"#, with: "", options: .regularExpression),
      state: "ringing",
      followUpAlarmIds: [],
      startedAt: Date(),
      completedAt: nil
    )
    log("new session \(short(s.sessionId)) for \(short(alarmID))")
    return s
  }

  private func loadSession() -> WakeySession? {
    guard let data = defaults.data(forKey: Key.session) else { return nil }
    return try? JSONDecoder().decode(WakeySession.self, from: data)
  }

  private func saveSession(_ session: WakeySession) {
    if let data = try? JSONEncoder().encode(session) {
      defaults.set(data, forKey: Key.session)
    }
  }

  private func setTitle(_ title: String, for id: String) {
    var titles = defaults.dictionary(forKey: Key.titles) as? [String: String] ?? [:]
    titles[id] = title
    defaults.set(titles, forKey: Key.titles)
  }

  private func markHandled(_ id: String) {
    var ids = Set(defaults.stringArray(forKey: Key.handled) ?? [])
    ids.insert(id)
    defaults.set(Array(ids), forKey: Key.handled)
  }

  private func consumeHandled(_ id: String) -> Bool {
    var ids = Set(defaults.stringArray(forKey: Key.handled) ?? [])
    guard ids.remove(id) != nil else { return false }
    defaults.set(Array(ids), forKey: Key.handled)
    return true
  }

  private func short(_ id: String) -> String { String(id.prefix(8)) }
}
