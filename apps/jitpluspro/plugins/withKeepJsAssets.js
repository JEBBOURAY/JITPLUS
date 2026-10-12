/**
 * Expo config plugin — keep JS-bundled assets under resource shrinking (Android)
 *
 * Images and fonts loaded with require() are copied by Metro into res/drawable-*
 * and res/raw, then looked up at runtime by name (Resources.getIdentifier). The
 * names only exist inside the JS bundle, so the release resource shrinker
 * (enableShrinkResourcesInReleaseBuilds) cannot see any reference to them.
 * Metro names them `assets_*` (project files) or `__*` (node_modules / workspace).
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KEEP_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@drawable/assets_*,@drawable/__*,@raw/assets_*,@raw/__*" />
`;

function withKeepJsAssets(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const rawDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(path.join(rawDir, 'jitplus_keep_js_assets.xml'), KEEP_XML);
      return cfg;
    },
  ]);
}

module.exports = withKeepJsAssets;
