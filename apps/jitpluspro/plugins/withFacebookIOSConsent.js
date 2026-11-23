/**
 * Expo config plugin — Meta SDK waits for the ATT answer on iOS.
 *
 * react-native-fbsdk-next writes one set of flags for both platforms. Android
 * relies on the SDK's automatic start, but on iOS automatic start + automatic
 * app events sent install/activate events at launch, before the App Tracking
 * Transparency prompt (App Store guideline 5.1.2). On iOS the SDK is started
 * from JS by services/metaAdsManager.ts once the ATT prompt is answered.
 *
 * Must be listed BEFORE 'react-native-fbsdk-next' in app.config.js: Info.plist
 * mods run in reverse order, so this one runs after the Facebook plugin and
 * its values win.
 */
const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withFacebookIOSConsent(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.FacebookAutoInitEnabled = false;
    cfg.modResults.FacebookAutoLogAppEventsEnabled = false;
    cfg.modResults.FacebookAdvertiserIDCollectionEnabled = false;
    return cfg;
  });
};
