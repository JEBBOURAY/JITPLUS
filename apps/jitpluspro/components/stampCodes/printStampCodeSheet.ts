import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'qrcode';
import { pluralKey } from '@jitplus/shared';
import { readableBrand } from '@/components/plv/PlvPoster';
import { resolveImageUrl } from '@/utils/imageUrl';
import type { useLanguage } from '@/contexts/LanguageContext';
import { logWarn } from '@/utils/devLogger';
import { JITPLUS_LOGO_DATA_URI } from './jitplusLogoDataUri';

/** 2 columns × 3 rows of labels per A4 page. */
const LABELS_PER_PAGE = 6;

interface PrintableStampCode {
  url: string;
  /** Position of the code in its batch (same number as on screen) */
  n: number;
}

interface SheetInput {
  codes: PrintableStampCode[];
  stamps: number;
  merchantName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  t: ReturnType<typeof useLanguage>['t'];
  locale: string;
  isRTL: boolean;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Print engines (iOS especially) don't wait for remote images: the merchant
 * logo is embedded as a data URI. Read with fetch + FileReader, in memory:
 * no file-system access, which Expo Go's scoped sandbox would refuse.
 * Returns null when there is no logo or it can't be loaded.
 */
async function merchantLogoDataUri(logoUrl?: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(resolveImageUrl(logoUrl));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    logWarn('StampCodeSheet', `merchant logo skipped: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Same content as StampCodeLabel (on-screen / single image), laid out for A4 print. */
async function buildStampCodeSheetHtml(input: SheetInput): Promise<string> {
  const { codes, stamps, t, locale, isRTL } = input;
  const brand = readableBrand(input.brandColor);
  const [merchantLogo, qrSvgs] = await Promise.all([
    merchantLogoDataUri(input.logoUrl),
    Promise.all(codes.map((c) => QRCode.toString(c.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0F172A', light: '#FFFFFF' } }))),
  ]);

  const text = {
    scanLine: escapeHtml(t('stampCodes.qr.scanLine')),
    value: escapeHtml(t(pluralKey('stampCodes.detail.value', stamps, locale), { count: stamps })),
    howTitle: escapeHtml(t('stampCodes.qr.howTitle')),
    steps: [t('stampCodes.qr.step1'), t('stampCodes.qr.step2'), t('stampCodes.qr.step3')].map(escapeHtml),
    appHint: escapeHtml(t('stampCodes.qr.appHint')),
    oneUse: escapeHtml(t('stampCodes.qr.oneUse')),
  };
  const merchantName = escapeHtml(input.merchantName);

  const label = (code: PrintableStampCode, i: number) => `
    <div class="label">
      <div class="cobrand">
        <div class="logo"><div class="img jitplus"></div></div>
        ${merchantLogo ? '<span class="cross">×</span><div class="logo"><div class="img merchant-logo"></div></div>' : ''}
      </div>
      ${merchantName ? `<div class="merchant">${merchantName}</div>` : ''}
      <div class="headline">${text.scanLine}</div>
      <div class="qr">${qrSvgs[i]}</div>
      <div class="value">${text.value}</div>
      <div class="how">
        <div class="how-title">${text.howTitle}</div>
        ${text.steps.map((s, k) => `<div class="step"><span class="num">${k + 1}</span><span>${s}</span></div>`).join('')}
        <div class="hint">${text.appHint}</div>
      </div>
      <div class="footer">${escapeHtml(t('stampCodes.detail.codeNumber', { n: code.n }))} · ${text.oneUse} · JitPlus</div>
    </div>`;

  const pages: string[] = [];
  for (let start = 0; start < codes.length; start += LABELS_PER_PAGE) {
    const slice = codes.slice(start, start + LABELS_PER_PAGE);
    pages.push(`<div class="page">${slice.map((c, k) => label(c, start + k)).join('')}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0F172A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* 3 rows × 90mm + 2 gaps = 276mm, inside the 281mm printable A4 height */
  .page { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 90mm; gap: 3mm; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .label { border: 1px dashed #CBD5E1; border-radius: 4mm; padding: 2.5mm 4mm; display: flex; flex-direction: column; align-items: center; gap: 0.9mm; overflow: hidden; }
  /* Never squash a block (the merchant name would collapse first): the label is sized to fit */
  .label > * { flex-shrink: 0; }
  .cobrand { display: flex; align-items: center; gap: 2mm; }
  .logo { width: 8mm; height: 8mm; border-radius: 2.4mm; border: 1px solid #E2E8F0; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #FFFFFF; }
  /* Logos declared once here, not per label: a 500-code batch stays a light document */
  .img { background-repeat: no-repeat; background-position: center; }
  .jitplus { width: 72%; height: 72%; background-size: contain; background-image: url("${JITPLUS_LOGO_DATA_URI}"); }
  .merchant-logo { width: 100%; height: 100%; background-size: cover;${merchantLogo ? ` background-image: url("${merchantLogo}");` : ''} }
  .cross { color: #64748B; font-weight: 700; font-size: 3.6mm; }
  .merchant { font-weight: 700; font-size: 3.6mm; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .headline { font-weight: 700; font-size: 3.2mm; color: ${brand}; text-align: center; }
  .qr { border: 0.6mm solid ${brand}; border-radius: 2.5mm; padding: 1.5mm; background: #FFFFFF; }
  .qr svg { display: block; width: 26mm; height: 26mm; }
  .value { font-weight: 600; font-size: 2.8mm; color: #475569; }
  .how { align-self: stretch; background: #F8FAFC; border-radius: 2.5mm; padding: 1.8mm 2.5mm; }
  .how-title { font-weight: 700; font-size: 2.6mm; margin-bottom: 0.8mm; }
  .step { display: flex; gap: 1.5mm; font-size: 2.4mm; line-height: 1.3; color: #334155; margin-top: 0.6mm; }
  .num { flex: none; width: 3.6mm; height: 3.6mm; border-radius: 50%; background: ${brand}; color: #FFFFFF; font-weight: 700; font-size: 2.2mm; display: flex; align-items: center; justify-content: center; }
  .hint { font-size: 2.1mm; line-height: 1.3; color: #64748B; margin-top: 0.8mm; }
  .footer { font-size: 2mm; color: #94A3B8; margin-top: auto; }
</style>
</head>
<body>${pages.join('')}</body>
</html>`;
}

/** Closing the print dialog without printing rejects on iOS: not an error for the user. */
export function isPrintCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /did not complete|cancel/i.test(message);
}

/** Opens the system print dialog (which also offers "Save as PDF"). */
export async function printStampCodeSheet(input: SheetInput): Promise<void> {
  const html = await buildStampCodeSheetHtml(input);
  await Print.printAsync({ html });
}

/** "QR-Colis novembre.pdf": readable in WhatsApp / mail, without characters file systems reject. */
function sheetFileName(label: string): string {
  const safe = label.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `QR-${safe || 'JitPlus'}.pdf`;
}

/**
 * Builds the same sheet as a PDF file and opens the share sheet (WhatsApp,
 * mail, Drive…), e.g. to send it to a printer shop or the shipping team.
 * Returns false when sharing isn't available on the device.
 */
export async function shareStampCodeSheet(input: SheetInput, label: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const html = await buildStampCodeSheetHtml(input);
  // base64: the PDF bytes come back in memory, so we never have to read the
  // print engine's own output folder (outside the app sandbox on Android /
  // Expo Go, where expo-sharing refuses it: "Not allowed to read file under given URL").
  const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });
  const file = await writeShareableCopy(base64, label);
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  await Sharing.shareAsync(file, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: label });
  return true;
}

/**
 * Writes the PDF into the app's cache directory (always readable by
 * expo-sharing) under the batch name ("QR-Colis novembre.pdf") so the
 * recipient sees a meaningful attachment.
 */
async function writeShareableCopy(base64: string | undefined, label: string): Promise<string> {
  if (!base64) throw new Error('PDF generation returned no data');
  // URI-encoded (spaces, Arabic): the file on disk keeps the readable name.
  const target = `${FileSystem.cacheDirectory}${encodeURIComponent(sheetFileName(label))}`;
  await FileSystem.deleteAsync(target, { idempotent: true }).catch((e) =>
    logWarn('StampCodeSheet', `stale PDF not removed: ${e instanceof Error ? e.message : String(e)}`),
  );
  await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
  return target;
}
