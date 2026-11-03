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
    infoPlist: {
      ...config.ios?.infoPlist,
      CFBundleDisplayName: isDev ? 'Wakey Dev' : 'Wakey Wakey',
    },
  },
});
