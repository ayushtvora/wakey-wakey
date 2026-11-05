import { nextFireDate, type Alarm } from './alarm';

/**
 * Messages between the phone and the watchdog (a Cloudflare Worker that sends the Discord
 * punishment on time even when the phone is asleep, off or offline).
 *
 * The phone tells the watchdog its upcoming alarm times in advance and reports finished
 * mornings. The watchdog punishes any alarm not finished within PUNISH_AFTER_MS.
 */

/** One scheduled ring the watchdog should expect a completion for. */
export interface WatchdogOccurrence {
  alarmId: string;
  label: string;
  /** epoch ms: scheduled ring time */
  at: number;
  isTest?: boolean;
}

/** A finished morning, matched to an occurrence by alarm and ring time. */
export interface WatchdogCompletion {
  alarmId: string;
  firstRangAt: number;
  completedAt: number;
}

/** POST /sync. Replaces the config and every future (not yet rung) non-test occurrence. */
export interface WatchdogSyncRequest {
  userName: string;
  webhookUrl: string;
  /** Punishment switched on in the app (and the webhook URL looks valid). */
  enabled: boolean;
  /** Streak that is lost if the next alarm is missed. */
  streak: number;
  occurrences: WatchdogOccurrence[];
  completions: WatchdogCompletion[];
}

export interface WatchdogStatus {
  lastSyncAt?: number;
  enabled: boolean;
  hasWebhook: boolean;
  /** Next time the watchdog checks for an unfinished alarm (epoch ms). */
  nextCheckAt?: number;
  upcoming: { label: string; at: number; isTest?: boolean }[];
  recent: { label: string; at: number; result: 'won' | 'late' | 'punished' | 'corrected'; isTest?: boolean }[];
}

/** How far ahead the phone sends alarm times. If the phone goes silent longer, it punishes itself again. */
export const WATCHDOG_HORIZON_MS = 8 * 24 * 60 * 60 * 1000;

/** A completion within this of an occurrence's ring time belongs to it. */
export const WATCHDOG_MATCH_WINDOW_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ring times of every enabled alarm in (now, now + horizon - 1 day]. The day of slack means the
 * watchdog still knows the next alarm when the phone takes over again (see the app's watchdog.ts).
 * `activeSince`: one-off alarms ring once, at the first matching time after this.
 */
export function watchdogOccurrences(
  alarms: readonly (Pick<Alarm, 'id' | 'label' | 'hour' | 'minute' | 'days' | 'enabled'> & { activeSince: number })[],
  now: number,
): WatchdogOccurrence[] {
  const result: WatchdogOccurrence[] = [];
  const until = now + WATCHDOG_HORIZON_MS - DAY_MS;
  for (const a of alarms) {
    if (!a.enabled) continue;
    if (a.days.length === 0) {
      const fire = nextFireDate(a, new Date(a.activeSince));
      if (fire && fire.getTime() > now && fire.getTime() <= until) {
        result.push({ alarmId: a.id, label: a.label, at: fire.getTime() });
      }
      continue;
    }
    let cursor = new Date(Math.max(now, a.activeSince));
    for (let i = 0; i < 64; i++) {
      const next = nextFireDate(a, cursor);
      if (!next || next.getTime() > until) break;
      result.push({ alarmId: a.id, label: a.label, at: next.getTime() });
      cursor = next;
    }
  }
  return result.sort((x, y) => x.at - y.at);
}
