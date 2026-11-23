/**
 * Expo config plugin — tablets rotate, phones stay in portrait.
 *
 * The app config keeps `orientation: 'portrait'`, which locks phones. This plugin
 * then opens the other orientations on tablets only:
 *
 * - iOS: `UISupportedInterfaceOrientations~ipad` lists all four orientations
 *   (Expo's `orientation` only writes the iPhone key). Needs `ios.supportsTablet: true`,
 *   otherwise the iPad runs the iPhone app in a portrait compatibility window.
 * - Android: MainActivity asks for the user's rotation (`FULL_USER`, which honours the
 *   system rotation lock) when the smallest screen width is >= 600 dp, and portrait
 *   below. It is re-applied on configuration changes, so a foldable follows its state.
 *   Android 16+ already ignores the portrait lock on large screens for targetSdk 36.
 */
const { withInfoPlist, withMainActivity } = require('expo/config-plugins');

const IPAD_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

const TABLET_MIN_DP = 600;
const MARKER = '// jitplus-tablet-rotation';

const APPLY_FN = `
  ${MARKER}: tablets (>= ${TABLET_MIN_DP} dp) rotate, phones stay in portrait.
  private fun applyTabletRotation(config: android.content.res.Configuration) {
    val wanted = if (config.smallestScreenWidthDp >= ${TABLET_MIN_DP})
      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_USER
    else
      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    if (requestedOrientation != wanted) requestedOrientation = wanted
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    applyTabletRotation(newConfig)
  }
`;

function withTabletRotationIOS(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults['UISupportedInterfaceOrientations~ipad'] = IPAD_ORIENTATIONS;
    return mod;
  });
}

function withTabletRotationAndroid(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('withTabletRotation: MainActivity must be Kotlin');
    }
    let src = mod.modResults.contents;
    if (src.includes(MARKER)) return mod;

    if (/override fun onConfigurationChanged\(/.test(src)) {
      throw new Error('withTabletRotation: MainActivity already overrides onConfigurationChanged');
    }
    const onCreate = /super\.onCreate\((null|savedInstanceState)\)/;
    if (!onCreate.test(src)) {
      throw new Error('withTabletRotation: super.onCreate(...) not found in MainActivity');
    }
    src = src.replace(onCreate, (call) => `${call}\n    applyTabletRotation(resources.configuration) ${MARKER}`);

    // Helper + override go right after the class header.
    const classHeader = /class MainActivity\s*:\s*ReactActivity\(\)\s*\{/;
    if (!classHeader.test(src)) {
      throw new Error('withTabletRotation: MainActivity class header not found');
    }
    src = src.replace(classHeader, (header) => `${header}${APPLY_FN}`);

    mod.modResults.contents = src;
    return mod;
  });
}

module.exports = function withTabletRotation(config) {
  return withTabletRotationAndroid(withTabletRotationIOS(config));
};
