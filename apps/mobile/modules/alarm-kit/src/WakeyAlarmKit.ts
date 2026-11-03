import { NativeModule, requireNativeModule } from 'expo';

import type { AuthorizationState, ScheduledAlarm, Timings, WakeSession } from './WakeyAlarmKit.types';

declare class WakeyAlarmKitModule extends NativeModule {
  getAuthorizationState(): AuthorizationState;
  requestAuthorization(): Promise<AuthorizationState>;
  /** @param fireDateMs Unix epoch milliseconds. Resolves to the new alarm id. */
  scheduleAlarm(fireDateMs: number, title: string): Promise<string>;
  cancelAlarm(id: string): void;
  listAlarms(): ScheduledAlarm[];
  getActiveSession(): WakeSession | null;
  /** Cancels all pending snooze/re-ring alarms. Returns false if there was no open session. */
  completeSession(): boolean;
  setTimings(snoozeSeconds: number, reRingSeconds: number): void;
  getTimings(): Timings;
  getDebugLog(): string[];
  clearDebugLog(): void;
}

export default requireNativeModule<WakeyAlarmKitModule>('WakeyAlarmKit');
