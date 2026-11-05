import { describe, expect, it } from 'vitest';

import { createAlarm, watchdogOccurrences } from '../src';

// Wednesday 2026-11-04 22:00 New York (the tests run in America/New_York).
const NOW = new Date(2026, 10, 4, 22, 0).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('watchdogOccurrences', () => {
  it('lists a daily alarm for the next 7 days', () => {
    const a = { ...createAlarm({ id: 'a', hour: 7, minute: 0, days: [0, 1, 2, 3, 4, 5, 6] }), activeSince: 0 };
    const times = watchdogOccurrences([a], NOW).map((o) => o.at);
    expect(times).toHaveLength(7);
    expect(times[0]).toBe(at(5, 7));
    expect(times[6]).toBe(at(11, 7));
  });

  it('only weekdays for a weekday alarm, sorted across alarms', () => {
    const weekdays = { ...createAlarm({ id: 'w', hour: 7, minute: 0, days: [1, 2, 3, 4, 5] }), activeSince: 0 };
    const sat = { ...createAlarm({ id: 's', hour: 9, minute: 30, days: [6] }), activeSince: 0 };
    const occ = watchdogOccurrences([sat, weekdays], NOW);
    expect(occ.map((o) => o.alarmId)).toEqual(['w', 'w', 's', 'w', 'w', 'w']);
    expect(occ[2]?.at).toBe(at(7, 9, 30));
  });

  it('a one-off alarm rings once, at the first time after it was set', () => {
    const once = { ...createAlarm({ id: 'o', hour: 6, minute: 15, days: [] }), activeSince: NOW - 60_000 };
    expect(watchdogOccurrences([once], NOW).map((o) => o.at)).toEqual([at(5, 6, 15)]);
    // Already rang: nothing left.
    expect(watchdogOccurrences([once], at(5, 6, 16))).toEqual([]);
  });

  it('skips disabled alarms', () => {
    const off = { ...createAlarm({ id: 'x', hour: 7, minute: 0, days: [1] }), enabled: false, activeSince: 0 };
    expect(watchdogOccurrences([off], NOW)).toEqual([]);
  });
});
