// Talks to the watchdog (apps/watchdog, a Cloudflare Worker) that sends the Discord punishment
// on time even when this phone is asleep, off or offline.
//
// While the watchdog has a recent copy of the schedule, it is the only sender: the app and the
// native alarm buttons stop posting to Discord themselves, so there are never duplicates. If the
// phone can't reach it for most of the horizon, the phone takes over again.
//
// There is nothing to set up: the address is built in, and on first use the app makes a random
// device ID and secret that give it its own schedule on the watchdog (see apps/watchdog/src/auth.ts).
// They're kept in settings, which the native side also backs up to the Keychain.
import {
  WATCHDOG_HORIZON_MS,
  watchdogOccurrences,
  type WatchdogCompletion,
  type WatchdogStatus,
  type WatchdogSyncRequest,
} from '@wakey/core';
import { getRandomBytes } from 'expo-crypto';

import AlarmKit from '../../modules/alarm-kit';
import { getState, updateSettings, type Settings, type StoredAlarm } from './store';

const DAY = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

let lastStatus: WatchdogStatus | null = null;
let lastError: string | null = null;

export const WATCHDOG_URL = 'https://wakey-watchdog.ayushtvora.workers.dev';

/** True while the watchdog should be the only one sending punishments. */
export function watchdogActive(now = Date.now(), s: Settings = getState().settings): boolean {
  return s.lastWatchdogSyncAt !== undefined && now - s.lastWatchdogSyncAt < WATCHDOG_HORIZON_MS - DAY;
}

/** Punishment is on but the watchdog hasn't had the schedule for over a day. */
export function watchdogOutOfDate(now = Date.now(), s: Settings = getState().settings): boolean {
  return s.punishmentEnabled && (s.lastWatchdogSyncAt === undefined || now - s.lastWatchdogSyncAt > DAY);
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** This install's watchdog account, made on first use. */
function credentials(): string {
  let { watchdogDeviceId, watchdogSecret } = getState().settings;
  if (!watchdogDeviceId || !watchdogSecret) {
    watchdogDeviceId = hex(getRandomBytes(16));
    watchdogSecret = hex(getRandomBytes(32));
    updateSettings({ watchdogDeviceId, watchdogSecret });
  }
  return `${watchdogDeviceId}:${watchdogSecret}`;
}

export function getWatchdogInfo(): { status: WatchdogStatus | null; error: string | null } {
  return { status: lastStatus, error: lastError };
}

function recentCompletions(now: number): WatchdogCompletion[] {
  return AlarmKit.getHistory()
    .filter((s) => s.completedAt !== undefined && now - s.firstRangAt < 3 * DAY)
    .map((s) => ({ alarmId: s.appAlarmId, firstRangAt: s.firstRangAt, completedAt: s.completedAt! }));
}

async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; base?: string; token?: string },
): Promise<T> {
  const base = (init.base ?? WATCHDOG_URL).trim().replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${init.token ?? credentials()}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error('The watchdog rejected this phone');
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
    await retireLegacyWatchdog(body);
    return status;
  } catch (e) {
    return fail(e);
  }
}

/**
 * Before per-phone accounts, the URL and a shared key were typed into Settings and every phone
 * used one schedule on the watchdog. Once this phone's own account works, switch that old
 * schedule off (so it can't punish a stale alarm) and forget the key.
 */
async function retireLegacyWatchdog(current: WatchdogSyncRequest): Promise<void> {
  const { watchdogUrl, watchdogKey } = getState().settings;
  if (!watchdogKey?.trim()) return;
  try {
    await call('/sync', {
      method: 'POST',
      base: watchdogUrl || WATCHDOG_URL,
      token: watchdogKey.trim(),
      body: { ...current, enabled: false, occurrences: [] } satisfies WatchdogSyncRequest,
    });
  } catch (e) {
    // A wrong or replaced key can never work, so only keep it to retry other failures.
    if (!(e instanceof Error && e.message.includes('rejected'))) return;
  }
  updateSettings({ watchdogUrl: undefined, watchdogKey: undefined });
}

/** Tells the watchdog a test alarm will ring at `at`. */
export async function reportTestAlarm(alarm: Pick<StoredAlarm, 'id' | 'label'>, at: number): Promise<void> {
  try {
    remember(await call<WatchdogStatus>('/test', { method: 'POST', body: { alarmId: alarm.id, label: alarm.label, at } }));
  } catch (e) {
    fail(e);
  }
}

export async function fetchWatchdogStatus(): Promise<WatchdogStatus | null> {
  try {
    return remember(await call<WatchdogStatus>('/status', { method: 'GET' }));
  } catch (e) {
    return fail(e);
  }
}
