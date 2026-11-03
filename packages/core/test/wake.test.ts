import { describe, expect, it } from 'vitest';

import {
  PUNISH_AFTER_MS,
  bestStreak,
  currentStreak,
  discordPunishmentPayload,
  isDiscordWebhookUrl,
  outcome,
  shouldPunish,
  type WakeRecord,
} from '../src';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const T0 = Date.UTC(2026, 10, 1, 12, 0);

function rec(day: number, completedAfterMin?: number, extra: Partial<WakeRecord> = {}): WakeRecord {
  const firstRangAt = T0 + day * DAY;
  return {
    sessionId: `s${day}`,
    alarmId: 'a',
    alarmLabel: 'Work',
    firstRangAt,
    completedAt: completedAfterMin === undefined ? undefined : firstRangAt + completedAfterMin * MIN,
    ...extra,
  };
}

describe('outcome and punishment', () => {
  it('won when completed within 10 minutes (inclusive)', () => {
    expect(outcome(rec(0, 10), T0 + DAY)).toBe('won');
    expect(outcome(rec(0, 10.01), T0 + DAY)).toBe('late');
  });

  it('pending until the deadline passes, then late', () => {
    const r = rec(0);
    expect(outcome(r, T0 + PUNISH_AFTER_MS)).toBe('pending');
    expect(shouldPunish(r, T0 + PUNISH_AFTER_MS)).toBe(false);
    expect(outcome(r, T0 + PUNISH_AFTER_MS + 1)).toBe('late');
    expect(shouldPunish(r, T0 + PUNISH_AFTER_MS + 1)).toBe(true);
  });

  it('punishes at most once and never after completion', () => {
    const late = T0 + 30 * MIN;
    expect(shouldPunish(rec(0, undefined, { punishedAt: T0 + 11 * MIN }), late)).toBe(false);
    expect(shouldPunish(rec(0, 20), late)).toBe(false);
  });
});

describe('streaks', () => {
  const now = T0 + 10 * DAY;

  it('counts consecutive wins back from the latest decided morning', () => {
    const records = [rec(0, 3), rec(1, 15), rec(2, 2), rec(3, 9), rec(4, 1)];
    expect(currentStreak(records, now)).toBe(3);
    expect(bestStreak(records, now)).toBe(3);
  });

  it('a missed morning (never completed) breaks the streak', () => {
    expect(currentStreak([rec(0, 1), rec(1, 1), rec(2)], now)).toBe(0);
    expect(bestStreak([rec(0, 1), rec(1, 1), rec(2)], now)).toBe(2);
  });

  it('a session still inside its 10 minutes is ignored', () => {
    const ringingNow = rec(10);
    expect(currentStreak([rec(8, 1), rec(9, 2), ringingNow], T0 + 10 * DAY + 2 * MIN)).toBe(2);
  });

  it('is order-independent and empty-safe', () => {
    expect(currentStreak([rec(2, 1), rec(0, 50), rec(1, 1)], now)).toBe(2);
    expect(currentStreak([], now)).toBe(0);
  });
});

describe('discord', () => {
  it('builds a message with minutes elapsed and the lost streak', () => {
    const payload = discordPunishmentPayload(rec(0), { name: 'Ayush', now: T0 + 12.5 * MIN, lostStreak: 6 });
    expect(payload.username).toBe('Wakey Wakey');
    expect(payload.content).toContain('Ayush');
    expect(payload.content).toContain('"Work"');
    expect(payload.content).toContain('12 minutes');
    expect(payload.content).toContain('6-day streak');
  });

  it('omits the streak line when there was none', () => {
    expect(discordPunishmentPayload(rec(0), { name: 'A', now: T0 + 11 * MIN, lostStreak: 0 }).content).not.toContain(
      'streak',
    );
  });

  it('recognizes webhook URLs', () => {
    expect(isDiscordWebhookUrl('https://discord.com/api/webhooks/123456/abc_DEF-ghi')).toBe(true);
    expect(isDiscordWebhookUrl('https://canary.discord.com/api/webhooks/1/x')).toBe(true);
    expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/1/x')).toBe(false);
    expect(isDiscordWebhookUrl('https://evil.com/api/webhooks/1/x')).toBe(false);
  });
});
