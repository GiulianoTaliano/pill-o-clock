import ExpoModulesCore
import Foundation
#if canImport(AlarmKit)
import AlarmKit
import ActivityKit // AlertConfiguration.AlertSound lives here
import SwiftUI     // Color
#endif

// AlarmKit (iOS 26+) dose alarms for Pill O-Clock.
//
// A plain alert alarm: system-rendered on the Lock Screen / Dynamic Island,
// rings through the silent switch and Focus modes, with only a Stop button.
// Deliberately NO secondary button and NO countdown/snooze: those need App
// Intents compiled into the app target and a widget extension. The dose's
// regular notification (scheduled alongside by the JS side) keeps the
// Take / Snooze / Skip actions.
//
// The module is registered on every iOS version; each function checks
// `#available(iOS 26.0, *)` and the frameworks are weak-linked (podspec), so
// the app still launches on iOS 15.1–25.

public class ExpoAlarmKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoAlarmKit")

    Function("isSupported") { () -> Bool in
      if #available(iOS 26.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("getAuthorizationStatus") { () -> String in
      if #available(iOS 26.0, *) {
        return DoseAlarmKit.status(AlarmManager.shared.authorizationState)
      }
      return "unsupported"
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      if #available(iOS 26.0, *) {
        let state = try await AlarmManager.shared.requestAuthorization()
        return DoseAlarmKit.status(state)
      }
      return "unsupported"
    }

    AsyncFunction("schedule") { (alarm: DoseAlarmRecord) async throws in
      guard #available(iOS 26.0, *) else { throw AlarmKitUnavailableException() }
      guard let uuid = UUID(uuidString: alarm.id) else {
        throw InvalidAlarmIdException(alarm.id)
      }
      try await DoseAlarmKit.schedule(id: uuid, alarm: alarm)
    }

    AsyncFunction("cancel") { (id: String) in
      guard #available(iOS 26.0, *), let uuid = UUID(uuidString: id) else { return }
      DoseAlarmKit.cancel(uuid)
    }

    AsyncFunction("cancelAll") { () in
      guard #available(iOS 26.0, *) else { return }
      DoseAlarmKit.cancelAll()
    }

    AsyncFunction("getScheduledIds") { () -> [String] in
      guard #available(iOS 26.0, *) else { return [] }
      return DoseAlarmKit.scheduledIds()
    }
  }
}

/// Mirrors AlarmKitAlarm in src/ExpoAlarmKitModule.ts.
struct DoseAlarmRecord: Record {
  @Field var id: String = ""
  @Field var fireTimestamp: Double = 0
  @Field var title: String = ""
  @Field var stopLabel: String = "Stop"
  @Field var tintColor: String? = nil
  @Field var soundName: String? = nil
}

final class AlarmKitUnavailableException: Exception {
  override var reason: String { "AlarmKit requires iOS 26" }
}

final class InvalidAlarmIdException: GenericException<String> {
  override var reason: String { "Invalid alarm id (expected a UUID): \(param)" }
}

#if canImport(AlarmKit)
/// No per-alarm data is needed: the JS side keeps the dose ↔ alarm mapping.
@available(iOS 26.0, *)
struct DoseAlarmMetadata: AlarmMetadata {}

@available(iOS 26.0, *)
enum DoseAlarmKit {
  static func status(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "denied"
    }
  }

  static func schedule(id: UUID, alarm: DoseAlarmRecord) async throws {
    // Xcode 26.0 SDK: the (title:stopButton:) initializer is the one that
    // exists. From iOS 26.1 the system draws its own Stop button and ignores
    // this one, which is fine.
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: alarm.title),
      stopButton: AlarmButton(
        text: LocalizedStringResource(stringLiteral: alarm.stopLabel),
        textColor: .white,
        systemImageName: "stop.circle"
      )
    )
    let attributes = AlarmAttributes<DoseAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert),
      tintColor: color(hex: alarm.tintColor) ?? .blue
    )
    // Initializer form, as used by flutter_alarmkit and
    // react-native-nitro-ios-alarm-kit (both build against AlarmKit 26.0).
    let configuration = AlarmManager.AlarmConfiguration<DoseAlarmMetadata>(
      schedule: .fixed(Date(timeIntervalSince1970: alarm.fireTimestamp / 1000)),
      attributes: attributes,
      sound: sound(named: alarm.soundName)
    )
    _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
  }

  static func cancel(_ id: UUID) {
    // stop() silences an alarm that is ringing right now; cancel() removes a
    // scheduled one. Either may throw for an id that is not in that state.
    try? AlarmManager.shared.stop(id: id)
    try? AlarmManager.shared.cancel(id: id)
  }

  static func cancelAll() {
    guard let alarms = try? AlarmManager.shared.alarms else { return }
    for alarm in alarms { cancel(alarm.id) }
  }

  /// Lowercased, to compare with the ids generated on the JS side.
  static func scheduledIds() -> [String] {
    guard let alarms = try? AlarmManager.shared.alarms else { return [] }
    return alarms.map { $0.id.uuidString.lowercased() }
  }

  /// Bundled sound (file name WITH extension, < 30 s). iOS 26.0 played an
  /// error tone for custom sounds (fixed in 26.1), so 26.0 gets the default.
  private static func sound(named name: String?) -> AlertConfiguration.AlertSound {
    guard let name, !name.isEmpty else { return .default }
    if #available(iOS 26.1, *) {
      return .named(name)
    }
    return .default
  }

  private static func color(hex: String?) -> Color? {
    guard var s = hex?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let value = UInt32(s, radix: 16) else { return nil }
    return Color(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }
}
#endif
