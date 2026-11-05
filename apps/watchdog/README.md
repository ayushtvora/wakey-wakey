# Wakey Wakey watchdog

A Cloudflare Worker that sends the Discord punishment **on time**, even when the phone is asleep,
off or offline. Without it, the phone can only send the message the next time app code runs.

How it works:
- The app sends the watchdog its upcoming alarm times (next 7 days) and finished mornings
  whenever it syncs (app open, alarm changes, challenge finished).
- A Durable Object wakes itself at each deadline (ring time + 10 min + 1 min grace). If no
  completion arrived, it posts to Discord.
- If a completion that was in time arrives later (phone was offline), it posts a correction.
- While the watchdog has a recent schedule, the phone doesn't post to Discord itself, so
  messages are never doubled. If the phone can't reach it for 7 days, the phone takes over.

Runs on the Workers **free plan** (SQLite-backed Durable Objects).

## Deploy (from this folder)

```sh
npx wrangler login                    # once; opens the browser
npx wrangler secret put WATCHDOG_TOKEN  # paste a long random key
npx wrangler deploy
```

Then in the app: Settings → Watchdog, enter the `https://wakey-watchdog.<account>.workers.dev`
URL and the same key, and tap **Connect and send schedule**.

## API

All requests except `/health` need `Authorization: Bearer <WATCHDOG_TOKEN>`.

| Method | Path | Body | |
|---|---|---|---|
| GET | `/health` | | `{ ok: true }` |
| GET | `/status` | | `WatchdogStatus` |
| POST | `/sync` | `WatchdogSyncRequest` | config, upcoming alarm times, finished mornings |
| POST | `/test` | `WatchdogOccurrence` | a test alarm about to ring |

Types are in `packages/core/src/watchdog.ts`. Decision logic is in `src/logic.ts` (tested in
`test/logic.test.ts`); `src/index.ts` is the Cloudflare glue.

Logs: `npx wrangler tail`.
