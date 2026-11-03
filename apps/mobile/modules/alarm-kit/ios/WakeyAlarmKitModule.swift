import ExpoModulesCore

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

    /// fireDateMs: Unix epoch milliseconds. Returns the new alarm id.
    AsyncFunction("scheduleAlarm") { (fireDateMs: Double, title: String) async throws -> String in
      let date = Date(timeIntervalSince1970: fireDateMs / 1000)
      return try await self.controller.scheduleAlarm(at: date, title: title)
    }

    Function("cancelAlarm") { (id: String) in
      self.controller.cancelAlarm(id: id)
    }

    Function("listAlarms") { () -> [[String: Any]] in
      self.controller.listAlarms()
    }

    Function("getActiveSession") { () -> [String: Any]? in
      self.controller.activeSession()?.asDictionary()
    }

    Function("completeSession") { () -> Bool in
      self.controller.completeSession()
    }

    Function("setTimings") { (snoozeSeconds: Int, reRingSeconds: Int) in
      self.controller.snoozeSeconds = snoozeSeconds
      self.controller.reRingSeconds = reRingSeconds
    }

    Function("getTimings") { () -> [String: Int] in
      ["snoozeSeconds": self.controller.snoozeSeconds, "reRingSeconds": self.controller.reRingSeconds]
    }

    Function("getDebugLog") { () -> [String] in
      self.controller.debugLog()
    }

    Function("clearDebugLog") {
      self.controller.clearDebugLog()
    }
  }
}
