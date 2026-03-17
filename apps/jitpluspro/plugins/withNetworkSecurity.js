/**
 * Expo config plugin — Network Security Configuration (Android)
 *
 * Generates a network_security_config.xml that:
 * - Blocks cleartext (HTTP) traffic to all domains in production
 * - Allows cleartext to localhost / emulator IPs for development
 * - Uses system CA certificates for trust anchors
 *
 * This plugin does NOT enable certificate pinning — use withCertificatePinning
 * for that once you have a custom domain with a managed SSL certificate.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Production: HTTPS only, system CAs only -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <!-- Development: allow cleartext to local dev servers -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>`;

function withNetworkSecurity(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'xml',
      );
      fs.mkdirSync(resDir, { recursive: true });
      fs.writeFileSync(
        path.join(resDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
      );

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

module.exports = withNetworkSecurity;
