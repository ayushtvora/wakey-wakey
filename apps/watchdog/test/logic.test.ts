import type { WatchdogSyncRequest } from '@wakey/core';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATE,
  GRACE_MS,
  addTest,
  applySync,
  dueMessages,
  markLate,
  nextWakeAt,
  recordSend,
  status,
  type State,
} from '../src/logic';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 5, 12, 0); // a 7:00 alarm
const CHECK = T0 + 10 * MIN + GRACE_MS;
const WEBHOOK = 'https://discord.com/api/webhooks/123/abc-DEF';

function sync(over: Partial<WatchdogSyncRequest> = {}): WatchdogSyncRequest {
  return {
    userName: 'Ayush',
    webhookUrl: WEBHOOK,
    enabled: true,
    streak: 4,
    occurrences: [{ alarmId: 'a', label: 'Work', at: T0 }],
    completions: [],
    ...over,
  };
}

/** Synced the night before. */
const night = (over?: Partial<WatchdogSyncRequest>) => applySync(EMPTY_STATE, sync(over), T0 - 8 * 60 * MIN);

/** Runs the Durable Object alarm with every send succeeding. */
function fire(state: State, now: number, ok = true): { state: State; sent: string[] } {
  const sent: string[] = [];
  for (const m of dueMessages(state, now)) {
    sent.push(m.payload.content);
    state = recordSend(state, m, ok, now);
  }
  return { state: markLate(state, now), sent };
}

describe('watchdog', () => {
  it('wakes at the deadline and punishes an unfinished alarm once, with the streak', () => {
    let state = night();
    expect(nextWakeAt(state, T0)).toBe(CHECK);
    expect(fire(state, CHECK - 1).sent).toEqual([]);
    const r = fire(state, CHECK);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toContain('Ayush');
    expect(r.sent[0]).toContain('4-day streak');
    state = r.state;
    expect(fire(state, CHECK + MIN).sent).toEqual([]);
    expect(nextWakeAt(state, CHECK)).toBeUndefined();
    expect(state.config.streak).toBe(0);
  });

  it('does nothing when the alarm was finished in time', () => {
    let state = night();
    state = applySync(state, sync({ occurrences: [], completions: [{ alarmId: 'a', firstRangAt: T0, completedAt: T0 + 4 * MIN }] }), T0 + 4 * MIN);
    expect(fire(state, CHECK).sent).toEqual([]);
    expect(nextWakeAt(state, CHECK)).toBeUndefined();
    expect(status(state, CHECK).recent[0]?.result).toBe('won');
  });

  it('still punishes when the completion came after the deadline', () => {
    let state = night();
    state = applySync(state, sync({ occurrences: [], completions: [{ alarmId: 'a', firstRangAt: T0, completedAt: T0 + 10 * MIN + 20_000 }] }), T0 + 10 * MIN + 30_000);
    expect(fire(state, CHECK).sent).toHaveLength(1);
  });

  it('sends a correction when an in-time completion arrives after the punishment', () => {
    let state = fire(night(), CHECK).state;
    state = applySync(state, sync({ occurrences: [], completions: [{ alarmId: 'a', firstRangAt: T0, completedAt: T0 + 6 * MIN }] }), T0 + 60 * MIN);
    const r = fire(state, T0 + 60 * MIN);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toContain('Correction');
    expect(r.sent[0]).toContain('6 minutes');
    expect(fire(r.state, T0 + 61 * MIN).sent).toEqual([]);
    expect(status(r.state, T0 + 61 * MIN).recent[0]?.result).toBe('corrected');
  });

  it('keeps an alarm that already rang when the schedule changes', () => {
    let state = night();
    state = applySync(state, sync({ occurrences: [] }), T0 + 2 * MIN); // alarm switched off mid-ring
    expect(fire(state, CHECK).sent).toHaveLength(1);
  });

  it('drops future alarms that were removed from the schedule', () => {
    let state = night();
    state = applySync(state, sync({ occurrences: [] }), T0 - 60 * MIN);
    expect(state.occurrences).toEqual([]);
    expect(nextWakeAt(state, T0)).toBeUndefined();
  });

  it('marks it late without sending when punishment is off', () => {
    const r = fire(night({ enabled: false }), CHECK);
    expect(r.sent).toEqual([]);
    expect(nextWakeAt(r.state, CHECK)).toBeUndefined();
    expect(status(r.state, CHECK).recent[0]?.result).toBe('late');
  });

  it('does not punish mornings older than a day', () => {
    expect(fire(night(), T0 + 25 * 60 * MIN).sent).toEqual([]);
  });

  it('retries a failed Discord send a few times, then gives up', () => {
    let state = night();
    let r = fire(state, CHECK, false);
    expect(r.sent).toHaveLength(1);
    expect(nextWakeAt(r.state, CHECK)).toBe(CHECK + MIN);
    r = fire(r.state, CHECK + MIN, false);
    r = fire(r.state, CHECK + 2 * MIN, false);
    expect(nextWakeAt(r.state, CHECK + 2 * MIN)).toBeUndefined();
    expect(fire(r.state, CHECK + 3 * MIN).sent).toEqual([]);
  });

  it('test alarms are tagged, survive schedule syncs and keep the streak', () => {
    let state = addTest(night({ occurrences: [] }), { alarmId: 't', label: 'Test', at: T0 }, T0 - MIN);
    state = applySync(state, sync({ occurrences: [] }), T0 - 30_000);
    const r = fire(state, CHECK);
    expect(r.sent[0]).toMatch(/^\[TEST\]/);
    expect(r.sent[0]).not.toContain('streak');
    expect(r.state.config.streak).toBe(4);
  });

  it('only the first missed alarm of a run reports the lost streak', () => {
    const state = night({
      occurrences: [
        { alarmId: 'a', label: 'Work', at: T0 },
        { alarmId: 'b', label: 'Backup', at: T0 + MIN },
      ],
    });
    const r = fire(state, CHECK + MIN);
    expect(r.sent).toHaveLength(2);
    expect(r.sent[0]).toContain('4-day streak');
    expect(r.sent[1]).not.toContain('streak');
  });

  it('ignores alarm times beyond the horizon', () => {
    const far = T0 + 30 * 24 * 60 * MIN;
    expect(night({ occurrences: [{ alarmId: 'a', label: 'Work', at: far }] }).occurrences).toEqual([]);
  });
});
