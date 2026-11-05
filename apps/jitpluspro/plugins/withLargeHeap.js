/**
 * Expo config plugin — Request a large Java heap on Android
 *
 * Adds android:largeHeap="true" to the <application> tag in AndroidManifest.xml.
 * The default Java heap limit is 256 MB even on high-end devices; Sentry
 * JITPLUSPRO-MOBILE-S (OutOfMemoryError, SM-S928B, 1.7.2) hit that limit after
 * ~15 min of use with the store form / Google Maps open. This raises the limit
 * (typically to 512 MB) as a mitigation; it does not fix an underlying leak.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:largeHeap'] = 'true';
    }
    return mod;
  });
};
