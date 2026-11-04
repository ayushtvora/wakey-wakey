import { validateChain } from './challenges';
import type { ChallengeChain } from './challenges/types';

/** 0 = Sunday … 6 = Saturday (same as Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export interface Alarm {
  id: string;
  label: string;
  /** 0–23, local time */
  hour: number;
  /** 0–59 */
  minute: number;
  /** Days the alarm repeats on. Empty = one-off (rings at the next occurrence of hour:minute). */
  days: Weekday[];
  enabled: boolean;
  /** Challenges that must all be completed, in order, to turn the alarm off. */
  chain: ChallengeChain;
  /** How long "Start challenge" silences the alarm before it rings again. */
  snoozeMinutes: number;
}

export const DEFAULT_SNOOZE_MINUTES = 5;

export function createAlarm(partial: Partial<Alarm> & Pick<Alarm, 'id'>): Alarm {
  return {
    label: 'Alarm',
    hour: 7,
    minute: 0,
    days: [],
    enabled: true,
    chain: [{ type: 'math', difficulty: 'medium', problems: 3 }],
    snoozeMinutes: DEFAULT_SNOOZE_MINUTES,
    ...partial,
  };
}

/**
 * Validates an alarm, returning a list of problems (empty when valid).
 */
export function validateAlarm(alarm: Alarm): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(alarm.hour) || alarm.hour < 0 || alarm.hour > 23) errors.push('hour must be 0–23');
  if (!Number.isInteger(alarm.minute) || alarm.minute < 0 || alarm.minute > 59) errors.push('minute must be 0–59');
  if (alarm.days.some((d) => !WEEKDAYS.includes(d))) errors.push('days must be 0–6');
  if (new Set(alarm.days).size !== alarm.days.length) errors.push('days must not repeat');
  if (!Number.isInteger(alarm.snoozeMinutes) || alarm.snoozeMinutes < 1 || alarm.snoozeMinutes > 30) {
    errors.push('snoozeMinutes must be 1–30');
  }
  errors.push(...validateChain(alarm.chain));
  return errors;
}

/**
 * The next time this alarm should ring strictly after `from`, in the device's local time zone.
 * Returns null for disabled alarms.
 *
 * DST: on spring-forward days a time that doesn't exist (e.g. 02:30) rings at the first valid
 * instant after it (03:30, which is what JS Date normalizes to); on fall-back days the first
 * occurrence of an ambiguous time is used.
 */
export function nextFireDate(alarm: Pick<Alarm, 'hour' | 'minute' | 'days' | 'enabled'>, from: Date): Date | null {
  if (!alarm.enabled) return null;
  // Look up to 8 days ahead: enough to wrap past today's time back to the same weekday.
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + offset,
      alarm.hour,
      alarm.minute,
      0,
      0,
    );
    if (candidate.getTime() <= from.getTime()) continue;
    // Use the calendar day we asked for, not candidate.getDay(): DST normalization never
    // moves a whole-hour shift across midnight for wall-clock alarm times.
    const weekday = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 12).getDay() as Weekday;
    if (alarm.days.length === 0 || alarm.days.includes(weekday)) return candidate;
  }
  return null;
}

/** "Every day", "Weekdays", "Weekends", "Once" (one-off) or e.g. "Mon, Wed, Fri". */
export function describeDays(days: readonly Weekday[]): string {
  const set = new Set(days);
  if (set.size === 0) return 'Once';
  if (set.size === 7) return 'Every day';
  const weekdays: Weekday[] = [1, 2, 3, 4, 5];
  if (set.size === 5 && weekdays.every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Monday-first ordering reads more naturally for a week.
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => set.has(d as Weekday))
    .map((d) => names[d])
    .join(', ');
}
