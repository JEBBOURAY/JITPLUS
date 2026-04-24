/**
 * Expo config plugin — Enable RTL support on Android
 *
 * Adds android:supportsRtl="true" to the <application> tag in AndroidManifest.xml.
 * Required for I18nManager.forceRTL(true) to take effect on Android (Arabic/Darija).
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withSupportsRTL(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:supportsRtl'] = 'true';
    }
    return mod;
  });
};
