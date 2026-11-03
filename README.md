# Wakey Wakey

An iOS alarm clock you can't turn off until you finish a challenge. Pressing **Start challenge**
snoozes the alarm, and pressing **Stop** without finishing just makes it ring again. Only solving
the challenge ends it.

## Stack

- **Expo (React Native + TypeScript)** for the app UI.
- **Apple AlarmKit (iOS 26+)** for real alarms that ring while the app is closed, the phone is
  locked, and silent mode or Focus is on. It's wrapped by a local Expo module in
  [`apps/mobile/modules/alarm-kit`](apps/mobile/modules/alarm-kit).
- **GitHub Actions (`macos-26`)** builds an unsigned `.ipa`, so no Mac is needed.
- **SideStore or Sideloadly** installs the build with a free Apple ID (re-signed every 7 days).

## Layout

```
apps/mobile/                      Expo app
  modules/alarm-kit/ios/          Swift: AlarmKit controller + Expo module (CocoaPod)
  modules/alarm-kit/app-target/   Swift App Intents, copied into the app target by the plugin
  modules/alarm-kit/plugin/       config plugin (Info.plist key, adds intents to Xcode project)
.github/workflows/ios.yml         unsigned IPA build
```

## Getting a build onto your phone (Windows)

1. Push to `main` or a `rebuild/**` branch, or run the **iOS unsigned IPA** workflow manually.
2. Download the `WakeyWakey-ipa-N` artifact from the workflow run and unzip it to get `WakeyWakey.ipa`.
3. Install it with Sideloadly (Windows) or SideStore (on the phone) using your Apple ID.
4. On the phone, go to Settings → General → VPN & Device Management and trust your developer profile.
   Also turn on Settings → Privacy & Security → Developer Mode.

## How the challenge loop works

- **Start challenge** (on the alarm): silences the ring, schedules a snooze alarm, and opens the app
  on the challenge.
- **Stop** (system button): if the challenge isn't done, schedules a re-ring.
- **Solving the challenge** cancels every pending snooze or re-ring alarm.
