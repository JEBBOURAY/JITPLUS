/**
 * Disable Swift 6 strict concurrency for all CocoaPods targets.
 *
 * Required for Xcode 26 builds because expo-image@55.0.9 (and other SDK 54
 * pods) contain Swift code with non-Sendable static properties that fail
 * to compile under strict concurrency mode.
 *
 * Upstream issue (closed without fix in SDK 54):
 *   https://github.com/expo/expo/issues/45142
 *
 * This plugin appends a post_install hook to ios/Podfile that overrides
 * SWIFT_STRICT_CONCURRENCY=minimal on every pod target, restoring Swift 5
 * concurrency semantics while keeping Xcode 26 / SDK 26 toolchain.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# === withDisableStrictConcurrency ===';

// Snippet injected INSIDE the existing post_install hook (Expo generates one
// already; CocoaPods doesn't allow multiple post_install blocks).
const SNIPPET = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_VERSION'] = '5.0'
      config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      config.build_settings['SWIFT_UPCOMING_FEATURE_STRICT_CONCURRENCY'] = 'NO'
    end
  end
  # === end withDisableStrictConcurrency ===
`;

module.exports = function withDisableStrictConcurrency(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile'
      );
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes(MARKER)) {
        return cfg;
      }

      const postInstallRegex = /post_install\s+do\s*\|installer\|/;
      if (postInstallRegex.test(contents)) {
        contents = contents.replace(
          postInstallRegex,
          (match) => match + SNIPPET
        );
      } else {
        // Fallback (shouldn't happen with Expo template)
        contents =
          contents.trimEnd() +
          `\npost_install do |installer|\n${SNIPPET}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
