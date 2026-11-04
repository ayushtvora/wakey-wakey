import type { ConfigContext, ExpoConfig } from 'expo/config';

// APP_VARIANT=development builds "Wakey Dev": a separate app (own bundle ID) that loads
// JavaScript live from Metro on the PC. The default build is the standalone alarm app.
// `name` stays the same in both so the generated Xcode project is always WakeyWakey.
const isDev = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  scheme: isDev ? 'wakeywakey-dev' : 'wakeywakey',
  ios: {
    ...config.ios,
    bundleIdentifier: isDev ? 'com.ayushtvora.wakeywakey.dev' : 'com.ayushtvora.wakeywakey',
    // CI sets this to the run number so every build is newer than the last one, which
    // SideStore needs to offer it as an update.
    ...(process.env.BUILD_NUMBER ? { buildNumber: process.env.BUILD_NUMBER } : {}),
    // Locked alarm clock. Wakey Dev is blue so the two apps are easy to tell apart.
    // Sources and the variant generator are in assets/icon-src.
    icon: isDev
      ? './assets/icon-dev.png'
      : {
          light: './assets/icon.png',
          dark: './assets/icon-dark.png',
          tinted: './assets/icon-tinted.png',
        },
    infoPlist: {
      ...config.ios?.infoPlist,
      CFBundleDisplayName: isDev ? 'Wakey Dev' : 'Wakey Wakey',
      // Dev only: allow plain http:// so the dev client can load from Metro over Tailscale
      // (100.x addresses aren't "local networking" to iOS). NSAllowsLocalNetworking must NOT be
      // set: iOS ignores NSAllowsArbitraryLoads when it is present. Production keeps Expo's default.
      ...(isDev ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
    },
  },
});
