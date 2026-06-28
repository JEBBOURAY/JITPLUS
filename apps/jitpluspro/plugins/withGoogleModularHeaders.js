/**
 * Enable modular headers for GoogleUtilities and RecaptchaInterop.
 *
 * Required because @react-native-google-signin/google-signin@16.x pulls in
 * GoogleSignIn 9 -> AppCheckCore (a Swift pod), which fails `pod install`
 * with:
 *
 *   The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
 *   `RecaptchaInterop`, which do not define modules.
 *
 * Adding `:modular_headers => true` for those two Obj-C pods generates the
 * module maps AppCheckCore needs without forcing `use_modular_headers!`
 * globally (which can break other React Native pods).
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# === withGoogleModularHeaders ===';

const SNIPPET = `
  ${MARKER}
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
  # === end withGoogleModularHeaders ===
`;

module.exports = function withGoogleModularHeaders(config) {
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

      // Insert right after the `use_expo_modules!` line so the pods are
      // declared inside the main target block before dependency resolution.
      const anchor = /use_expo_modules!.*\n/;
      if (anchor.test(contents)) {
        contents = contents.replace(anchor, (match) => match + SNIPPET);
      } else {
        // Fallback: inject after the first `target '...' do` line.
        const targetAnchor = /target\s+'[^']+'\s+do\s*\n/;
        if (targetAnchor.test(contents)) {
          contents = contents.replace(targetAnchor, (match) => match + SNIPPET);
        } else {
          throw new Error(
            'withGoogleModularHeaders: could not find an anchor in Podfile.'
          );
        }
      }

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
