/**
 * Expo config plugin — Force Google Maps region to Morocco (MA)
 *
 * Android: Injects a <meta-data android:name="com.google.android.geo.region"
 *          android:value="MA" /> in AndroidManifest.xml so the Maps SDK renders
 *          Moroccan borders correctly (including Sahara provinces).
 *
 * iOS: Sets AppleLocale and AppleLanguages defaults in Info.plist to bias
 *      the Maps SDK towards Morocco for border rendering.
 */
const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

// ── Android: inject region meta-data ────────────────────────────
function withAndroidRegion(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    // Ensure meta-data array exists
    if (!app['meta-data']) app['meta-data'] = [];

    const regionKey = 'com.google.android.geo.region';
    // Remove any existing entry to avoid duplicates
    app['meta-data'] = app['meta-data'].filter(
      (m) => m.$?.['android:name'] !== regionKey,
    );

    // Add region=MA
    app['meta-data'].push({
      $: {
        'android:name': regionKey,
        'android:value': 'MA',
      },
    });

    return cfg;
  });
}

// ── iOS: bias locale towards Morocco ────────────────────────────
function withIOSRegion(config) {
  return withInfoPlist(config, (cfg) => {
    // AppleLocale biases the Maps SDK towards Morocco for border rendering
    cfg.modResults.AppleLocale = 'fr_MA';
    // AppleLanguages priority — keep user's actual languages but add fr-MA first
    const existingLangs = cfg.modResults.AppleLanguages ?? [];
    if (!existingLangs.includes('fr-MA')) {
      cfg.modResults.AppleLanguages = ['fr-MA', ...existingLangs];
    }
    return cfg;
  });
}

// ── Main plugin ─────────────────────────────────────────────────
module.exports = function withMoroccoRegion(config) {
  config = withAndroidRegion(config);
  config = withIOSRegion(config);
  return config;
};
