// Runs whenever the app comes to the foreground: records mornings where the alarm was ignored,
// retires finished one-off alarms, updates the streak, and sends overdue punishments.
import {
  PUNISH_AFTER_MS,
  bestStreak,
  currentStreak,
  discordPunishmentPayload,
  isDiscordWebhookUrl,
  nextFireDate,
  shouldPunish,
  type WakeRecord,
} from '@wakey/core';

import AlarmKit, { type WakeSession } from '../../modules/alarm-kit';
import { scheduleExpiryReminders } from './signing';
import { getState, replaceAlarms, syncNative, updateSettings, type StoredAlarm } from './store';

const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** Don't send punishments for mornings older than this (e.g. the app wasn't opened for days). */
const MAX_PUNISH_AGE_MS = 24 * 60 * 60 * 1000;
/** A session within this of a scheduled time counts as that occurrence. */
const MATCH_WINDOW_MS = 5 * 60 * 1000;

export function toWakeRecord(s: WakeSession): WakeRecord {
  return {
    sessionId: s.sessionId,
    alarmId: s.appAlarmId,
    alarmLabel: s.label,
    firstRangAt: s.firstRangAt,
    completedAt: s.completedAt,
    punishedAt: s.punishedAt,
  };
}

export interface Streaks {
  current: number;
  best: number;
}

export function computeStreaks(history: WakeSession[], now = Date.now()): Streaks {
  const records = history.filter((s) => !s.isTest).map(toWakeRecord);
  return { current: currentStreak(records, now), best: bestStreak(records, now) };
}

/** Streak not counting still-open mornings, i.e. what would be lost if the open one fails. */
function streakAtRisk(history: WakeSession[], now: number): number {
  const decided = history.filter((s) => !s.isTest && (s.completedAt !== undefined || s.state === 'missed'));
  return currentStreak(decided.map(toWakeRecord), now);
}

/** Scheduled ring times of `alarm` in (from, to]. */
function occurrencesBetween(alarm: StoredAlarm, from: number, to: number): number[] {
  const result: number[] = [];
  let cursor = new Date(from);
  for (let i = 0; i < 64; i++) {
    const next = nextFireDate(alarm, cursor);
    if (!next || next.getTime() > to) break;
    result.push(next.getTime());
    cursor = next;
  }
  return result;
}

export async function sendDiscord(url: string, payload: { content: string; username: string }): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let running: Promise<void> | null = null;

/** Safe to call often; concurrent calls share one run. */
export function reconcile(): Promise<void> {
  running ??= doReconcile().finally(() => {
    running = null;
  });
  return running;
}

async function doReconcile(): Promise<void> {
  const now = Date.now();
  const { alarms, settings } = getState();
  let history = AlarmKit.getHistory();
  const checkedUntil = settings.lastReconciledAt ?? now;
  const decideBefore = now - PUNISH_AFTER_MS;

  // 1. Mornings where the alarm rang but no button was ever pressed.
  for (const alarm of alarms) {
    // Retired one-offs still need their single ring checked.
    if (!alarm.enabled && alarm.retiredOccurrence === undefined) continue;
    const from = Math.max(alarm.activeSince, checkedUntil, now - MAX_LOOKBACK_MS) - 1;
    const to = alarm.enabled ? decideBefore : Math.min(decideBefore, alarm.retiredOccurrence!);
    for (const occ of occurrencesBetween({ ...alarm, enabled: true }, from, to)) {
      const handled = history.some(
        (s) => s.appAlarmId === alarm.id && !s.isTest && Math.abs(s.firstRangAt - occ) < MATCH_WINDOW_MS,
      );
      if (!handled) AlarmKit.recordMissed(alarm.id, alarm.label, occ);
    }
  }
  updateSettings({ lastReconciledAt: Math.max(checkedUntil, decideBefore) });
  history = AlarmKit.getHistory();

  // 2. One-off alarms whose time has come are done (AlarmKit already removed them).
  let changed = false;
  const nextAlarms = alarms.map((a) => {
    if (!a.enabled || a.days.length > 0) return a;
    const fire = nextFireDate(a, new Date(a.activeSince));
    if (fire && fire.getTime() <= now) {
      changed = true;
      return { ...a, enabled: false, retiredOccurrence: fire.getTime() };
    }
    return a;
  });
  if (changed) replaceAlarms(nextAlarms);

  // 3. Keep native in sync (punishment settings incl. streak, scheduled alarms).
  const risk = streakAtRisk(history, now);
  const webhookOk = isDiscordWebhookUrl(settings.webhookUrl);
  AlarmKit.setPunishmentSettings({
    enabled: settings.punishmentEnabled && webhookOk,
    webhookUrl: settings.webhookUrl.trim(),
    userName: settings.userName.trim(),
    currentStreak: risk,
  });
  await syncNative();
  await scheduleExpiryReminders();

  // 4. Overdue mornings nobody has punished yet.
  if (!settings.punishmentEnabled || !webhookOk) return;
  for (const s of history) {
    if (now - s.firstRangAt > MAX_PUNISH_AGE_MS) continue;
    if (!shouldPunish(toWakeRecord(s), now)) continue;
    if (!AlarmKit.claimPunishment(s.sessionId)) continue;
    const payload = discordPunishmentPayload(toWakeRecord(s), {
      name: settings.userName.trim() || 'Someone',
      now,
      lostStreak: s.isTest ? 0 : risk,
    });
    if (s.isTest) payload.content = `[TEST] ${payload.content}`;
    await sendDiscord(settings.webhookUrl.trim(), payload);
  }
}
