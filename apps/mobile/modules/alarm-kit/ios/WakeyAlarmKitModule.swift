import ExpoModulesCore

struct AlarmSpecRecord: Record {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var hour: Int = 7
  @Field var minute: Int = 0
  @Field var days: [Int] = []
  @Field var snoozeMinutes: Int = 5

  var spec: AlarmSpec {
    AlarmSpec(id: id, label: label, hour: hour, minute: minute, days: days, snoozeMinutes: snoozeMinutes)
  }
}

struct PunishmentSettingsRecord: Record {
  @Field var enabled: Bool = false
  @Field var webhookUrl: String = ""
  @Field var userName: String = ""
  @Field var currentStreak: Int = 0
}

public class WakeyAlarmKitModule: Module {
  private var controller: WakeyAlarmController { .shared }

  public func definition() -> ModuleDefinition {
    Name("WakeyAlarmKit")

    Function("getAuthorizationState") { () -> String in
      self.controller.authorizationState
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      try await self.controller.requestAuthorization()
    }

    /// Pass every *enabled* alarm; anything else is unscheduled.
    AsyncFunction("syncAlarms") { (alarms: [AlarmSpecRecord]) async in
      await self.controller.syncAlarms(alarms.map(\.spec))
    }

    AsyncFunction("scheduleTestAlarm") { (alarm: AlarmSpecRecord, seconds: Double) async throws -> String in
      try await self.controller.scheduleTestAlarm(spec: alarm.spec, seconds: seconds)
    }

    Function("listAlarms") { () -> [[String: Any]] in
      self.controller.listAlarms()
    }

    Function("getActiveSession") { () -> [String: Any]? in
      self.controller.activeSession()?.asDictionary()
    }

    Function("getHistory") { () -> [[String: Any]] in
      self.controller.history().map { $0.asDictionary() }
    }

    Function("completeSession") { (sessionId: String) -> [String: Any]? in
      self.controller.completeSession(sessionId: sessionId)?.asDictionary()
    }

    Function("recordMissed") { (appAlarmId: String, label: String, firstRangAtMs: Double) -> [String: Any] in
      self.controller.recordMissed(
        appAlarmId: appAlarmId, label: label, firstRangAt: Date(timeIntervalSince1970: firstRangAtMs / 1000)
      ).asDictionary()
    }

    Function("claimPunishment") { (sessionId: String) -> Bool in
      self.controller.claimPunishment(sessionId: sessionId)
    }

    Function("setPunishmentSettings") { (settings: PunishmentSettingsRecord) in
      self.controller.punishmentSettings = PunishmentSettings(
        enabled: settings.enabled, webhookUrl: settings.webhookUrl, userName: settings.userName,
        currentStreak: settings.currentStreak)
    }

    Function("getItem") { (key: String) -> String? in
      self.controller.getItem(key)
    }

    Function("setItem") { (key: String, value: String?) in
      self.controller.setItem(key, value)
    }

    Function("getSigningInfo") { () -> [String: Any]? in
      WakeySigning.info()?.asDictionary()
    }

    AsyncFunction("scheduleExpiryReminders") { () async -> [Double] in
      await WakeySigning.scheduleReminders()
    }

    Function("getDebugLog") { () -> [String] in
      self.controller.debugLog()
    }

    Function("clearDebugLog") {
      self.controller.clearDebugLog()
    }
  }
}
