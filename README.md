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
| Install | Sideloadly (Windows) with a free Apple ID. Apps expire after 7 days, so reinstall weekly |

## Layout

```
apps/mobile/
  src/app/                       screens: alarm list, editor, challenge, settings
  src/components/, src/lib/      challenge UI, scanner, store, wake/streak/punishment logic
  modules/alarm-kit/ios/         Swift: AlarmKit controller + Expo module (CocoaPod)
  modules/alarm-kit/app-target/  Swift App Intents (Stop / Start challenge), copied into the app target
  modules/alarm-kit/plugin/      config plugin (Info.plist key, adds the intents to the Xcode project)
  app.config.ts                  production vs. development ("Wakey Dev") variant
packages/core/                   shared logic + vitest tests
.github/workflows/ios.yml        builds both variants
```

## Two apps

| | **Wakey Wakey** (production) | **Wakey Dev** (development) |
|---|---|---|
| Build | Release, JavaScript bundled in | Debug dev client, loads JavaScript from the PC |
| Use for | Real alarms | Trying changes live |
| Data | Its own | Separate from production |

Both are built on every push to `main` or `rebuild/**`, or manually from **Actions → iOS unsigned IPA → Run workflow**. Download the artifacts (`production-ipa-N`, `development-ipa-N`) and install them with Sideloadly.

On the phone, the first time:
- trust your Apple ID under **Settings → General → VPN & Device Management**
- turn on **Developer Mode** under **Settings → Privacy & Security**

## Development

```sh
npm install
npm test              # @wakey/core unit tests
npm run typecheck
npm run dev           # dev server for Wakey Dev on port 19081
```

In Wakey Dev, tap **Enter URL manually** and use one of:
- the same Wi-Fi: `http://<PC LAN IP>:19081`
- Tailscale: `http://<PC Tailscale IP>:19081` (needs a Wakey Dev build from commit `0ad99f5` or later)

JavaScript changes reload on the phone immediately. Changes under `modules/alarm-kit` (Swift) or to native config need a new CI build and a reinstall.

## How the challenge loop works (native)

AlarmKit calls the App Intents in `WakeyIntents.swift` when its buttons are pressed, even while the app is closed:

- **Start challenge:** stops the ring, schedules a snooze alarm, marks the session "challenging", and opens the app.
- **Stop:** schedules a re-ring 1 minute later unless the session is completed.
- Either button, once 10 minutes have passed: posts the Discord message, at most once per session.
- **Completing the chain** in the app cancels every pending snooze or re-ring.

The app also records mornings where the alarm was ignored completely, the next time it is opened.
