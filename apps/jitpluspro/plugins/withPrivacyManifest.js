/**
 * Expo config plugin — Apple PrivacyInfo.xcprivacy
 *
 * Required since Apple review policy May 2024.
 * Declares all "required reason" APIs the app uses so App Store Connect
 * accepts the binary without rejection.
 *
 * References:
 *   https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
 *   https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── Privacy manifest content ───────────────────────────────────────
// Each entry maps to an Apple "required reason API" category.
// Update the reasons below if you add new SDK dependencies.
const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>

    <!-- ── Tracking declaration ─────────────────────────────────── -->
    <!-- App does NOT track users across apps/websites (no IDFA) -->
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>

    <!-- ── Required Reason APIs ─────────────────────────────────── -->
    <key>NSPrivacyAccessedAPITypes</key>
    <array>

        <!-- UserDefaults — used by AsyncStorage, expo-secure-store, React Native internals -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- CA92.1: Access info from same app (own app preferences) -->
                <string>CA92.1</string>
            </array>
        </dict>

        <!-- File timestamp APIs — used by Metro bundler, expo-file-system internals -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- C617.1: Access inside app container -->
                <string>C617.1</string>
            </array>
        </dict>

        <!-- System boot time / uptime — used by React Native performance timing -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- 35F9.1: Measure elapsed time (animations, perf) -->
                <string>35F9.1</string>
            </array>
        </dict>

        <!-- Disk space APIs — used by React Native / Expo internals for cache management -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <!-- E174.1: Check available disk space before writing -->
                <string>E174.1</string>
            </array>
        </dict>

    </array>

    <!-- ── Collected Data Types ─────────────────────────────────── -->
    <!-- Declares what data the app collects (mirrors App Store privacy labels) -->
    <key>NSPrivacyCollectedDataTypes</key>
    <array>

        <!-- Email address — registration & login -->
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

        <!-- Name — merchant business name -->
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

        <!-- Phone number — registration -->
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

        <!-- Precise location — store mapping (foreground only) -->
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

        <!-- Photos — logo/cover upload -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>

        <!-- Crash data — Sentry crash reports -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeCrashData</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>

        <!-- Device ID — FCM push token -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeDeviceID</string>
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

</dict>
</plist>`;
// ────────────────────────────────────────────────────────────────────

function withPrivacyManifest(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosDir = cfg.modRequest.platformProjectRoot;
      const appName = cfg.modRequest.projectName || cfg.name || 'jitpluspro';
      const targetDir = path.join(iosDir, appName);

      // Ensure directory exists (should already from Expo prebuild)
      fs.mkdirSync(targetDir, { recursive: true });

      const privacyPath = path.join(targetDir, 'PrivacyInfo.xcprivacy');
      fs.writeFileSync(privacyPath, PRIVACY_MANIFEST);

      return cfg;
    },
  ]);
}

module.exports = withPrivacyManifest;
