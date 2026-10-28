import React from 'react';
import { View, Text, StyleSheet, Image, type TextProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { Clock } from 'lucide-react-native';
import { JitGames, JitGift, JitScan, JitStamp } from '@/components/icons';
import MerchantLogo from '@/components/MerchantLogo';
import { palette } from '@/contexts/ThemeContext';
import type { useLanguage } from '@/contexts/LanguageContext';
import type { PlvProgram } from '@/components/plv/usePlvProgram';
import { CLIENT_APP_ANDROID_URL, CLIENT_APP_IOS_URL } from '@/constants/app';
import { font } from '@/constants/design';
import { HEX_RE } from '@/components/stores/brand';
import type { LucideIcon } from '@/components/home/PromoSheet';

export type PlvTemplateId = 'classic' | 'window' | 'reward' | 'counter';

interface PlvTemplateDef {
  id: PlvTemplateId;
  nameKey: string;
  useKey: string;
  /** Swatch shown in the template picker. */
  swatch: readonly [string, string];
  /** Height / width of the printed format. */
  ratio: number;
}

const A4_RATIO = 1.414;
/** Above this, a stamp track becomes unreadable on print; the headline already gives the count. */
const MAX_TRACK_SLOTS = 20;

export const PLV_TEMPLATES: readonly PlvTemplateDef[] = [
  { id: 'classic', nameKey: 'home.clientPlvTplClassicName', useKey: 'home.clientPlvTplClassicUse', swatch: ['#FFFFFF', '#EDE9FE'], ratio: A4_RATIO },
  { id: 'window', nameKey: 'home.clientPlvTplWindowName', useKey: 'home.clientPlvTplWindowUse', swatch: [palette.violet, palette.charbonDark], ratio: A4_RATIO },
  { id: 'reward', nameKey: 'home.clientPlvTplRewardName', useKey: 'home.clientPlvTplRewardUse', swatch: ['#F59E0B', '#B45309'], ratio: A4_RATIO },
  { id: 'counter', nameKey: 'home.clientPlvTplCounterName', useKey: 'home.clientPlvTplCounterUse', swatch: ['#FFFFFF', palette.violet], ratio: 1 },
];

interface PlvPosterProps {
  template: PlvTemplateId;
  width: number;
  merchantName: string;
  logoUrl?: string | null;
  /** Merchant brand colour (hex); falls back to the JitPlus violet. */
  brandColor?: string | null;
  program: PlvProgram;
  t: ReturnType<typeof useLanguage>['t'];
}


function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/**
 * Brand colour safe for white text. Merchants can pick very light theme
 * colours (yellow, pastel, white) that would make the printed text vanish.
 */
export function readableBrand(brandColor?: string | null): string {
  let c = brandColor && HEX_RE.test(brandColor) ? brandColor : palette.violet;
  // 0.18 ≈ 4.5:1 against white, so the small poster lines stay readable too.
  for (let i = 0; i < 8 && luminance(c) > 0.18; i++) c = shade(c, -0.2);
  return c;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Gold accents on the brand block, or white when the brand is too light for gold. */
function accentOn(brand: string): string {
  return contrastRatio(palette.gold, brand) >= 3 ? palette.gold : '#FFFFFF';
}

/** Poster text must not follow the OS font scale, or the printed layout breaks. */
function PText(props: TextProps) {
  return <Text allowFontScaling={false} {...props} />;
}

function CoBrand({ logoUrl, size, onDark }: { logoUrl?: string | null; size: number; onDark?: boolean }) {
  const box = { width: size, height: size, borderRadius: size * 0.26 };
  const inner = { width: size * 0.72, height: size * 0.72, borderRadius: size * 0.18 };
  return (
    <View style={styles.coBrand}>
      <View style={[styles.logoBox, box, onDark && styles.logoBoxOnDark]}>
        <Image source={require('@/assets/images/jitpluslogo.png')} style={inner} resizeMode="contain" />
      </View>
      <PText style={[styles.cross, { color: onDark ? 'rgba(255,255,255,0.7)' : '#64748B', fontSize: size * 0.4 }]}>×</PText>
      <View style={[styles.logoBox, box, onDark && styles.logoBoxOnDark]}>
        <MerchantLogo logoUrl={logoUrl} style={styles.logoFill} />
      </View>
    </View>
  );
}

function MerchantName({ name, fontSize, color, marginTop, align = 'center' }: {
  name: string;
  fontSize: number;
  color: string;
  marginTop?: number;
  align?: 'center' | 'left';
}) {
  return (
    <PText
      style={[styles.merchantName, { fontSize, lineHeight: fontSize * 1.3, color, marginTop, textAlign: align }]}
      numberOfLines={1}
    >
      {name}
    </PText>
  );
}

function QrPair({ size, labelColor, borderColor, marginV }: { size: number; labelColor: string; borderColor: string; marginV: number }) {
  const items = [
    { key: 'android', label: 'Google Play', url: CLIENT_APP_ANDROID_URL },
    { key: 'ios', label: 'App Store', url: CLIENT_APP_IOS_URL },
  ];
  return (
    <View style={[styles.qrRow, { marginVertical: marginV }]}>
      {items.map((it) => (
        <View key={it.key} style={styles.qrCol}>
          <View style={[styles.qrTile, { borderColor, padding: size * 0.08, borderRadius: size * 0.12 }]}>
            <QRCode value={it.url} size={size} backgroundColor="#FFFFFF" color="#0F172A" />
          </View>
          <PText style={[styles.qrLabel, { color: labelColor, fontSize: Math.max(9, size * 0.1) }]}>{it.label}</PText>
        </View>
      ))}
    </View>
  );
}

/** One "icon + sentence" line. Its parent must stretch it to full width. */
function RuleLine({ Icon, text, color, iconColor, k, bold }: { Icon: LucideIcon; text: string; color: string; iconColor: string; k: number; bold?: boolean }) {
  return (
    <View style={[styles.ruleLine, { gap: 7 * k }]}>
      <Icon size={14 * k} color={iconColor} strokeWidth={2.2} />
      <PText
        style={[styles.ruleText, { color, fontSize: 11 * k, lineHeight: 14.5 * k }, bold && styles.ruleTextBold]}
        numberOfLines={2}
      >
        {text}
      </PText>
    </View>
  );
}

/**
 * Preview of the customer card: one empty slot per stamp, the last one being
 * the gift. Rendered on a single row whose slot size adapts to the count, so
 * it never wraps. Hidden when it would carry no information.
 */
function StampTrack({ count, available, k }: { count: number; available: number; k: number }) {
  if (!Number.isFinite(count) || count < 2 || count > MAX_TRACK_SLOTS) return null;
  const gap = 4 * k;
  const d = Math.min(18 * k, Math.floor((available - gap * (count - 1)) / count));
  if (d < 4) return null;
  return (
    <View style={[styles.trackRow, { gap }]}>
      {Array.from({ length: count }, (_, i) => {
        const isGift = i === count - 1;
        return (
          <View
            key={i}
            style={[
              styles.trackSlot,
              { width: d, height: d, borderRadius: d / 2 },
              isGift && styles.trackGift,
            ]}
          >
            {isGift && d >= 12 ? <JitGift size={d * 0.6} color="#78350F" strokeWidth={2.4} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Printable in-store poster for the JitPlus client app. Every template is
 * co-branded and carries both store QR codes, and prints the merchant's own
 * programme (earning rule, rewards, lucky wheel, validity) so the poster
 * explains how loyalty works at this specific store.
 *
 * Sizes are tuned so typical content fits the print ratio; `minHeight` lets
 * the poster grow rather than clip when a merchant has unusually long copy.
 */
function PlvPoster({ template, width, merchantName, logoUrl, brandColor, program, t }: PlvPosterProps) {
  const def = PLV_TEMPLATES.find((d) => d.id === template) ?? PLV_TEMPLATES[0];
  const minHeight = width * def.ratio;
  // Layout is designed for a ~330pt wide preview; everything scales from it.
  const k = width / 330;
  // Two QR tiles (QR + 8% padding each side + border) and the 16pt gap must
  // fit inside the widest template padding (22pt each side).
  const qrSize = Math.floor(Math.min((width - 44 * k - 20) / 2 / 1.16, 150 * k));
  const brand = readableBrand(brandColor);

  if (template === 'window') {
    const rules = [
      { Icon: JitStamp, text: program.earnLine },
      { Icon: JitGift, text: program.rewardHeadline },
      ...(program.wheelLine ? [{ Icon: JitGames, text: program.wheelLine }] : []),
    ];
    return (
      <LinearGradient
        colors={[palette.violet, palette.violetDeep, palette.charbonDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.poster, { width, minHeight, padding: 18 * k }]}
      >
        <View style={styles.center}>
          <CoBrand logoUrl={logoUrl} size={38 * k} onDark />
          <MerchantName name={merchantName} fontSize={14 * k} color="#FFFFFF" marginTop={6 * k} />
          <View style={[styles.badge, { backgroundColor: palette.gold, marginTop: 10 * k }]}>
            <PText style={[styles.badgeText, { fontSize: 9.5 * k }]}>{t('home.clientPlvWindowBadge').toUpperCase()}</PText>
          </View>
          <PText style={[styles.bigTitle, { color: '#FFFFFF', fontSize: 24 * k, lineHeight: 29 * k, marginTop: 10 * k }]}>
            {t('home.clientPlvWindowHeadline')}
          </PText>
        </View>
        <View style={[styles.stack, { gap: 6 * k, marginTop: 12 * k }]}>
          {rules.map((r, i) => (
            <View key={i} style={[styles.windowPill, { paddingVertical: 6 * k, paddingHorizontal: 12 * k }]}>
              <RuleLine Icon={r.Icon} text={r.text} color="#FFFFFF" iconColor={palette.gold} k={k} bold />
            </View>
          ))}
        </View>
        <QrPair size={Math.floor(qrSize * 0.8)} labelColor="#FFFFFF" borderColor="transparent" marginV={10 * k} />
        <PText style={[styles.footer, { color: 'rgba(255,255,255,0.65)', fontSize: 9.5 * k }]}>{t('home.clientPlvFree')}</PText>
      </LinearGradient>
    );
  }

  if (template === 'reward') {
    const pad = 18 * k;
    const blockPad = 14 * k;
    // With the wheel shown, keep a single extra reward so the poster stays A4.
    const extras = program.otherRewards.slice(0, program.wheelLine ? 1 : 2);
    const hasExtras = extras.length > 0 || !!program.wheelLine;
    const brandAccent = accentOn(brand);
    return (
      <View style={[styles.poster, { width, minHeight, padding: pad, backgroundColor: '#FFFBEB' }]}>
        <View style={styles.center}>
          <CoBrand logoUrl={logoUrl} size={36 * k} />
          <MerchantName name={merchantName} fontSize={14 * k} color="#1F2937" marginTop={6 * k} />
        </View>
        <LinearGradient
          colors={[brand, shade(brand, -0.35)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.rewardBlock, { padding: blockPad, borderRadius: 18 * k, marginTop: 10 * k }]}
        >
          <View style={[styles.rewardLabelRow, { gap: 5 * k }]}>
            <JitGift size={12 * k} color={brandAccent} strokeWidth={2.4} />
            <PText style={[styles.rewardLabel, { color: brandAccent, fontSize: 9.5 * k }]}>{t('home.clientPlvRewardLabel').toUpperCase()}</PText>
          </View>
          <PText style={[styles.bigTitle, { color: '#FFFFFF', fontSize: 20 * k, lineHeight: 25 * k, marginTop: 6 * k }]} numberOfLines={2}>
            {program.rewardHeadline}
          </PText>
          <View style={{ marginTop: 10 * k }}>
            <StampTrack count={program.slots} available={width - 2 * pad - 2 * blockPad} k={k} />
          </View>
          <PText style={[styles.sub, { color: 'rgba(255,255,255,0.92)', fontSize: 11 * k, lineHeight: 15 * k, marginTop: 8 * k }]} numberOfLines={2}>
            {program.earnLine}
          </PText>
        </LinearGradient>
        {hasExtras ? (
          <View style={[styles.extrasBlock, { gap: 5 * k, padding: 10 * k, borderRadius: 12 * k, marginTop: 10 * k }]}>
            {extras.length > 0 ? (
              <PText style={[styles.extrasLabel, { fontSize: 9 * k }]}>{t('home.clientPlvAlsoLabel').toUpperCase()}</PText>
            ) : null}
            {extras.map((r, i) => (
              <RuleLine key={i} Icon={JitGift} text={r.label} color="#78350F" iconColor="#D97706" k={k} />
            ))}
            {program.wheelLine ? (
              <RuleLine Icon={JitGames} text={program.wheelLine} color="#78350F" iconColor="#B45309" k={k} bold />
            ) : null}
          </View>
        ) : null}
        <QrPair size={Math.floor(qrSize * 0.75)} labelColor="#334155" borderColor="#FDE68A" marginV={10 * k} />
        <PText style={[styles.footer, { color: '#92400E', fontSize: 9.5 * k }]} numberOfLines={2}>
          {hasExtras ? t('home.clientPlvFree') : t('home.clientPlvRewardSub')}
        </PText>
      </View>
    );
  }

  if (template === 'counter') {
    return (
      <View style={[styles.poster, styles.posterBordered, { width, minHeight, paddingBottom: 14 * k }]}>
        <View style={[styles.counterBand, { backgroundColor: brand, paddingVertical: 12 * k, paddingHorizontal: 16 * k }]}>
          <JitScan size={20 * k} color="#FFFFFF" strokeWidth={2.4} />
          <PText style={[styles.counterBandText, { fontSize: 20 * k }]}>{t('home.clientPlvCounterBand').toUpperCase()}</PText>
        </View>
        <QrPair size={Math.floor(qrSize * 0.9)} labelColor="#334155" borderColor="#E2E8F0" marginV={10 * k} />
        <View style={[styles.counterFooter, { paddingHorizontal: 16 * k, gap: 10 * k }]}>
          <CoBrand logoUrl={logoUrl} size={30 * k} />
          <View style={styles.flex1}>
            <MerchantName name={merchantName} fontSize={10.5 * k} color="#1F2937" align="left" />
            <PText style={[styles.counterText, { fontSize: 11.5 * k, lineHeight: 15 * k }]} numberOfLines={2}>
              {program.rewardHeadline}
            </PText>
            <PText style={[styles.counterSub, { fontSize: 10 * k, lineHeight: 13.5 * k }]} numberOfLines={2}>
              {program.earnLine}
            </PText>
          </View>
        </View>
      </View>
    );
  }

  // classic
  const how = [t('home.clientPlvStep1'), program.earnLine, program.rewardShort];
  return (
    <View style={[styles.poster, styles.posterBordered, { width, minHeight, padding: 18 * k }]}>
      <View style={[styles.classicTopBar, { backgroundColor: brand, height: 6 * k }]} />
      <View style={styles.center}>
        <CoBrand logoUrl={logoUrl} size={40 * k} />
        <MerchantName name={merchantName} fontSize={14 * k} color="#1F2937" marginTop={6 * k} />
        <PText style={[styles.bigTitle, { color: '#0F172A', fontSize: 18 * k, lineHeight: 23 * k, marginTop: 8 * k }]} numberOfLines={2}>
          {t('home.clientPlvHeadline')}
        </PText>
      </View>
      <QrPair size={Math.floor(qrSize * 0.8)} labelColor="#334155" borderColor="#E2E8F0" marginV={10 * k} />
      <View style={[styles.howBlock, { padding: 10 * k, borderRadius: 14 * k, gap: 6 * k, backgroundColor: `${brand}0F`, borderColor: `${brand}33` }]}>
        <PText style={[styles.howLabel, { color: brand, fontSize: 9.5 * k }]}>{t('home.clientPlvHowLabel').toUpperCase()}</PText>
        {how.map((line, i) => (
          <View key={i} style={[styles.howRow, { gap: 8 * k }]}>
            <View style={[styles.stepNum, { backgroundColor: brand, width: 18 * k, height: 18 * k, borderRadius: 9 * k }]}>
              <PText style={[styles.stepNumText, { fontSize: 10 * k }]}>{i + 1}</PText>
            </View>
            <PText style={[styles.howText, { fontSize: 11 * k, lineHeight: 14.5 * k }]} numberOfLines={2}>{line}</PText>
          </View>
        ))}
        {program.wheelLine ? (
          <RuleLine Icon={JitGames} text={program.wheelLine} color="#334155" iconColor={brand} k={k} bold />
        ) : null}
      </View>
      <View style={[styles.classicFooter, { gap: 5 * k, marginTop: 8 * k }]}>
        {program.validityLine ? <Clock size={11 * k} color="#64748B" strokeWidth={2} /> : null}
        <PText style={[styles.footer, styles.footerInline, { color: '#64748B', fontSize: 9.5 * k }]} numberOfLines={1}>
          {program.validityLine ?? t('home.clientPlvScanHint')}
        </PText>
      </View>
    </View>
  );
}

export default React.memo(PlvPoster);

const styles = StyleSheet.create({
  poster: { borderRadius: 14, overflow: 'hidden', justifyContent: 'space-between' },
  posterBordered: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  center: { alignItems: 'center' },
  stack: { alignSelf: 'stretch' },
  flex1: { flex: 1 },

  coBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoBoxOnDark: { borderColor: 'rgba(255,255,255,0.25)' },
  logoFill: { width: '100%', height: '100%' },
  cross: { fontFamily: font.bold },

  qrRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  qrCol: { alignItems: 'center' },
  qrTile: { borderWidth: 1, backgroundColor: '#FFFFFF' },
  qrLabel: { marginTop: 5, fontFamily: font.semibold, textAlign: 'center' },

  bigTitle: { alignSelf: 'stretch', fontFamily: font.bold, textAlign: 'center', letterSpacing: -0.4 },
  sub: { alignSelf: 'stretch', fontFamily: font.regular, textAlign: 'center' },
  merchantName: { alignSelf: 'stretch', fontFamily: font.bold },
  footer: { fontFamily: font.medium, textAlign: 'center', marginTop: 4 },
  footerInline: { marginTop: 0, flexShrink: 1 },

  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#1F2937', letterSpacing: 1.2, fontFamily: font.bold },

  ruleLine: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  // flex: 1 (not flexShrink) so Android never measures the text at zero width.
  ruleText: { flex: 1, fontFamily: font.medium },
  ruleTextBold: { fontFamily: font.semibold },

  // Window
  windowPill: { borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },

  // Classic
  classicTopBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  howBlock: { borderWidth: 1 },
  howLabel: { letterSpacing: 1, fontFamily: font.bold },
  howRow: { flexDirection: 'row', alignItems: 'center' },
  howText: { flex: 1, color: '#1F2937', fontFamily: font.semibold },
  stepNum: { alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#FFFFFF', fontFamily: font.bold },
  classicFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  // Reward
  rewardBlock: { alignItems: 'center' },
  rewardLabelRow: { flexDirection: 'row', alignItems: 'center' },
  rewardLabel: { letterSpacing: 1.2, fontFamily: font.bold },
  trackRow: { flexDirection: 'row', justifyContent: 'center' },
  trackSlot: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackGift: { backgroundColor: palette.gold, borderColor: palette.gold },
  extrasBlock: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  extrasLabel: { color: '#B45309', letterSpacing: 1, fontFamily: font.bold },

  // Counter
  counterBand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  counterBandText: { color: '#FFFFFF', fontFamily: font.bold, letterSpacing: 1.5 },
  counterFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  counterText: { color: '#1F2937', fontFamily: font.bold },
  counterSub: { color: '#64748B', fontFamily: font.medium, marginTop: 1 },
});
