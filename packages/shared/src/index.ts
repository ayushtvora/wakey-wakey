export type ChallengeType = 'qr' | 'math' | 'reading' | 'puzzle';
export type AlarmRepeatMode = 'once' | 'daily' | 'weekdays' | 'custom';

export interface AlarmSchedule {
  id: string;
  userId: string;
  label: string;
  time: string;
  timezone: string;
  repeatMode: AlarmRepeatMode;
  enabled: boolean;
  challengeType: ChallengeType;
  challengeTimeoutSeconds: number;
}

export interface AlarmSyncPayload {
  userId: string;
  alarms: AlarmSchedule[];
  updatedAt: string;
}
