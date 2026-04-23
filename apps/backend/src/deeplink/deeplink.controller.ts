import { Controller, Get, Param, Query, Res, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

const ANDROID_PACKAGE = 'com.jitplus.client';
const IOS_BUNDLE_ID = 'com.jitplus.client';
const IOS_TEAM_ID = process.env.APPLE_TEAM_ID || '';
const IOS_APP_ID = process.env.IOS_APP_ID || '';
const PLAY_STORE = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const APP_STORE = IOS_APP_ID
  ? `https://apps.apple.com/app/id${IOS_APP_ID}`
  : 'https://apps.apple.com/search?term=jitplus';

// SHA-256 fingerprint of the Android signing key — required for Android App Links verification
const ANDROID_SHA256 = process.env.ANDROID_SHA256_FINGERPRINT || '';

/** CUID format: starts with 'c', 24 lowercase alphanumeric chars */
const CUID_RE = /^c[a-z0-9]{24}$/;

/**
 * Whitelist of in-app routes the `/app?redirect=` endpoint is allowed to
 * forward to. Keeps the smart-redirect endpoint from being abused as an
 * open-redirect and guarantees we only point at real app screens.
 *
 * Keys are the web-side `redirect` value the marketing links use; values are
 * the corresponding `jitplus://` path.
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
function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the platform-aware smart-redirect HTML page used by every
 * email/web CTA. Tries the native app first, falls back to the store.
 *
 * @param appPath path portion of the deep link (no leading slash)
 */
function renderSmartRedirect(appPath: string): string {
  const safePath = appPath.replace(/^\/+/, '');
  const deepLink = `jitplus://${safePath}`;
  const intentUri = `intent://${safePath}#Intent;scheme=jitplus;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`;
  const safeDeepLink = escape(deepLink);
  const safeIntentUri = escape(intentUri);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JitPlus</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;color:#1a1a2e;text-align:center}
  .card{background:#fff;border-radius:16px;padding:32px 24px;max-width:360px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .logo{width:80px;height:80px;margin:0 auto 16px}
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
      if(Date.now()-now<2000) window.location.replace('${APP_STORE}');
    },1500);
  }
})();
</script>
</head>
<body>
<div class="card">
  <h1>JitPlus</h1>
  <p>Ouvrez ce lien dans l'application JitPlus.</p>
  <a class="btn" id="open" href="${safeDeepLink}">Ouvrir dans l'app</a>
  <div class="stores">
    <p>Pas encore l'app ?</p>
    <a href="${PLAY_STORE}">Google Play</a> · <a href="${APP_STORE}">App Store</a>
  </div>
</div>
</body>
</html>`;
}

@Controller()
@SkipThrottle()
export class DeeplinkController {
  /**
   * Smart redirect for shared merchant links.
   * - Android: Intent URI tries app first, falls back to Play Store
   * - iOS: tries jitplus:// scheme, then App Store
   * - Desktop: redirects to Play Store
   */
  @Get('m/:id')
  @Header('Cache-Control', 'no-store')
  handleMerchantLink(@Param('id') id: string, @Res() res: Response): void {
    // Validate merchant ID format to prevent XSS/injection
    if (!CUID_RE.test(id)) {
      res.status(400).send('Invalid link');
      return;
    }
    res.type('html').send(renderSmartRedirect(`merchant/${id}`));
  }

  /**
   * Referral campaign landing — opens the in-app parrainage screen.
   * Used by welcome/referral email CTAs.
   */
  @Get('referral')
  @Header('Cache-Control', 'no-store')
  handleReferralLink(@Res() res: Response): void {
    res.type('html').send(renderSmartRedirect('referral'));
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
    res.type('html').send(renderSmartRedirect(appPath));
  }

  /**
   * Android App Links verification file.
   * Google's crawler fetches this to verify the app owns the domain.
   */
  @Get('.well-known/assetlinks.json')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'public, max-age=86400')
  assetLinks(@Res() res: Response): void {
    if (!ANDROID_SHA256) {
      res.status(404).json({ error: 'ANDROID_SHA256_FINGERPRINT not configured' });
      return;
    }
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: [ANDROID_SHA256],
        },
      },
    ]);
  }

  /**
   * iOS Universal Links verification file.
   * Apple fetches this to verify the app owns the domain.
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
        ],
      },
    });
  }
}
