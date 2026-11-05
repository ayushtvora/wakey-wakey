// What the watchdog decides, separated from Cloudflare so it can be unit tested.
import {
  PUNISH_AFTER_MS,
  WATCHDOG_HORIZON_MS,
  WATCHDOG_MATCH_WINDOW_MS,
  deadline,
  discordPunishmentPayload,
  isDiscordWebhookUrl,
  type WatchdogCompletion,
  type WatchdogOccurrence,
  type WatchdogStatus,
  type WatchdogSyncRequest,
} from '@wakey/core';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Extra wait past the deadline so a completion sent at 9:59 has time to arrive. */
export const GRACE_MS = MINUTE;
/** Decided occurrences are kept this long (for corrections and the status page). */
export const KEEP_MS = 3 * DAY;
/** Never punish for a morning older than this (e.g. the Worker was down for days). */
export const MAX_PUNISH_AGE_MS = DAY;
/** Discord failures are retried this many times, a minute apart. */
export const MAX_SEND_ATTEMPTS = 3;

export interface Occurrence extends WatchdogOccurrence {
  completedAt?: number;
  /** Found unfinished after the deadline. */
  lateAt?: number;
  /** Discord accepted the punishment. */
  sentAt?: number;
  /** Discord accepted the "they did get up after all" correction. */
  correctedAt?: number;
  sendAttempts?: number;
}

export interface Config {
  userName: string;
  webhookUrl: string;
  enabled: boolean;
  streak: number;
}

export interface State {
  config: Config;
  occurrences: Occurrence[];
  lastSyncAt?: number;
}

export const EMPTY_STATE: State = {
  config: { userName: '', webhookUrl: '', enabled: false, streak: 0 },
  occurrences: [],
};

export interface Message {
  occurrence: Occurrence;
  kind: 'punish' | 'correct';
  payload: { username: string; content: string };
}

const sameOccurrence = (a: WatchdogOccurrence, b: WatchdogOccurrence) => a.alarmId === b.alarmId && a.at === b.at;
const checkAt = (o: Occurrence) => o.at + PUNISH_AFTER_MS + GRACE_MS;
const finishedInTime = (o: Occurrence) => o.completedAt !== undefined && o.completedAt <= deadline({ firstRangAt: o.at });
/** Not finished in time, and not yet dealt with. */
const open = (o: Occurrence) => !finishedInTime(o) && o.lateAt === undefined && o.sentAt === undefined;

export function canSend(config: Config): boolean {
  return config.enabled && isDiscordWebhookUrl(config.webhookUrl);
}

/**
 * Occurrences that have already rung (or are tests) are kept as they are: changing the
 * schedule can't cancel an alarm that's already going. Everything in the future is replaced.
 */
export function applySync(state: State, req: WatchdogSyncRequest, now: number): State {
  const kept = state.occurrences.filter((o) => o.at <= now || o.isTest);
  for (const o of req.occurrences) {
    if (o.at <= now || o.at > now + WATCHDOG_HORIZON_MS) continue;
    if (kept.some((k) => sameOccurrence(k, o))) continue;
    kept.push({ alarmId: o.alarmId, label: o.label, at: o.at });
  }
  const next: State = {
    config: { userName: req.userName, webhookUrl: req.webhookUrl, enabled: req.enabled, streak: req.streak },
    occurrences: kept,
    lastSyncAt: now,
  };
  return prune(applyCompletions(next, req.completions), now);
}

export function addTest(state: State, o: WatchdogOccurrence, now: number): State {
  if (state.occurrences.some((k) => sameOccurrence(k, o))) return state;
  const occurrences = [...state.occurrences, { alarmId: o.alarmId, label: o.label, at: o.at, isTest: true }];
  return prune({ ...state, occurrences }, now);
}

export function applyCompletions(state: State, completions: readonly WatchdogCompletion[]): State {
  const occurrences = state.occurrences.map((o) => {
    if (o.completedAt !== undefined) return o;
    const c = completions.find(
      (c) => c.alarmId === o.alarmId && Math.abs(c.firstRangAt - o.at) < WATCHDOG_MATCH_WINDOW_MS,
    );
    return c ? { ...o, completedAt: c.completedAt } : o;
  });
  return { ...state, occurrences };
}

function prune(state: State, now: number): State {
  const occurrences = state.occurrences
    .filter((o) => o.at > now - KEEP_MS)
    .sort((a, b) => a.at - b.at);
  return { ...state, occurrences };
}

/** Discord messages that are due now: overdue punishments and corrections for them. */
export function dueMessages(state: State, now: number): Message[] {
  const { config } = state;
  if (!canSend(config)) return [];
  const name = config.userName.trim() || 'Someone';
  const messages: Message[] = [];
  let streak = config.streak;
  for (const o of state.occurrences) {
    if (open(o) && now >= checkAt(o)) {
      if (now - o.at > MAX_PUNISH_AGE_MS) continue;
      const payload = discordPunishmentPayload(
        { sessionId: `${o.alarmId}@${o.at}`, alarmId: o.alarmId, alarmLabel: o.label, firstRangAt: o.at },
        { name, now, lostStreak: o.isTest ? 0 : streak },
      );
      if (o.isTest) payload.content = `[TEST] ${payload.content}`;
      else streak = 0;
      messages.push({ occurrence: o, kind: 'punish', payload });
    } else if (
      o.sentAt !== undefined &&
      o.correctedAt === undefined &&
      finishedInTime(o)
    ) {
      const minutes = Math.max(1, Math.round((o.completedAt! - o.at) / MINUTE));
      messages.push({
        occurrence: o,
        kind: 'correct',
        payload: {
          username: 'Wakey Wakey',
          content: `${o.isTest ? '[TEST] ' : ''}✅ Correction: ${name} did get up. "${o.label}" was finished ${minutes} minute${minutes === 1 ? '' : 's'} after it rang, but their phone couldn't report it in time.`,
        },
      });
    }
  }
  return messages;
}

/** Records the result of sending `m`. */
export function recordSend(state: State, m: Message, ok: boolean, now: number): State {
  const occurrences = state.occurrences.map((o) => {
    if (!sameOccurrence(o, m.occurrence)) return o;
    if (m.kind === 'correct') return ok ? { ...o, correctedAt: now } : o;
    if (ok) return { ...o, sentAt: now, lateAt: now };
    const sendAttempts = (o.sendAttempts ?? 0) + 1;
    // Give up after a few tries so a broken webhook doesn't retry forever.
    return sendAttempts >= MAX_SEND_ATTEMPTS ? { ...o, sendAttempts, lateAt: now } : { ...o, sendAttempts };
  });
  const lostStreak = m.kind === 'punish' && ok && !m.occurrence.isTest;
  return { ...state, occurrences, config: lostStreak ? { ...state.config, streak: 0 } : state.config };
}

/** Marks overdue occurrences as late without a message (punishment off, or too old). */
export function markLate(state: State, now: number): State {
  const occurrences = state.occurrences.map((o) =>
    open(o) && now >= checkAt(o) && (!canSend(state.config) || now - o.at > MAX_PUNISH_AGE_MS)
      ? { ...o, lateAt: now }
      : o,
  );
  return { ...state, occurrences };
}

/** When the Durable Object alarm should next wake up, if at all. */
export function nextWakeAt(state: State, now: number): number | undefined {
  let next: number | undefined;
  for (const o of state.occurrences) {
    let at: number | undefined;
    if (open(o)) {
      // Still waiting for this one; retries after a failed send come a minute later.
      at = Math.max(checkAt(o), o.sendAttempts ? now + MINUTE : 0);
    }
    if (at !== undefined && (next === undefined || at < next)) next = at;
  }
  return next;
}

export function status(state: State, now: number): WatchdogStatus {
  const { config } = state;
  return {
    lastSyncAt: state.lastSyncAt,
    enabled: config.enabled,
    hasWebhook: isDiscordWebhookUrl(config.webhookUrl),
    nextCheckAt: nextWakeAt(state, now),
    upcoming: state.occurrences
      .filter((o) => o.at > now)
      .slice(0, 5)
      .map((o) => ({ label: o.label, at: o.at, isTest: o.isTest })),
    recent: state.occurrences
      .filter((o) => o.at <= now && (o.completedAt !== undefined || o.lateAt !== undefined))
      .slice(-5)
      .reverse()
      .map((o) => ({
        label: o.label,
        at: o.at,
        isTest: o.isTest,
        result:
          o.correctedAt !== undefined
            ? 'corrected'
            : o.sentAt !== undefined
              ? 'punished'
              : finishedInTime(o)
                ? 'won'
                : 'late',
      })),
  };
}
