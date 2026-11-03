/**
 * Wake-up outcomes, punishment timing and the win streak. Kept platform-independent so the
 * app, the future home-server watchdog, and the Pi clock all agree on the rules.
 */

/** Challenge must be completed within this long after the alarm first rings. */
export const PUNISH_AFTER_MS = 10 * 60 * 1000;

/** Pressing Stop without finishing the challenge rings again after this long. */
export const RE_RING_SECONDS = 60;

export interface WakeRecord {
  sessionId: string;
  alarmId: string;
  alarmLabel: string;
  /** epoch ms: when the alarm first rang (its scheduled fire time). */
  firstRangAt: number;
  /** epoch ms: when the full challenge chain was completed. */
  completedAt?: number;
  /** epoch ms: when the punishment was sent. A session is punished at most once. */
  punishedAt?: number;
}

export type WakeOutcome = 'won' | 'late' | 'pending';

export function deadline(record: Pick<WakeRecord, 'firstRangAt'>): number {
  return record.firstRangAt + PUNISH_AFTER_MS;
}

export function outcome(record: WakeRecord, now: number): WakeOutcome {
  if (record.completedAt !== undefined) {
    return record.completedAt <= deadline(record) ? 'won' : 'late';
  }
  return now > deadline(record) ? 'late' : 'pending';
}

export function shouldPunish(record: WakeRecord, now: number): boolean {
  return record.punishedAt === undefined && record.completedAt === undefined && now > deadline(record);
}

/**
 * Consecutive won mornings, counting back from the most recent decided session.
 * Pending sessions (still inside the 10 minutes) don't break or extend the streak.
 */
export function currentStreak(records: readonly WakeRecord[], now: number): number {
  const decided = records
    .map((r) => ({ r, o: outcome(r, now) }))
    .filter(({ o }) => o !== 'pending')
    .sort((a, b) => b.r.firstRangAt - a.r.firstRangAt);
  let streak = 0;
  for (const { o } of decided) {
    if (o !== 'won') break;
    streak++;
  }
  return streak;
}

export function bestStreak(records: readonly WakeRecord[], now: number): number {
  const decided = records
    .map((r) => ({ r, o: outcome(r, now) }))
    .filter(({ o }) => o !== 'pending')
    .sort((a, b) => a.r.firstRangAt - b.r.firstRangAt);
  let best = 0;
  let run = 0;
  for (const { o } of decided) {
    run = o === 'won' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Body for a Discord webhook POST (https://discord.com/developers/docs/resources/webhook). */
export function discordPunishmentPayload(
  record: WakeRecord,
  opts: { name: string; now: number; lostStreak: number },
): { content: string; username: string } {
  const minutes = Math.floor((opts.now - record.firstRangAt) / 60000);
  const streakLine = opts.lostStreak > 0 ? ` They just lost a ${opts.lostStreak}-day streak.` : '';
  return {
    username: 'Wakey Wakey',
    content: `⏰ ${opts.name} still hasn't gotten up. Their "${record.alarmLabel}" alarm has been going for ${minutes} minutes.${streakLine}`,
  };
}

/** Discord webhook URLs look like https://discord.com/api/webhooks/{id}/{token}. */
export function isDiscordWebhookUrl(url: string): boolean {
  return /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url.trim());
}
