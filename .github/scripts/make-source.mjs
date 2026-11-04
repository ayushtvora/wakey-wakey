// Builds a SideStore/AltStore source (source.json) for a GitHub release.
//   node make-source.mjs <dist-dir> <release-tag>
// <dist-dir> holds WakeyWakey.ipa, WakeyDev.ipa and <variant>.info.json (Info.plist as JSON).
// Add the source in SideStore with:
//   https://github.com/<repo>/releases/latest/download/source.json
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dist, tag] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
if (!dist || !tag || !repo) {
  console.error('usage: GITHUB_REPOSITORY=owner/repo node make-source.mjs <dist-dir> <release-tag>');
  process.exit(1);
}

const raw = `https://raw.githubusercontent.com/${repo}/main/apps/mobile/assets`;
const variants = [
  {
    variant: 'production',
    ipa: 'WakeyWakey.ipa',
    icon: `${raw}/icon.png`,
    tint: 'ff8a1f',
    description: 'Alarm clock you can only turn off by finishing a challenge.',
  },
  {
    variant: 'development',
    ipa: 'WakeyDev.ipa',
    icon: `${raw}/icon-dev.png`,
    tint: '2f7bff',
    description: 'Development build of Wakey Wakey. Loads its JavaScript from the dev server on the PC.',
  },
];

const now = new Date().toISOString();
const apps = variants.map((v) => {
  const info = JSON.parse(readFileSync(join(dist, `${v.variant}.info.json`), 'utf8'));
  // SideStore (AltStore 2 sources) checks that the IPA's usage descriptions are declared here.
  const privacy = Object.fromEntries(
    Object.entries(info).filter(([k, val]) => /^NS\w+UsageDescription$/.test(k) && typeof val === 'string'),
  );
  return {
    name: info.CFBundleDisplayName ?? info.CFBundleName,
    bundleIdentifier: info.CFBundleIdentifier,
    developerName: repo.split('/')[0],
    subtitle: v.description,
    localizedDescription: v.description,
    iconURL: v.icon,
    tintColor: v.tint,
    category: 'utilities',
    versions: [
      {
        version: info.CFBundleShortVersionString,
        buildVersion: String(info.CFBundleVersion),
        date: now,
        localizedDescription: `GitHub Actions ${tag}`,
        downloadURL: `https://github.com/${repo}/releases/download/${tag}/${v.ipa}`,
        size: statSync(join(dist, v.ipa)).size,
        minOSVersion: info.MinimumOSVersion,
      },
    ],
    appPermissions: { entitlements: [], privacy },
  };
});

const source = {
  name: 'Wakey Wakey',
  identifier: `io.github.${repo.replace('/', '.').toLowerCase()}`,
  subtitle: 'Builds from GitHub Actions',
  website: `https://github.com/${repo}`,
  tintColor: 'ff8a1f',
  iconURL: variants[0].icon,
  apps,
  news: [],
};

process.stdout.write(JSON.stringify(source, null, 2) + '\n');
