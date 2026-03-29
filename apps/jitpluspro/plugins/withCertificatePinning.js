/**
 * Expo config plugin — SSL Certificate Pinning (Android)
 *
 * Adds public-key (SPKI) pinning to the network_security_config.xml so the
 * app only trusts the specific certificates you control.
 *
 * HOW TO GET SHA-256 PINS:
 *   openssl s_client -connect api.jitplus.com:443 -servername api.jitplus.com < /dev/null 2>/dev/null \
 *     | openssl x509 -pubkey -noout \
 *     | openssl pkey -pubin -outform DER \
 *     | openssl dgst -sha256 -binary \
 *     | openssl enc -base64
 *
 * You need TWO pins: the leaf cert + a backup (CA intermediate or a second cert).
 * Android requires at least two <pin> entries or a pin + an override for debug.
 *
 * IMPORTANT: Only enable this plugin once you have a stable custom domain
 * (e.g. api.jitplus.com) with a managed SSL certificate. Cloud Run's
 * *.a.run.app wildcard certificates rotate too frequently for pinning.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────
// Replace these with your actual values or set via environment variables.
const PINNED_DOMAIN = process.env.CERT_PIN_DOMAIN || 'api.jitplus.com';

// Primary pin: your leaf / server certificate's SPKI hash
const PRIMARY_PIN = process.env.CERT_PIN_PRIMARY || 'REPLACE_WITH_YOUR_LEAF_CERT_SHA256_BASE64';
// Backup pin: intermediate CA or backup certificate's SPKI hash
const BACKUP_PIN = process.env.CERT_PIN_BACKUP || 'REPLACE_WITH_YOUR_BACKUP_CERT_SHA256_BASE64';

// Pin expiry date (ISO 8601). Android ignores expired pin-sets and falls back
// to normal validation — this prevents bricking the app if you forget to rotate.
const PIN_EXPIRY = '2026-12-31';
// ────────────────────────────────────────────────────────────────────

function buildNetworkSecurityConfig() {
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Production: HTTPS only, system CAs, certificate pinning -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Pin the API domain to prevent MITM attacks -->
    <domain-config>
        <domain includeSubdomains="true">${PINNED_DOMAIN}</domain>
        <pin-set expiration="${PIN_EXPIRY}">
            <pin digest="SHA-256">${PRIMARY_PIN}</pin>
            <pin digest="SHA-256">${BACKUP_PIN}</pin>
        </pin-set>
    </domain-config>

    <!-- Development: allow cleartext to local dev servers -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>`;
}

function withCertificatePinning(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'xml',
      );
      fs.mkdirSync(resDir, { recursive: true });

      // This overwrites the file produced by withNetworkSecurity — make sure
      // this plugin is listed AFTER withNetworkSecurity in app.config.js plugins.
      fs.writeFileSync(
        path.join(resDir, 'network_security_config.xml'),
        buildNetworkSecurityConfig(),
      );

      // Ensure AndroidManifest references the network security config
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

module.exports = withCertificatePinning;
