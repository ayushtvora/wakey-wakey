# Wakey Wakey

An iOS alarm clock you can't turn off until you finish a chain of challenges.

- **Start challenge** silences the alarm for the alarm's snooze length and opens the app on the challenge.
- **Stop** without finishing makes it ring again **1 minute** later.
- **Finishing every challenge** turns it off for the day.
- **Not done within 10 minutes** of the first ring: your win streak resets, and a message can be posted to a Discord channel.

Challenges: **math**, **QR code scan**, **barcode scan** and **step count**, chained in any order (up to 5).

## Stack

| Part | What |
|---|---|
| App | Expo SDK 58 (React Native + TypeScript), Expo Router, `src/app` |
| Alarms | Apple **AlarmKit** (iOS 26+), wrapped by a local Expo module in [`apps/mobile/modules/alarm-kit`](apps/mobile/modules/alarm-kit). Rings while the app is closed and the phone is locked, even in silent mode or Focus |
| Shared rules | [`packages/core`](packages/core): alarm schedule, challenges, punishment deadline, streaks. Plain TypeScript, reused later by the Raspberry Pi clock and home server |
| Builds | GitHub Actions `macos-26` builds unsigned `.ipa` files, so no Mac is needed |
| Install | **SideStore** on the phone with a free Apple ID, from this repo's SideStore source. Apps expire after 7 days; SideStore refreshes them on the phone (Sideloadly from Windows is the backup) |
| Watchdog | [`apps/watchdog`](apps/watchdog): Cloudflare Worker (free plan) that sends the Discord punishment on time even when the phone is off |

## Layout

```
apps/mobile/
  src/app/                       screens: alarm list, editor, challenge, settings
  src/components/, src/lib/      challenge UI, scanner, store, wake/streak/punishment logic
  modules/alarm-kit/ios/         Swift: AlarmKit controller + Expo module (CocoaPod)
  modules/alarm-kit/app-target/  Swift App Intents (Stop / Start challenge), copied into the app target
  modules/alarm-kit/plugin/      config plugin (Info.plist key, adds the intents to the Xcode project)
  app.config.ts                  production vs. development ("Wakey Dev") variant
  scripts/dev-server.mjs         self-restarting dev server behind Tailscale (npm run dev:remote)
apps/watchdog/                   Cloudflare Worker: punishment watchdog (see its README)
packages/core/                   shared logic + vitest tests
.github/workflows/ios.yml        tests, then builds both variants; main builds become a release + SideStore source
.github/workflows/watchdog.yml   tests the Worker; deploys it from main
```

## Two apps

| | **Wakey Wakey** (production) | **Wakey Dev** (development) |
|---|---|---|
| Build | Release, JavaScript bundled in | Debug dev client, loads JavaScript from the PC |
| Use for | Real alarms | Trying changes live |
| Data | Its own | Separate from production |

Both are built on every push to `main` or `rebuild/**`, or manually from **Actions → iOS unsigned IPA → Run workflow**. Tests and type checks run first; a failing change is never built.

## Installing

Every `main` build is published as a GitHub release (`build-N`, newest 5 kept) with both IPAs and a SideStore source. In SideStore, add:

```
https://github.com/ayushtvora/wakey-wakey/releases/latest/download/source.json
```

then **Get** both apps. New builds appear under **Updates** and keep the app's data.

- SideStore needs **LocalDevVPN** connected to install, update or refresh. Refresh at least every 7 days (**My Apps → Refresh All**, or a daily Shortcuts automation).
- SideStore adds your team ID to the bundle ID, so its installs are separate apps from Sideloadly installs of the same build.
- Free Apple ID limit: 3 sideloaded apps at once (SideStore + Wakey Wakey + Wakey Dev).
- Backup: download the IPAs from the [latest release](https://github.com/ayushtvora/wakey-wakey/releases/latest) and install with Sideloadly.

On the phone, the first time:
- trust your Apple ID under **Settings → General → VPN & Device Management**
- turn on **Developer Mode** under **Settings → Privacy & Security**

The app shows when the install expires, warns 3 days before, and sends reminder notifications.

## Development

```sh
npm install
npm test              # all unit tests (core + watchdog)
npm run typecheck     # all workspaces
cd apps/mobile && npm run dev:remote   # dev server for Wakey Dev, over Tailscale, restarts itself
```

`dev:remote` serves Metro on port 19082 (8081 is left free) behind Tailscale Serve and prints the phone URL (`https://<pc>.<tailnet>.ts.net`). In Wakey Dev, tap **Enter URL manually** and enter it once; afterwards it is under **Recently opened**. The phone must be on Tailscale. `npm run dev` is the plain version on port 19081 for the same Wi-Fi.

JavaScript changes reload on the phone immediately. Changes under `modules/alarm-kit` (Swift) or to native config need a new CI build and a reinstall.

## How the challenge loop works (native)

AlarmKit calls the App Intents in `WakeyIntents.swift` when its buttons are pressed, even while the app is closed:

- **Start challenge:** stops the ring, schedules a snooze alarm, marks the session "challenging", and opens the app.
- **Stop:** schedules a re-ring 1 minute later unless the session is completed.
- Either button, once 10 minutes have passed: posts the Discord message, at most once per session (only when the watchdog isn't connected; otherwise the watchdog sends it).
- **Completing the chain** in the app cancels every pending snooze or re-ring.

The app also records mornings where the alarm was ignored completely, the next time it is opened.

## Punishment watchdog

The app sends the Worker in [`apps/watchdog`](apps/watchdog) its alarm times for the next 7 days and every finished morning. The Worker wakes at each deadline (ring + 10 min + 1 min grace) and posts to Discord if nothing came in, so oversleeping is punished even with the phone off. If an in-time finish arrives late (phone offline), it posts a correction. While the watchdog is connected, the phone doesn't post itself, so messages are never doubled. Set it up in the app under **Settings → Watchdog**.
