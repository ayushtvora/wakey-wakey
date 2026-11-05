// App state: alarms and settings, persisted in the native key-value store (UserDefaults) and
// mirrored to AlarmKit on every change.
import { createAlarm, type Alarm } from '@wakey/core';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import AlarmKit, { type AlarmSpec } from '../../modules/alarm-kit';

export interface StoredAlarm extends Alarm {
  /** epoch ms: occurrences before this don't count (created, re-enabled, or time changed). */
  activeSince: number;
  /** One-off alarms: the time it rang, set when it's switched off after ringing. */
  retiredOccurrence?: number;
}

export interface Settings {
  userName: string;
  webhookUrl: string;
  punishmentEnabled: boolean;
  /** epoch ms: missed-morning detection has covered everything up to here. */
  lastReconciledAt?: number;
  /** Watchdog Worker URL, e.g. https://wakey-watchdog.<account>.workers.dev */
  watchdogUrl?: string;
  /** Shared secret (the Worker's WATCHDOG_TOKEN). */
  watchdogKey?: string;
  /** epoch ms of the last successful sync with the watchdog. */
  lastWatchdogSyncAt?: number;
}

interface State {
  alarms: StoredAlarm[];
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = { userName: '', webhookUrl: '', punishmentEnabled: false };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = AlarmKit.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let state: State = {
  alarms: readJson<StoredAlarm[]>('alarms', []),
  settings: { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>('settings', {}) },
};
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  AlarmKit.setItem('alarms', JSON.stringify(state.alarms));
  AlarmKit.setItem('settings', JSON.stringify(state.settings));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): State {
  return state;
}

export function useAppState(): State {
  return useSyncExternalStore(subscribe, getState);
}

export function toSpec(a: Alarm): AlarmSpec {
  return { id: a.id, label: a.label, hour: a.hour, minute: a.minute, days: a.days, snoozeMinutes: a.snoozeMinutes };
}

/** Pushes the enabled alarms to AlarmKit. */
export async function syncNative(): Promise<void> {
  await AlarmKit.syncAlarms(state.alarms.filter((a) => a.enabled).map(toSpec));
}

export function newAlarm(): StoredAlarm {
  return { ...createAlarm({ id: randomUUID() }), activeSince: Date.now() };
}

export function getAlarm(id: string): StoredAlarm | undefined {
  return state.alarms.find((a) => a.id === id);
}

export async function saveAlarm(alarm: StoredAlarm): Promise<void> {
  const prev = getAlarm(alarm.id);
  const timingChanged =
    !prev ||
    !prev.enabled ||
    prev.hour !== alarm.hour ||
    prev.minute !== alarm.minute ||
    prev.days.join() !== alarm.days.join();
  const next: StoredAlarm = {
    ...alarm,
    activeSince: timingChanged ? Date.now() : alarm.activeSince,
    retiredOccurrence: alarm.enabled ? undefined : alarm.retiredOccurrence,
  };
  const alarms = prev ? state.alarms.map((a) => (a.id === alarm.id ? next : a)) : [...state.alarms, next];
  setState({ ...state, alarms: sortAlarms(alarms) });
  await syncNative();
}

export async function setAlarmEnabled(id: string, enabled: boolean): Promise<void> {
  const alarm = getAlarm(id);
  if (!alarm) return;
  await saveAlarm({ ...alarm, enabled });
}

export async function deleteAlarm(id: string): Promise<void> {
  setState({ ...state, alarms: state.alarms.filter((a) => a.id !== id) });
  await syncNative();
}

/** Updates alarms without touching activeSince (used by reconciliation). */
export function replaceAlarms(alarms: StoredAlarm[]): void {
  setState({ ...state, alarms: sortAlarms(alarms) });
}

export function updateSettings(patch: Partial<Settings>): void {
  setState({ ...state, settings: { ...state.settings, ...patch } });
}

function sortAlarms(alarms: StoredAlarm[]): StoredAlarm[] {
  return [...alarms].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}
