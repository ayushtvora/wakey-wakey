export type AuthorizationState = 'authorized' | 'denied' | 'notDetermined' | 'unknown';

export type SessionState = 'ringing' | 'challenging' | 'completed' | 'missed';

/** What the native side needs to schedule an alarm. */
export interface AlarmSpec {
  id: string;
  label: string;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday; empty = one-off */
  days: number[];
  snoozeMinutes: number;
}

/** One morning, from first ring until the challenge chain is done. */
export interface WakeSession {
  sessionId: string;
  /** The app alarm (Alarm.id) this session belongs to. */
  appAlarmId: string;
  label: string;
  isTest: boolean;
  /** epoch ms */
  firstRangAt: number;
  state: SessionState;
  followUpAlarmIds: string[];
  completedAt?: number;
  punishedAt?: number;
}

export interface ScheduledAlarm {
  id: string;
  /** AlarmKit state, e.g. "scheduled", "alerting" */
  state: string;
  kind: 'main' | 'test' | 'followUp' | 'unknown';
  label: string;
  appAlarmId?: string;
  fireDate?: number;
}

/** Free Apple ID installs expire 7 days after signing; alarms stop ringing then. */
export interface SigningInfo {
  /** epoch ms */
  expiresAt: number;
  /** epoch ms (when the app was signed) */
  createdAt?: number;
  teamName?: string;
}

export interface PunishmentSettings {
  enabled: boolean;
  webhookUrl: string;
  userName: string;
  currentStreak: number;
}
