import Foundation
import Security

/// Copy of the app's data (settings, alarms, wake history) in the Keychain.
///
/// Deleting a sideloaded app wipes its UserDefaults, and with them the alarms, settings
/// (including the watchdog URL and key) and the streak history. Keychain items survive the
/// delete, and a reinstall signed by the same Apple ID with the same bundle ID can read them,
/// so a fresh install restores everything on its first launch.
enum WakeyBackup {
  private static let service = "wakey.backup"
  private static let account = "state"

  /// UserDefaults keys that are backed up. AlarmKit's own scheduled alarms are not: they are
  /// deleted with the app and the app schedules them again from the restored alarms.
  static let keys = ["wakey.kv.alarms", "wakey.kv.settings", "wakey.sessions", "wakey.punishment"]

  /// Writes the current values of `keys` to the Keychain.
  static func save(from defaults: UserDefaults) {
    var snapshot: [String: Any] = [:]
    for key in keys {
      if let value = defaults.object(forKey: key) { snapshot[key] = value }
    }
    guard !snapshot.isEmpty,
      let data = try? PropertyListSerialization.data(fromPropertyList: snapshot, format: .binary, options: 0)
    else { return }

    let query = baseQuery()
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      // Alarm buttons run app code while the phone is locked.
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil)
    }
  }

  /// On a fresh install (none of `keys` present), copies the Keychain backup into UserDefaults.
  /// Returns true if something was restored.
  static func restoreIfEmpty(into defaults: UserDefaults) -> Bool {
    guard keys.allSatisfy({ defaults.object(forKey: $0) == nil }) else { return false }
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data,
      let snapshot = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
    else { return false }
    for key in keys {
      if let value = snapshot[key] { defaults.set(value, forKey: key) }
    }
    return !snapshot.isEmpty
  }

  private static func baseQuery() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}
