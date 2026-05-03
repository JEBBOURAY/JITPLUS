/**
 * Adds an iOS Notification Service Extension (NSE) target so that
 * push notifications carrying an `fcm_options.image` (or `image`/`imageUrl`)
 * payload show the image attached to the alert — Android FCM does this
 * natively, iOS requires a separate extension target.
 *
 * The extension downloads the image at delivery time and attaches it to
 * the notification before iOS renders it. Triggered by APNs `mutable-content: 1`
 * (already set by the backend Firebase service).
 *
 * Generated artefacts (idempotent — re-running prebuild is safe):
 *   ios/NotificationService/NotificationService.swift
 *   ios/NotificationService/NotificationService-Info.plist
 *   PBX target "NotificationService" embedded into the main app.
 */
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TARGET_NAME = 'NotificationService';

const NSE_SWIFT_SOURCE = `import UserNotifications

/// Downloads the remote image referenced by FCM \`fcm_options.image\`
/// (or fallback keys) and attaches it to the notification so iOS shows
/// it in the alert UI — same visual experience as Android.
class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttempt: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent
        guard let content = bestAttempt else {
            contentHandler(request.content)
            return
        }

        let info = request.content.userInfo
        let urlString =
            (info["fcm_options"] as? [String: Any])?["image"] as? String
            ?? info["image"] as? String
            ?? info["imageUrl"] as? String

        guard let raw = urlString,
              let url = URL(string: raw) else {
            contentHandler(content)
            return
        }

        let task = URLSession.shared.downloadTask(with: url) { (location, response, _) in
            defer { contentHandler(content) }
            guard let location = location else { return }

            let ext: String = {
                if let mime = response?.mimeType {
                    switch mime {
                    case "image/jpeg": return "jpg"
                    case "image/png":  return "png"
                    case "image/gif":  return "gif"
                    default: break
                    }
                }
                let p = url.pathExtension
                return p.isEmpty ? "jpg" : p
            }()

            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("nse_\\(UUID().uuidString).\\(ext)")
            try? FileManager.default.removeItem(at: tmp)
            do {
                try FileManager.default.moveItem(at: location, to: tmp)
                if let attachment = try? UNNotificationAttachment(identifier: "image", url: tmp, options: nil) {
                    content.attachments = [attachment]
                }
            } catch {}
        }
        task.resume()
    }

    override func serviceExtensionTimeWillExpire() {
        if let handler = contentHandler, let content = bestAttempt {
            handler(content)
        }
    }
}
`;

const NSE_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>NotificationService</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`;

function withNSEFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const dir = path.join(root, TARGET_NAME);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'NotificationService.swift'), NSE_SWIFT_SOURCE);
      fs.writeFileSync(path.join(dir, 'NotificationService-Info.plist'), NSE_INFO_PLIST);
      return cfg;
    },
  ]);
}

function withNSEXcodeTarget(config) {
  return withXcodeProject(config, async (cfg) => {
    const proj = cfg.modResults;
    const bundleId = cfg.ios?.bundleIdentifier;
    if (!bundleId) return cfg;

    // Idempotent guard
    const existing = proj.pbxNativeTargetSection?.() || {};
    const alreadyExists = Object.values(existing).some(
      (t) => typeof t === 'object' && t !== null && t.name === TARGET_NAME,
    );
    if (alreadyExists) return cfg;

    // Add a PBX group containing the source + plist
    const pbxGroup = proj.addPbxGroup(
      ['NotificationService.swift', 'NotificationService-Info.plist'],
      TARGET_NAME,
      TARGET_NAME,
    );

    // Attach to root project group (the unnamed/unpathed PBXGroup)
    const groups = proj.hash.project.objects['PBXGroup'];
    Object.keys(groups).forEach((key) => {
      const g = groups[key];
      if (typeof g === 'object' && g !== null && g.name === undefined && g.path === undefined) {
        proj.addToPbxGroup(pbxGroup.uuid, key);
      }
    });

    // Create the app_extension target
    const nseBundleId = `${bundleId}.${TARGET_NAME}`;
    const target = proj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, nseBundleId);

    // Build phases for the NSE target
    proj.addBuildPhase(['NotificationService.swift'], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    // Embed extension into the main app target.
    //
    // We do NOT pass `NotificationService.appex` as a filename to addBuildPhase:
    // node-xcode would create a *new* orphan PBXFileReference (no parent group),
    // which crashes CocoaPods post_install with:
    //   "Consistency issue: no parent for object NotificationService.appex".
    // Instead we reuse the productReference auto-created by addTarget — already
    // attached to the Products group — and wire it up manually.
    const mainTargetUuid = proj.getFirstTarget().uuid;
    const embedPhase = proj.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      mainTargetUuid,
      'app_extension',
    );

    const productRef = target.pbxNativeTarget.productReference;
    const buildFileUuid = proj.generateUuid();
    proj.hash.project.objects['PBXBuildFile'][buildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: productRef,
      fileRef_comment: `${TARGET_NAME}.appex`,
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
    };
    proj.hash.project.objects['PBXBuildFile'][`${buildFileUuid}_comment`] =
      `${TARGET_NAME}.appex in Embed App Extensions`;
    embedPhase.buildPhase.files.push({
      value: buildFileUuid,
      comment: `${TARGET_NAME}.appex in Embed App Extensions`,
    });

    // Configure build settings for the NSE target
    const configs = proj.pbxXCBuildConfigurationSection();
    for (const k in configs) {
      const c = configs[k];
      if (typeof c === 'object' && c?.buildSettings?.PRODUCT_NAME === `"${TARGET_NAME}"`) {
        c.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
        c.buildSettings.SWIFT_VERSION = '5.0';
        c.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        c.buildSettings.INFOPLIST_FILE = `"${TARGET_NAME}/NotificationService-Info.plist"`;
        c.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        c.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
        c.buildSettings.CLANG_ENABLE_MODULES = 'YES';
        c.buildSettings.CURRENT_PROJECT_VERSION = '1';
        c.buildSettings.MARKETING_VERSION = '1.0';
        c.buildSettings.SWIFT_OPTIMIZATION_LEVEL = '"-Onone"';
        c.buildSettings.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
      }
    }

    return cfg;
  });
}

module.exports = function withNotificationServiceExtension(config) {
  config = withNSEFiles(config);
  config = withNSEXcodeTarget(config);
  return config;
};
