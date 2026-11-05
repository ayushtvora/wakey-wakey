// Talks to the watchdog (apps/watchdog, a Cloudflare Worker) that sends the Discord punishment
// on time even when this phone is asleep, off or offline.
//
// While the watchdog has a recent copy of the schedule, it is the only sender: the app and the
// native alarm buttons stop posting to Discord themselves, so there are never duplicates. If the
// phone can't reach it for most of the horizon, the phone takes over again.
import {
  WATCHDOG_HORIZON_MS,
  watchdogOccurrences,
  type WatchdogCompletion,
  type WatchdogStatus,
  type WatchdogSyncRequest,
} from '@wakey/core';

import AlarmKit from '../../modules/alarm-kit';
import { getState, updateSettings, type Settings, type StoredAlarm } from './store';

const DAY = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

let lastStatus: WatchdogStatus | null = null;
let lastError: string | null = null;

export function watchdogConfigured(s: Settings = getState().settings): boolean {
  return !!s.watchdogUrl?.trim() && !!s.watchdogKey?.trim();
}

/** True while the watchdog should be the only one sending punishments. */
export function watchdogActive(now = Date.now(), s: Settings = getState().settings): boolean {
  return (
    watchdogConfigured(s) &&
    s.lastWatchdogSyncAt !== undefined &&
    now - s.lastWatchdogSyncAt < WATCHDOG_HORIZON_MS - DAY
  );
}

export function getWatchdogInfo(): { status: WatchdogStatus | null; error: string | null } {
  return { status: lastStatus, error: lastError };
}

function recentCompletions(now: number): WatchdogCompletion[] {
  return AlarmKit.getHistory()
    .filter((s) => s.completedAt !== undefined && now - s.firstRangAt < 3 * DAY)
    .map((s) => ({ alarmId: s.appAlarmId, firstRangAt: s.firstRangAt, completedAt: s.completedAt! }));
}

async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const s = getState().settings;
  const base = s.watchdogUrl!.trim().replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${s.watchdogKey!.trim()}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error('Wrong watchdog key');
    if (!res.ok) throw new Error(`Watchdog answered HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function remember<T extends WatchdogStatus>(status: T): T {
  lastStatus = status;
  lastError = null;
  return status;
}

function fail(e: unknown): null {
  lastError = e instanceof Error ? (e.name === 'AbortError' ? 'Watchdog timed out' : e.message) : String(e);
  return null;
}

/** Sends the schedule and finished mornings. Never throws; returns null on failure. */
export async function syncWatchdog(opts: {
  enabled: boolean;
  streak: number;
  now?: number;
}): Promise<WatchdogStatus | null> {
  if (!watchdogConfigured()) return null;
  const now = opts.now ?? Date.now();
  const { alarms, settings } = getState();
  const body: WatchdogSyncRequest = {
    userName: settings.userName.trim(),
    webhookUrl: settings.webhookUrl.trim(),
    enabled: opts.enabled,
    streak: opts.streak,
    occurrences: watchdogOccurrences(alarms, now),
    completions: recentCompletions(now),
  };
  try {
    const status = remember(await call<WatchdogStatus>('/sync', { method: 'POST', body }));
    updateSettings({ lastWatchdogSyncAt: now });
    return status;
  } catch (e) {
    return fail(e);
  }
}

/** Tells the watchdog a test alarm will ring at `at`. */
export async function reportTestAlarm(alarm: Pick<StoredAlarm, 'id' | 'label'>, at: number): Promise<void> {
  if (!watchdogConfigured()) return;
  try {
    remember(await call<WatchdogStatus>('/test', { method: 'POST', body: { alarmId: alarm.id, label: alarm.label, at } }));
  } catch (e) {
    fail(e);
  }
}

export async function fetchWatchdogStatus(): Promise<WatchdogStatus | null> {
  if (!watchdogConfigured()) return null;
  try {
    return remember(await call<WatchdogStatus>('/status', { method: 'GET' }));
  } catch (e) {
    return fail(e);
  }
}
