/**
 * Expo config plugin — Force Google Maps region to Morocco (Android + iOS)
 *
 * Sets the initial Google Maps region to Morocco so that:
 * - Borders render correctly (Western Sahara shown as part of Morocco)
 * - Geocoding results prioritise Moroccan locations
 *
 * Android: adds a <meta-data> entry to AndroidManifest.xml
 * iOS: adds a plist entry to Info.plist
 */
const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withMoroccoRegionAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const manifestPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'AndroidManifest.xml',
      );
      let manifest = fs.readFileSync(manifestPath, 'utf8');

      // Only add if not already present
      if (!manifest.includes('com.google.android.geo.API_REGION')) {
        manifest = manifest.replace(
          '</application>',
          '        <meta-data android:name="com.google.android.geo.API_REGION" android:value="MA" />\n    </application>',
        );
        fs.writeFileSync(manifestPath, manifest);
      }

      return cfg;
    },
  ]);
}

function withMoroccoRegionIOS(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.GMSRegionCode = 'MA';
    return cfg;
  });
}

function withMoroccoRegion(config) {
  config = withMoroccoRegionAndroid(config);
  config = withMoroccoRegionIOS(config);
  return config;
}

module.exports = withMoroccoRegion;
