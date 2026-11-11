// Copied into the iOS app target by the withWakeyAlarmKit config plugin.
// App Intents must be compiled in the app target so Xcode extracts their metadata;
// the system can't run an AlarmKit stop/secondary intent it has no metadata for.
import AlarmKit
import AppIntents
import Foundation
internal import WakeyAlarmKit

struct WakeyStopIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Stop alarm"
  static let isDiscoverable = false
  static let supportedModes: IntentModes = .background

  @Parameter(title: "Alarm ID")
  var alarmID: String

  init() {}

  init(alarmID: String) {
    self.alarmID = alarmID
  }

  func perform() async throws -> some IntentResult {
    await WakeyAlarmController.shared.handleStop(alarmID: alarmID)
    return .result()
  }
}

struct WakeyStartChallengeIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Start challenge"
  static let isDiscoverable = false
  static let supportedModes: IntentModes = .foreground

  @Parameter(title: "Alarm ID")
  var alarmID: String

  init() {}

  init(alarmID: String) {
    self.alarmID = alarmID
  }

  func perform() async throws -> some IntentResult {
    await WakeyAlarmController.shared.handleStartChallenge(alarmID: alarmID)
    return .result()
  }
}

/// Shortcuts action for the "Refresh Wakey" shortcut, placed right after SideStore's
/// "Refresh All Apps" (which stops the shortcut if the refresh fails). SideStore's refresh
/// doesn't change the app bundle, so this is how the app learns its new expiry date.
struct WakeyRecordRefreshIntent: AppIntent {
  static let title: LocalizedStringResource = "Record SideStore Refresh"
  static let description = IntentDescription(
    "Run right after SideStore's Refresh All Apps so Wakey knows the app was re-signed and when it expires next.")
  static let supportedModes: IntentModes = .background

  init() {}

  func perform() async throws -> some IntentResult {
    await WakeySigning.recordRefresh()
    return .result()
  }
}

/// Looked up by WakeyAlarmController via NSClassFromString("WakeyIntentProvider").
@objc(WakeyIntentProvider)
final class WakeyIntentProvider: NSObject, WakeyIntentProviding {
  override required init() {
    super.init()
  }

  func stopIntent(alarmID: String) -> any LiveActivityIntent {
    WakeyStopIntent(alarmID: alarmID)
  }

  func startChallengeIntent(alarmID: String) -> any LiveActivityIntent {
    WakeyStartChallengeIntent(alarmID: alarmID)
  }
}
