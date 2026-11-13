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

## Deploy

Pushing to `main` deploys automatically (`.github/workflows/watchdog.yml`) once the repo secret
`CLOUDFLARE_API_TOKEN` is set. To deploy by hand from this folder:

```sh
npx wrangler login    # once; opens the browser
npx wrangler deploy
```

The app has the Worker's URL built in (`WATCHDOG_URL` in `apps/mobile/src/lib/watchdog.ts`);
change it there if the Worker moves.

## Accounts

Each phone has its own schedule, in its own Durable Object. On first use the app makes a random
device ID (128 bits) and secret (256 bits) and sends `Authorization: Bearer <deviceId>:<secret>`.
The first request for a device ID stores the secret's SHA-256; later requests must match it.
There is no sign-up. Since anyone can make an account, the Worker only posts to Discord webhook
URLs.

Legacy: the `WATCHDOG_TOKEN` secret still opens the single shared schedule (`main`) that app
builds before accounts used. Newer apps switch that schedule off once their own account works.

## API

All requests except `/health` need the `Authorization` header above.

| Method | Path | Body | |
|---|---|---|---|
| GET | `/health` | | `{ ok: true }` |
| GET | `/status` | | `WatchdogStatus` |
| POST | `/sync` | `WatchdogSyncRequest` | config, upcoming alarm times, finished mornings |
| POST | `/test` | `WatchdogOccurrence` | a test alarm about to ring |

Types are in `packages/core/src/watchdog.ts`. Decision logic is in `src/logic.ts` (tested in
`test/logic.test.ts`); `src/index.ts` is the Cloudflare glue.

Logs: `npx wrangler tail`.
