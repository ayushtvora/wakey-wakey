import AlarmKit, { type SigningInfo } from '../../modules/alarm-kit';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type ExpiryLevel = 'ok' | 'soon' | 'urgent' | 'expired';

export interface ExpiryStatus extends SigningInfo {
  msLeft: number;
  level: ExpiryLevel;
}

// Native builds from before the expiry warning don't have these functions, and Wakey Dev
// can run this JavaScript on such a build.
const hasNative = () => typeof AlarmKit.getSigningInfo === 'function';

export function getExpiryStatus(now = Date.now()): ExpiryStatus | null {
  if (!hasNative()) return null;
  let info: SigningInfo | null = null;
  try {
    info = AlarmKit.getSigningInfo();
  } catch {
    return null;
  }
  if (!info) return null;
  const msLeft = info.expiresAt - now;
  const level: ExpiryLevel =
    msLeft <= 0 ? 'expired' : msLeft <= DAY ? 'urgent' : msLeft <= 3 * DAY ? 'soon' : 'ok';
  return { ...info, msLeft, level };
}

export function describeTimeLeft(ms: number): string {
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days`;
  if (ms >= 2 * HOUR) return `${Math.floor(ms / HOUR)} hours`;
  return `${Math.max(1, Math.round(ms / 60_000))} minutes`;
}

export async function scheduleExpiryReminders(): Promise<void> {
  if (typeof AlarmKit.scheduleExpiryReminders !== 'function') return;
  try {
    await AlarmKit.scheduleExpiryReminders();
  } catch {
    // Reminders are a convenience; never let them break reconcile.
  }
}
