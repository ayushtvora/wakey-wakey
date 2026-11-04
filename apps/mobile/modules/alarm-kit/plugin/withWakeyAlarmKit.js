// Expo config plugin for the local WakeyAlarmKit module.
// - Adds the AlarmKit usage description to Info.plist.
// - Copies app-target/WakeyIntents.swift into the iOS app target. App Intents have to be
//   compiled in the app target so Xcode extracts their metadata for AlarmKit to run them.
const fs = require('fs');
const path = require('path');
const { withInfoPlist, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const INTENTS_FILE = 'WakeyIntents.swift';

function withWakeyAlarmKit(config, props = {}) {
  const usageDescription =
    props.usageDescription ?? 'Wakey Wakey schedules alarms that ring until you finish your wake-up challenge.';

  config = withInfoPlist(config, (c) => {
    c.modResults.NSAlarmKitUsageDescription = usageDescription;
    return c;
  });

  config = withXcodeProject(config, (c) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
    const source = path.join(__dirname, '..', 'app-target', INTENTS_FILE);
    const destination = path.join(c.modRequest.platformProjectRoot, projectName, INTENTS_FILE);
    fs.copyFileSync(source, destination);

    const filepath = `${projectName}/${INTENTS_FILE}`;
    if (!c.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: c.modResults,
      });
    }
    return c;
  });

  return config;
}

module.exports = withWakeyAlarmKit;
