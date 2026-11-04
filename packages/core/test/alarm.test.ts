import { describe, expect, it } from 'vitest';

import { createAlarm, describeDays, nextFireDate, validateAlarm } from '../src';

// Tests run in America/New_York (see vitest.config.ts).
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('nextFireDate', () => {
  it('one-off alarm later today', () => {
    const next = nextFireDate({ hour: 7, minute: 30, days: [], enabled: true }, at(2026, 11, 3, 6, 0));
    expect(next).toEqual(at(2026, 11, 3, 7, 30));
  });

  it('one-off alarm already passed today rolls to tomorrow, across month end', () => {
    const next = nextFireDate({ hour: 7, minute: 0, days: [], enabled: true }, at(2026, 11, 30, 8, 0));
    expect(next).toEqual(at(2026, 12, 1, 7, 0));
  });

  it('exactly at fire time returns the next occurrence, not now', () => {
    const next = nextFireDate({ hour: 7, minute: 0, days: [], enabled: true }, at(2026, 11, 3, 7, 0));
    expect(next).toEqual(at(2026, 11, 4, 7, 0));
  });

  it('weekday alarm on Friday evening skips to Monday', () => {
    // 2026-11-06 is a Friday
    const next = nextFireDate({ hour: 6, minute: 45, days: [1, 2, 3, 4, 5], enabled: true }, at(2026, 11, 6, 20, 0));
    expect(next).toEqual(at(2026, 11, 9, 6, 45));
  });

  it('single weekday already passed today wraps a full week', () => {
    // 2026-11-03 is a Tuesday
    const next = nextFireDate({ hour: 7, minute: 0, days: [2], enabled: true }, at(2026, 11, 3, 9, 0));
    expect(next).toEqual(at(2026, 11, 10, 7, 0));
  });

  it('crosses the year boundary', () => {
    const next = nextFireDate({ hour: 0, minute: 5, days: [], enabled: true }, at(2026, 12, 31, 23, 59));
    expect(next).toEqual(at(2027, 1, 1, 0, 5));
  });

  it('disabled alarm never fires', () => {
    expect(nextFireDate({ hour: 7, minute: 0, days: [], enabled: false }, at(2026, 11, 3))).toBeNull();
  });

  it('keeps wall-clock time across fall-back DST (Nov 1 2026)', () => {
    const next = nextFireDate({ hour: 7, minute: 0, days: [], enabled: true }, at(2026, 10, 31, 22, 0));
    expect(next?.getHours()).toBe(7);
    expect(next?.getDate()).toBe(1);
    // 25-hour day: 9h of wall clock but 10h elapsed
    expect((next!.getTime() - at(2026, 10, 31, 22, 0).getTime()) / 3.6e6).toBe(10);
  });

  it('nonexistent spring-forward time rings just after the gap (Mar 8 2026, 02:30)', () => {
    const next = nextFireDate({ hour: 2, minute: 30, days: [], enabled: true }, at(2026, 3, 8, 0, 0));
    expect(next?.getDate()).toBe(8);
    expect(next?.getHours()).toBe(3);
    expect(next?.getMinutes()).toBe(30);
  });
});

describe('describeDays', () => {
  it.each([
    [[], 'Once'],
    [[0, 1, 2, 3, 4, 5, 6], 'Every day'],
    [[1, 2, 3, 4, 5], 'Weekdays'],
    [[6, 0], 'Weekends'],
    [[5, 1, 3], 'Mon, Wed, Fri'],
    [[0, 1], 'Mon, Sun'],
  ] as const)('%j → %s', (days, expected) => {
    expect(describeDays(days)).toBe(expected);
  });
});

describe('validateAlarm', () => {
  it('default alarm is valid', () => {
    expect(validateAlarm(createAlarm({ id: 'a' }))).toEqual([]);
  });

  it('reports bad fields and chain problems', () => {
    const errors = validateAlarm(createAlarm({ id: 'a', hour: 24, minute: -1, days: [1, 1], snoozeMinutes: 0, chain: [] }));
    expect(errors).toEqual([
      'hour must be 0–23',
      'minute must be 0–59',
      'days must not repeat',
      'snoozeMinutes must be 1–30',
      'add at least one challenge',
    ]);
  });
});
