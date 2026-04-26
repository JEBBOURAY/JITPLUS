import { Controller, Get, Param, Query, Res, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

// ── App identifiers ─────────────────────────────────────────────────────────
const ANDROID_PACKAGE = 'com.jitplus.client';
const ANDROID_PRO_PACKAGE = 'com.jitplus.pro';
const IOS_BUNDLE_ID = 'com.jitplus.client';
const IOS_PRO_BUNDLE_ID = 'com.jitplus.pro';

// ── Env-driven config ───────────────────────────────────────────────────────
const IOS_TEAM_ID = process.env.APPLE_TEAM_ID || '';
const IOS_APP_ID = process.env.IOS_APP_ID || '';
const IOS_PRO_APP_ID = process.env.IOS_PRO_APP_ID || '';
const ANDROID_SHA256 = process.env.ANDROID_SHA256_FINGERPRINT || '';
const ANDROID_PRO_SHA256 = process.env.ANDROID_PRO_SHA256_FINGERPRINT || '';

// ── Store URLs ──────────────────────────────────────────────────────────────
const PLAY_STORE = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const PLAY_STORE_PRO = `https://play.google.com/store/apps/details?id=${ANDROID_PRO_PACKAGE}`;
const APP_STORE = IOS_APP_ID
  ? `https://apps.apple.com/app/id${IOS_APP_ID}`
  : 'https://apps.apple.com/search?term=jitplus';
const APP_STORE_PRO = IOS_PRO_APP_ID
  ? `https://apps.apple.com/app/id${IOS_PRO_APP_ID}`
  : 'https://apps.apple.com/search?term=jitplus+pro';

/** CUID format: starts with 'c', 24 lowercase alphanumeric chars */
const CUID_RE = /^c[a-z0-9]{24}$/;

/**
 * Variant configuration: each app variant (client / pro) bundles the
 * scheme, package, store URLs and display title in one object so the
 * smart-redirect renderer stays variant-agnostic.
 */
interface AppVariant {
  scheme: string;
  androidPackage: string;
  playStore: string;
  appStore: string;
  title: string;
}

const VARIANT_CLIENT: AppVariant = {
  scheme: 'jitplus',
  androidPackage: ANDROID_PACKAGE,
  playStore: PLAY_STORE,
  appStore: APP_STORE,
  title: 'JitPlus',
};

const VARIANT_PRO: AppVariant = {
  scheme: 'jitpluspro',
  androidPackage: ANDROID_PRO_PACKAGE,
  playStore: PLAY_STORE_PRO,
  appStore: APP_STORE_PRO,
  title: 'JitPlus Pro',
};

/**
 * Whitelist of in-app routes the `/app?redirect=` endpoint is allowed to
 * forward to. Keeps the smart-redirect endpoint from being abused as an
 * open-redirect and guarantees we only point at real app screens.
 */
const APP_ROUTE_MAP: Record<string, string> = {
  '/': '',
  '/(tabs)': '',
  '/(tabs)/discover': 'discover',
  '/(tabs)/qr': 'qr',
  '/(tabs)/notifications': 'notifications',
  '/referral': 'referral',
  '/settings': 'settings',
};

/** Default app path when a redirect value is missing or unknown. */
const DEFAULT_APP_PATH = '';

/** HTML-escape strings before injecting them into the generated redirect page. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the platform-aware smart-redirect HTML page.
 * Tries the native app first, falls back to the relevant store.
 *
 * @param variant client or pro target app
 * @param appPath path portion of the deep link (no leading slash)
 */
function renderSmartRedirect(variant: AppVariant, appPath: string): string {
  const safePath = appPath.replace(/^\/+/, '');
  const deepLink = `${variant.scheme}://${safePath}`;
  const intentUri =
    `intent://${safePath}#Intent;scheme=${variant.scheme};` +
    `package=${variant.androidPackage};` +
    `S.browser_fallback_url=${encodeURIComponent(variant.playStore)};end`;

  const safeDeepLink = escapeHtml(deepLink);
  const safeIntentUri = escapeHtml(intentUri);
  const safeTitle = escapeHtml(variant.title);
  const safePlayStore = escapeHtml(variant.playStore);
  const safeAppStore = escapeHtml(variant.appStore);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;color:#1a1a2e;text-align:center}
  .card{background:#fff;border-radius:16px;padding:32px 24px;max-width:360px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 8px}
  p{font-size:14px;color:#666;margin:0 0 20px}
  .btn{display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 32px;border-radius:12px;font-size:16px;font-weight:600}
  .btn:hover{background:#6d28d9}
  .stores{margin-top:16px;font-size:13px;color:#888}
  .stores a{color:#7c3aed;text-decoration:none}
</style>
<script>
(function(){
  var ua=navigator.userAgent||'';
  var isAndroid=/android/i.test(ua);
  var isIOS=/iphone|ipad|ipod/i.test(ua);
  if(isAndroid){
    window.location.replace('${safeIntentUri}');
  } else if(isIOS){
    var now=Date.now();
    window.location.replace('${safeDeepLink}');
    setTimeout(function(){
      if(Date.now()-now<2000) window.location.replace('${safeAppStore}');
    },1500);
  }
})();
</script>
</head>
<body>
<div class="card">
  <h1>${safeTitle}</h1>
  <p>Ouvrez ce lien dans l'application ${safeTitle}.</p>
  <a class="btn" href="${safeDeepLink}">Ouvrir dans l'app</a>
  <div class="stores">
    <p>Pas encore l'app ?</p>
    <a href="${safePlayStore}">Google Play</a> · <a href="${safeAppStore}">App Store</a>
  </div>
</div>
</body>
</html>`;
}

// ── Strict Android assetlinks entry typing (matches Google's spec) ─────────
interface AssetLinksEntry {
  relation: ['delegate_permission/common.handle_all_urls'];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

@Controller()
@SkipThrottle()
export class DeeplinkController {
  /**
   * Smart redirect for shared merchant links — opens the client app.
   * - Android: Intent URI tries app first, falls back to Play Store
   * - iOS: tries jitplus:// scheme, then App Store
   * - Desktop: stays on the landing page (with store links)
   */
  @Get('m/:id')
  @Header('Cache-Control', 'no-store')
  handleMerchantLink(@Param('id') id: string, @Res() res: Response): void {
    if (!CUID_RE.test(id)) {
      res.status(400).send('Invalid link');
      return;
    }
    res.type('html').send(renderSmartRedirect(VARIANT_CLIENT, `merchant/${id}`));
  }

  /**
   * Referral campaign landing — opens the client app on the parrainage screen.
   */
  @Get('referral')
  @Header('Cache-Control', 'no-store')
  handleReferralLink(@Res() res: Response): void {
    res.type('html').send(renderSmartRedirect(VARIANT_CLIENT, 'referral'));
  }

  /**
   * Pro referral campaign landing — opens the merchant (Pro) app on its
   * parrainage screen. Used when a merchant shares their referral link to
   * invite another merchant to JitPlus Pro.
   */
  @Get('pro/referral')
  @Header('Cache-Control', 'no-store')
  handleProReferralLink(@Res() res: Response): void {
    res.type('html').send(renderSmartRedirect(VARIANT_PRO, 'referral'));
  }

  /**
   * Generic app opener — used by email CTAs that only need to open the app
   * on a specific tab (discover, qr, notifications, …). Accepts a whitelisted
   * `?redirect=` query param; unknown values fall back to the app home.
   */
  @Get('app')
  @Header('Cache-Control', 'no-store')
  handleAppLink(
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ): void {
    const appPath =
      typeof redirect === 'string' && Object.prototype.hasOwnProperty.call(APP_ROUTE_MAP, redirect)
        ? APP_ROUTE_MAP[redirect]
        : DEFAULT_APP_PATH;
    res.type('html').send(renderSmartRedirect(VARIANT_CLIENT, appPath));
  }

  /**
   * Android App Links verification file.
   * Google's crawler fetches this to verify each app variant owns the domain.
   */
  @Get('.well-known/assetlinks.json')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'public, max-age=86400')
  assetLinks(@Res() res: Response): void {
    const entries: AssetLinksEntry[] = [];
    if (ANDROID_SHA256) {
      entries.push({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: [ANDROID_SHA256],
        },
      });
    }
    if (ANDROID_PRO_SHA256) {
      entries.push({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PRO_PACKAGE,
          sha256_cert_fingerprints: [ANDROID_PRO_SHA256],
        },
      });
    }
    if (entries.length === 0) {
      res.status(404).json({ error: 'No Android SHA-256 fingerprints configured' });
      return;
    }
    res.json(entries);
  }

  /**
   * iOS Universal Links verification file.
   * Apple fetches this to verify each app variant owns the domain.
   */
  @Get('.well-known/apple-app-site-association')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'public, max-age=86400')
  appleAppSiteAssociation(@Res() res: Response): void {
    if (!IOS_TEAM_ID) {
      res.status(404).json({ error: 'APPLE_TEAM_ID not configured' });
      return;
    }
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appID: `${IOS_TEAM_ID}.${IOS_BUNDLE_ID}`,
            paths: ['/m/*', '/referral', '/app'],
          },
          {
            appID: `${IOS_TEAM_ID}.${IOS_PRO_BUNDLE_ID}`,
            paths: ['/pro/referral'],
          },
        ],
      },
    });
  }
}

