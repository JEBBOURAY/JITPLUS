/**
 * Expo config plugin — injects iOS PrivacyInfo.xcprivacy for JitPlus Pro
 *
 * Required since Apple review policy update of May 1, 2024.
 * All apps that use "required reason" APIs (FileSystem, UserDefaults,
 * SecureStore, AsyncStorage, BootTime, DiskSpace) must include this manifest.
 *
 * References:
 *  - https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
 *  - https://developer.apple.com/support/third-party-SDK-requirements/
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/** Full PrivacyInfo.xcprivacy plist content — adapted for merchant (B2B) app */
const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- ── Data collected by this app ──────────────────────────────────── -->
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <!-- Business owner name -->
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <!-- Email address -->
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <!-- Phone number (for account/WhatsApp contact) -->
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhoneNumber</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <!-- Precise location (for placing merchant on map) -->
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePreciseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <!-- Photos (logo & cover image for merchant profile) -->
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>

  <!-- ── Accessed APIs with required reasons ─────────────────────────── -->
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <!-- UserDefaults / NSUserDefaults (AsyncStorage, expo-secure-store internals) -->
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <!-- CA92.1: Access to store user preferences in same app or extension -->
        <string>CA92.1</string>
      </array>
    </dict>
    <!-- File timestamp (expo-file-system reads file timestamps for uploads) -->
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <!-- C617.1: Access file timestamps for the app's own files -->
        <string>C617.1</string>
      </array>
    </dict>
    <!-- Disk space (Metro / expo-file-system may check available disk before uploading) -->
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <!-- E174.1: Access disk space to check available space before writing -->
        <string>E174.1</string>
      </array>
    </dict>
    <!-- System boot time (React Native internals use it for timers/animation) -->
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <!-- 35F9.1: Access boot time to measure elapsed time -->
        <string>35F9.1</string>
      </array>
    </dict>
  </array>

  <!-- This app does NOT use tracking -->
  <key>NSPrivacyTracking</key>
  <false/>
</dict>
</plist>
`;

/**
 * Adds PrivacyInfo.xcprivacy to the Xcode project during expo prebuild.
 */
const withPrivacyManifest = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosDir = path.join(config.modRequest.platformProjectRoot);
      const appDir = path.join(iosDir, config.modRequest.projectName);
      const manifestPath = path.join(appDir, 'PrivacyInfo.xcprivacy');

      // Write the file (overwrite if exists to keep it up-to-date)
      fs.writeFileSync(manifestPath, PRIVACY_MANIFEST, 'utf8');

      return config;
    },
  ]);
};

module.exports = withPrivacyManifest;
