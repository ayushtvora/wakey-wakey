import { NativeModule, requireNativeModule } from 'expo';

import type {
  AlarmSpec,
  AuthorizationState,
  PunishmentSettings,
  ScheduledAlarm,
  WakeSession,
} from './WakeyAlarmKit.types';

declare class WakeyAlarmKitModule extends NativeModule {
  getAuthorizationState(): AuthorizationState;
  requestAuthorization(): Promise<AuthorizationState>;
  /** Pass every enabled alarm; anything else is unscheduled. Ringing alarms are never touched. */
  syncAlarms(alarms: AlarmSpec[]): Promise<void>;
  /** Rings once after `seconds` with this alarm's behavior; its session is marked as a test. */
  scheduleTestAlarm(alarm: AlarmSpec, seconds: number): Promise<string>;
  listAlarms(): ScheduledAlarm[];
  getActiveSession(): WakeSession | null;
  getHistory(): WakeSession[];
  /** Cancels pending snooze/re-ring alarms. Returns null if the session wasn't open. */
  completeSession(sessionId: string): WakeSession | null;
  recordMissed(appAlarmId: string, label: string, firstRangAtMs: number): WakeSession;
  /** Atomically marks the session punished; false if it already was. */
  claimPunishment(sessionId: string): boolean;
  setPunishmentSettings(settings: PunishmentSettings): void;
  getItem(key: string): string | null;
  setItem(key: string, value: string | null): void;
  getDebugLog(): string[];
  clearDebugLog(): void;
}

export default requireNativeModule<WakeyAlarmKitModule>('WakeyAlarmKit');
