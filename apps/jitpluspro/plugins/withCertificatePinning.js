/**
 * Expo config plugin — Certificate Pinning (Android + iOS)
 *
 * Android: Injects a network_security_config.xml that pins your API domain's
 *          public key hashes. Prevents MITM attacks even on rooted devices.
 *
 * iOS: Configures NSAppTransportSecurity with NSPinnedDomains on iOS 14+.
 *
 * IMPORTANT: Update the pin hashes when your SSL certificate rotates.
 *
 * To get your pin hash, run:
 *   openssl s_client -servername api.jitplus.ma -connect api.jitplus.ma:443 2>/dev/null | \
 *     openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | \
 *     openssl dgst -sha256 -binary | openssl enc -base64
 *
 * Always include at least 2 pins: current certificate + backup/next certificate.
 */
const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── Configuration ───────────────────────────────────────────────
// Replace these with your actual pin hashes from the command above.
// Pin 1 = current cert, Pin 2 = backup cert (for rotation).
const API_DOMAIN = 'api.jitplus.ma';
const PIN_HASHES = [
  // TODO: Replace with actual SHA-256 SPKI hashes from your SSL certs
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Current cert pin
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', // Backup cert pin
];

// ── Android: network_security_config.xml ────────────────────────
function withAndroidPinning(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'xml',
      );
      fs.mkdirSync(resDir, { recursive: true });

      const pinEntries = PIN_HASHES.map(
        (h) => `            <pin digest="SHA-256">${h}</pin>`,
      ).join('\n');

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow cleartext only for localhost/emulator (dev) -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">${API_DOMAIN}</domain>
        <pin-set expiration="2027-01-01">
${pinEntries}
        </pin-set>
    </domain-config>
    <!-- Dev: allow cleartext to local dev server -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">localhost</domain>
    </domain-config>
</network-security-config>`;

      fs.writeFileSync(path.join(resDir, 'network_security_config.xml'), xml);

      // Ensure AndroidManifest references the config
      const manifestPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'AndroidManifest.xml',
      );
      let manifest = fs.readFileSync(manifestPath, 'utf8');
      if (!manifest.includes('networkSecurityConfig')) {
        manifest = manifest.replace(
          '<application',
          '<application android:networkSecurityConfig="@xml/network_security_config"',
        );
        fs.writeFileSync(manifestPath, manifest);
      }

      return cfg;
    },
  ]);
}

// ── iOS: NSAppTransportSecurity + NSPinnedDomains (iOS 14+) ─────
function withIOSPinning(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSAppTransportSecurity = {
      ...(cfg.modResults.NSAppTransportSecurity || {}),
      NSPinnedDomains: {
        [API_DOMAIN]: {
          NSIncludesSubdomains: true,
          NSPinnedLeafIdentities: PIN_HASHES.map((hash) => ({
            'SPKI-SHA256-BASE64': hash,
          })),
        },
      },
    };
    return cfg;
  });
}

module.exports = function withCertificatePinning(config) {
  config = withAndroidPinning(config);
  config = withIOSPinning(config);
  return config;
};
