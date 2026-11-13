// Wakey Wakey watchdog: sends the Discord punishment on time even when the phone can't.
//
//   GET  /health            no auth, for checking the deploy
//   GET  /status            current schedule and recent results
//   POST /sync              WatchdogSyncRequest: config, upcoming alarm times, finished mornings
//   POST /test              WatchdogOccurrence: a test alarm that is about to ring
//
// Every request except /health needs `Authorization: Bearer <deviceId>:<secret>` (see auth.ts).
// Each phone has its own Durable Object, named by its device ID, which holds its schedule and
// wakes itself with a Durable Object alarm at each deadline.
//
// Legacy: `Bearer <WATCHDOG_TOKEN>` reaches the single shared Durable Object ("main") that app
// versions before per-phone accounts used. Newer apps use it once, to switch that schedule off.
import { DurableObject } from 'cloudflare:workers';
import { isDiscordWebhookUrl, type WatchdogOccurrence, type WatchdogStatus, type WatchdogSyncRequest } from '@wakey/core';

import { parseCredentials, sha256Hex } from './auth';
import {
  EMPTY_STATE,
  addTest,
  applySync,
  dueMessages,
  markLate,
  nextWakeAt,
  recordSend,
  status,
  type State,
} from './logic';

export interface Env {
  WATCHDOG: DurableObjectNamespace<Watchdog>;
  WATCHDOG_TOKEN: string;
}

export class Watchdog extends DurableObject<Env> {
  /**
   * True if `secretHash` belongs to this phone. The first caller of a new device ID claims it;
   * device IDs are 128 random bits, so nobody else can guess one to claim it first.
   */
  async authenticate(secretHash: string): Promise<boolean> {
    const stored = await this.ctx.storage.get<string>('secretHash');
    if (stored === undefined) {
      await this.ctx.storage.put('secretHash', secretHash);
      return true;
    }
    const enc = new TextEncoder();
    const a = enc.encode(stored);
    const b = enc.encode(secretHash);
    return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
  }

  private async load(): Promise<State> {
    return (await this.ctx.storage.get<State>('state')) ?? EMPTY_STATE;
  }

  private async save(state: State, now: number): Promise<void> {
    await this.ctx.storage.put('state', state);
    const wake = nextWakeAt(state, now);
    if (wake === undefined) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(wake, now + 1000));
  }

  async sync(req: WatchdogSyncRequest): Promise<WatchdogStatus> {
    const now = Date.now();
    // Completions may have arrived for mornings already punished: send corrections now.
    const state = await this.send(applySync(await this.load(), req, now), now);
    await this.save(state, now);
    return status(state, now);
  }

  async test(o: WatchdogOccurrence): Promise<WatchdogStatus> {
    const now = Date.now();
    const state = addTest(await this.load(), o, now);
    await this.save(state, now);
    return status(state, now);
  }

  async getStatus(): Promise<WatchdogStatus> {
    return status(await this.load(), Date.now());
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const state = await this.send(await this.load(), now);
    await this.save(state, now);
  }

  private async send(state: State, now: number): Promise<State> {
    for (const m of dueMessages(state, now)) {
      let ok = false;
      try {
        const res = await fetch(state.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(m.payload),
        });
        ok = res.ok;
        console.log(`${m.kind} "${m.occurrence.label}" @ ${new Date(m.occurrence.at).toISOString()}: HTTP ${res.status}`);
      } catch (e) {
        console.log(`${m.kind} failed: ${e}`);
      }
      state = recordSend(state, m, ok, now);
    }
    return markLate(state, now);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function isLegacyToken(req: Request, env: Env): boolean {
  const expected = env.WATCHDOG_TOKEN;
  const got = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected || got.length !== expected.length) return false;
  const enc = new TextEncoder();
  return crypto.subtle.timingSafeEqual(enc.encode(got), enc.encode(expected));
}

/** The caller's own Durable Object, or null if the credentials are missing or wrong. */
async function watchdogFor(req: Request, env: Env): Promise<DurableObjectStub<Watchdog> | null> {
  const creds = parseCredentials(req.headers.get('Authorization'));
  if (creds) {
    const stub = env.WATCHDOG.get(env.WATCHDOG.idFromName(`device:${creds.deviceId}`));
    return (await stub.authenticate(await sha256Hex(creds.secret))) ? stub : null;
  }
  return isLegacyToken(req, env) ? env.WATCHDOG.get(env.WATCHDOG.idFromName('main')) : null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length < 2000;

function isOccurrence(v: unknown): v is WatchdogOccurrence {
  const o = v as WatchdogOccurrence;
  return !!o && isStr(o.alarmId) && isStr(o.label) && isNum(o.at);
}

function isSync(v: unknown): v is WatchdogSyncRequest {
  const r = v as WatchdogSyncRequest;
  return (
    !!r &&
    isStr(r.userName) &&
    isStr(r.webhookUrl) &&
    // Anyone can make an account, so the Worker must only ever post to Discord webhooks.
    (r.webhookUrl === '' || isDiscordWebhookUrl(r.webhookUrl)) &&
    typeof r.enabled === 'boolean' &&
    isNum(r.streak) &&
    Array.isArray(r.occurrences) &&
    r.occurrences.length <= 500 &&
    r.occurrences.every(isOccurrence) &&
    Array.isArray(r.completions) &&
    r.completions.length <= 500 &&
    r.completions.every((c) => !!c && isStr(c.alarmId) && isNum(c.firstRangAt) && isNum(c.completedAt))
  );
}

export default {
  async fetch(req, env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/health') return json({ ok: true });
    const stub = await watchdogFor(req, env);
    if (!stub) return json({ error: 'unauthorized' }, 401);
    if (req.method === 'GET' && pathname === '/status') return json(await stub.getStatus());

    if (req.method === 'POST' && (pathname === '/sync' || pathname === '/test')) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ error: 'invalid JSON' }, 400);
      }
      if (pathname === '/sync') {
        if (!isSync(body)) return json({ error: 'invalid sync request' }, 400);
        return json(await stub.sync(body));
      }
      if (!isOccurrence(body)) return json({ error: 'invalid test alarm' }, 400);
      return json(await stub.test(body));
    }
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
