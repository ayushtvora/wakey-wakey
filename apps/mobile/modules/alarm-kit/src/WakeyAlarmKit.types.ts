export type AuthorizationState = 'authorized' | 'denied' | 'notDetermined' | 'unknown';

export type SessionState = 'ringing' | 'challenging' | 'completed';

export interface WakeSession {
  sessionId: string;
  originAlarmId: string;
  title: string;
  state: SessionState;
  followUpAlarmIds: string[];
  /** epoch ms */
  startedAt: number;
  completedAt?: number;
}

export interface ScheduledAlarm {
  id: string;
  /** AlarmKit state, e.g. "scheduled", "alerting" */
  state: string;
  title: string;
  /** epoch ms, present for fixed-date alarms */
  fireDate?: number;
}

export interface Timings {
  snoozeSeconds: number;
  reRingSeconds: number;
}
