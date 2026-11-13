import React, { createContext, useContext, useMemo } from 'react';
import { View, StyleSheet, Image, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { Cairo_500Medium } from '@expo-google-fonts/cairo/500Medium';
import { Cairo_700Bold } from '@expo-google-fonts/cairo/700Bold';
import { Bell, Check, Download, Link2, MapPin, Tag, UserPlus } from 'lucide-react-native';
import { JitGames, JitGift, JitStamp, JitStar } from '@/components/icons';
import MerchantLogo from '@/components/MerchantLogo';
import { PText, readableBrand } from '@/components/plv/PlvPoster';
import type { PlvProgram } from '@/components/plv/usePlvProgram';
import type { useLanguage } from '@/contexts/LanguageContext';
import { font } from '@/constants/design';
import type { LucideIcon } from '@/components/home/PromoSheet';

export const SOCIAL_SLIDES = ['partner', 'perks', 'reward', 'steps', 'cta'] as const;
type SocialSlideId = (typeof SOCIAL_SLIDES)[number];

/** Feed post (4:5) or full-screen story / WhatsApp status (9:16), with the exported size in pixels. */
export const SOCIAL_FORMATS = {
  post: { ratio: 1.25, width: 1080, height: 1350 },
  story: { ratio: 16 / 9, width: 1080, height: 1920 },
} as const;
export type SocialFormat = keyof typeof SOCIAL_FORMATS;

/**
 * Lexend has no Arabic glyphs: an Arabic post is drawn in Cairo. The screen
 * passes this map to `useFonts` before showing one; each key is the family name.
 */
export const SOCIAL_ARABIC_FONTS = { Cairo_500Medium, Cairo_700Bold };
const ARABIC_BOLD: keyof typeof SOCIAL_ARABIC_FONTS = 'Cairo_700Bold';
const ARABIC_REGULAR: keyof typeof SOCIAL_ARABIC_FONTS = 'Cairo_500Medium';

/** Width the sizes below are drawn for; everything scales with the real width. */
const BASE_WIDTH = 360;
const PAD = 26;
/** More slots than this no longer fit as readable stamps; the header keeps the real count. */
const MAX_STAMPS_SHOWN = 12;
/** A story has room to spare: the body is enlarged instead of floating in the middle. */
const STORY_BODY_SCALE = 1.06;
/** Cairo is drawn taller than Lexend: same sizes need more leading. */
const ARABIC_LEADING = 1.18;

const VIOLET = '#7C3AED';
const ORANGE = '#F59E0B';
const ORANGE_INK = '#D97706';
const GOLD = '#FBBF24';
const GREEN = '#10B981';
const GREEN_INK = '#059669';
const INK = '#0F172A';
const GRADIENT_START = { x: 0, y: 0.5 };
const GRADIENT_END = { x: 1, y: 0.5 };

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` blended towards `b` (0 = a, 1 = b). */
function mix(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * amount));
  return `#${((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0')}`;
}

/** Colours of a post, derived from the merchant's brand colour. */
function buildPalette(brandColor?: string | null) {
  const brand = readableBrand(brandColor);
  const [r, , b] = rgb(brand);
  // A red or orange brand next to the JitPlus orange gives a flat gradient: pair it with violet.
  const partner = r > 150 && r > b * 1.6 ? VIOLET : ORANGE;
  return {
    brand,
    brandDeep: mix(brand, '#000000', 0.3),
    brandSoft: mix('#FFFFFF', brand, 0.14),
    gradient: [brand, partner] as const,
    /** Same idea, readable on the dark slides. */
    gradientOnDark: [GOLD, mix(brand, '#FFFFFF', 0.5)] as const,
  };
}

type Palette = ReturnType<typeof buildPalette>;

interface PostContext {
  k: number;
  rtl: boolean;
  bold: string;
  regular: string;
  colors: Palette;
}

const Ctx = createContext<PostContext>({
  k: 1,
  rtl: false,
  bold: font.bold,
  regular: font.regular,
  colors: buildPalette(),
});

interface TProps {
  children: React.ReactNode;
  /** Font size at the base width. */
  size: number;
  /** Line height at the base width; defaults to 1.3 × size. */
  lh?: number;
  color?: string;
  b?: boolean;
  align?: TextStyle['textAlign'];
  lines?: number;
  fit?: boolean;
  style?: StyleProp<TextStyle>;
}

/** Scaled post text in the font of the post language. */
function T({ children, size, lh, color, b, align = 'center', lines, fit, style }: TProps) {
  const { k, rtl, bold, regular } = useContext(Ctx);
  return (
    <PText
      style={[
        {
          fontFamily: b ? bold : regular,
          fontSize: size * k,
          lineHeight: (lh ?? size * 1.3) * k * (rtl ? ARABIC_LEADING : 1),
          color,
          textAlign: align,
        },
        style,
      ]}
      numberOfLines={lines}
      adjustsFontSizeToFit={fit}
    >
      {children}
    </PText>
  );
}

/**
 * Text painted with a gradient, without a native mask: one colour per letter.
 * Arabic letters join, so Arabic is coloured word by word.
 */
function Grad({ text, colors }: { text: string; colors: readonly [string, string] }) {
  const { rtl } = useContext(Ctx);
  const parts = rtl ? text.split(/(\s+)/) : Array.from(text);
  const last = Math.max(1, parts.length - 1);
  return (
    <>
      {parts.map((part, i) => (
        <PText key={i} style={{ color: mix(colors[0], colors[1], i / last) }}>{part}</PText>
      ))}
    </>
  );
}

/** White card with a gradient outline. */
function GradCard({ children, radius, style }: { children: React.ReactNode; radius: number; style?: StyleProp<ViewStyle> }) {
  const { k, colors } = useContext(Ctx);
  const border = 2 * k;
  return (
    <LinearGradient
      colors={colors.gradient}
      start={GRADIENT_START}
      end={GRADIENT_END}
      style={[styles.stretch, { borderRadius: radius * k, padding: border }]}
    >
      <View style={[styles.white, { borderRadius: radius * k - border }, style]}>{children}</View>
    </LinearGradient>
  );
}

/** Which optional perks this store runs right now (shown on the opening slide). */
interface SocialPerks {
  games: boolean;
  deals: boolean;
}

interface SocialPostProps {
  slide: SocialSlideId;
  width: number;
  format?: SocialFormat;
  merchantName: string;
  logoUrl?: string | null;
  /** Merchant brand colour (hex); falls back to the JitPlus violet. */
  brandColor?: string | null;
  city?: string | null;
  program: PlvProgram;
  perks: SocialPerks;
  /** Translator of the language the post is written in (may differ from the app's). */
  t: ReturnType<typeof useLanguage>['t'];
  /** Right-to-left post (Arabic). */
  rtl?: boolean;
}

type SlideProps = Omit<SocialPostProps, 'slide' | 'format' | 'rtl' | 'brandColor'>;

/**
 * The store's logo, or its initial on the brand colour when it has none:
 * a customer-facing post must never show the JitPlus Pro placeholder.
 */
function StoreLogo({ logoUrl, name, size, radius }: { logoUrl?: string | null; name: string; size: number; radius: number }) {
  const { k, colors } = useContext(Ctx);
  const box = { width: size * k, height: size * k, borderRadius: radius * k };
  if (logoUrl) return <MerchantLogo logoUrl={logoUrl} style={box} />;
  return (
    <View style={[styles.centered, box, { backgroundColor: colors.brand }]}>
      <T b size={size * 0.5} lh={size * 0.62} color="#FFFFFF">{Array.from(name.trim())[0]?.toUpperCase() ?? ''}</T>
    </View>
  );
}

function Chip({ Icon, label, color }: { Icon: LucideIcon; label: string; color: string }) {
  const { k } = useContext(Ctx);
  return (
    <View style={[styles.chip, { borderColor: color, borderRadius: 20 * k, paddingHorizontal: 12 * k, paddingVertical: 7 * k, gap: 6 * k }]}>
      <Icon size={14 * k} color={color} strokeWidth={2.2} />
      <T b size={13} color="#FFFFFF">{label}</T>
    </View>
  );
}

function PartnerSlide({ merchantName, logoUrl, perks, t }: SlideProps) {
  const { k, rtl, colors } = useContext(Ctx);
  const tile = { width: 104 * k, height: 104 * k, borderRadius: 26 * k };
  const logo = { width: 80 * k, height: 80 * k, borderRadius: 18 * k };
  const chips = [
    { Icon: JitGift, label: t('home.socialPostChipGifts'), color: ORANGE },
    ...(perks.games ? [{ Icon: JitGames, label: t('home.socialPostChipGames'), color: '#F0A6CA' }] : []),
    ...(perks.deals ? [{ Icon: JitStar, label: t('home.socialPostChipOffers'), color: '#C4B5FD' }] : []),
  ];
  // Never a lonely chip: notifications are always part of the app.
  if (chips.length < 2) chips.push({ Icon: Bell, label: t('home.socialPostPerkAlertsTitle'), color: '#C4B5FD' });
  return (
    <>
      <View style={[styles.row, { gap: 14 * k }]}>
        <View style={[styles.tile, tile]}>
          <StoreLogo logoUrl={logoUrl} name={merchantName} size={80} radius={18} />
        </View>
        <T b size={34} lh={38} color={ORANGE}>×</T>
        <View style={[styles.tile, tile]}>
          <Image source={require('@/assets/images/jitpluslogo.png')} style={logo} resizeMode="contain" />
        </View>
      </View>
      <T b size={29} lh={37} color="#FFFFFF" lines={2} fit style={{ marginTop: 22 * k }}>{merchantName}</T>
      <T b size={29} lh={37} lines={1} fit>
        <Grad text={t('home.socialPostPartnerTitle')} colors={colors.gradientOnDark} />
      </T>
      <T size={13.5} lh={20} color="#CBD5E1" style={{ marginTop: 10 * k }}>
        {t('home.socialPostPartnerText')}
      </T>
      <View style={[styles.row, styles.wrap, { gap: 8 * k, marginTop: 16 * k, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {chips.map((chip) => <Chip key={chip.label} {...chip} />)}
      </View>
    </>
  );
}

/**
 * Why install the app: the four things JitPlus brings a customer. These are
 * the app's own perks, so they are always shown, whatever this store runs.
 */
function PerksSlide({ width, t }: SlideProps) {
  const { k, rtl, colors } = useContext(Ctx);
  const list = [
    { Icon: JitGift, color: ORANGE_INK, bg: '#FDEBD0', title: t('home.socialPostPerkGiftsTitle'), text: t('home.socialPostPerkGiftsText') },
    { Icon: Tag, color: '#BE185D', bg: '#FCE7F3', title: t('home.socialPostPerkDealsTitle'), text: t('home.socialPostPerkDealsText') },
    { Icon: JitGames, color: VIOLET, bg: '#EDE9FE', title: t('home.socialPostPerkGamesTitle'), text: t('home.socialPostPerkGamesText') },
    { Icon: Bell, color: GREEN_INK, bg: '#D9F5EA', title: t('home.socialPostPerkAlertsTitle'), text: t('home.socialPostPerkAlertsText') },
  ];
  const gap = 9 * k;
  const cardW = (width - 2 * PAD * k - gap) / 2;
  const iconBox = { width: 36 * k, height: 36 * k, borderRadius: 12 * k };
  return (
    <>
      <View style={{ backgroundColor: colors.brandSoft, borderRadius: 14 * k, paddingHorizontal: 12 * k, paddingVertical: 4 * k }}>
        <T b size={12} color={colors.brandDeep}>{t('home.socialPostPerksEyebrow')}</T>
      </View>
      <T b size={30} lh={37} color={INK} style={{ marginTop: 6 * k }}>
        {t('home.socialPostPerksTitle')}
        {'\n'}
        <Grad text={t('home.socialPostPerksAccent')} colors={colors.gradient} />
      </T>
      <View style={[styles.row, styles.wrap, { gap, marginTop: 14 * k, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {list.map(({ Icon, color, bg, title, text }) => (
          <View key={title} style={[styles.perkCard, { width: cardW, height: 106 * k, borderRadius: 18 * k, paddingHorizontal: 8 * k, gap: 4 * k }]}>
            <View style={[styles.tile, iconBox, { backgroundColor: bg }]}>
              <Icon size={19 * k} color={color} strokeWidth={2.2} />
            </View>
            <T b size={15} lh={19} color={INK} lines={1} fit>{title}</T>
            <T size={11.5} lh={15.5} color="#475569" lines={2}>{text}</T>
          </View>
        ))}
      </View>
    </>
  );
}

/** A full loyalty card: one stamp per slot with the store logo, the last one being the gift. */
function StampGrid({ slots, logoUrl, available }: { slots: number; logoUrl?: string | null; available: number }) {
  const { k } = useContext(Ctx);
  const count = Math.min(Math.max(Math.round(slots) || 0, 2), MAX_STAMPS_SHOWN);
  const perRow = count > 6 ? Math.ceil(count / 2) : count;
  const gap = 7 * k;
  const d = Math.min(40 * k, Math.floor((available - gap * (perRow - 1)) / perRow));
  const ring = { width: d, height: d, borderRadius: d / 2, borderWidth: 2 * k };
  const logo = { width: d - 8 * k, height: d - 8 * k, borderRadius: d / 2 };
  return (
    <View style={[styles.row, styles.wrap, { gap, width: perRow * d + gap * (perRow - 1) }]}>
      {Array.from({ length: count }, (_, i) =>
        i === count - 1 ? (
          <View key={i} style={[styles.stamp, styles.stampGift, ring]}>
            <JitGift size={d * 0.5} color="#FFFFFF" strokeWidth={2.2} />
          </View>
        ) : (
          <View key={i} style={[styles.stamp, ring]}>
            {logoUrl ? <MerchantLogo logoUrl={logoUrl} style={logo} /> : <Check size={d * 0.5} color={GREEN_INK} strokeWidth={3} />}
          </View>
        ),
      )}
    </View>
  );
}

function InfoLine({ Icon, text, color, bg }: { Icon: LucideIcon; text: string; color: string; bg: string }) {
  const { k, rtl } = useContext(Ctx);
  return (
    <View
      style={[
        styles.row,
        styles.stretch,
        { backgroundColor: bg, borderRadius: 14 * k, padding: 11 * k, gap: 8 * k, marginTop: 8 * k, flexDirection: rtl ? 'row-reverse' : 'row' },
      ]}
    >
      <Icon size={16 * k} color={color} strokeWidth={2.2} />
      <T b size={13} lh={17.5} color={color} lines={2} style={styles.shrink}>{text}</T>
    </View>
  );
}

function RewardSlide({ width, logoUrl, program, t }: SlideProps) {
  const { k, rtl, colors } = useContext(Ctx);
  const cardPad = 14 * k;
  return (
    <>
      <T b size={24} lh={31} color={INK}>
        {t('home.socialPostRewardTitle')}{' '}
        <Grad text={t('home.socialPostRewardAccent')} colors={colors.gradient} />
      </T>
      <View style={[styles.stretch, { marginTop: 16 * k }]}>
        <GradCard radius={20} style={{ alignItems: 'center', padding: cardPad, gap: 12 * k }}>
          <View style={[styles.row, { gap: 5 * k, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Check size={13 * k} color={GREEN_INK} strokeWidth={3} />
            <T b size={13} color={GREEN_INK}>{t('home.socialPostCardFull')}</T>
            <T b size={13} color={colors.brandDeep}>{`· ${program.slots}/${program.slots}`}</T>
          </View>
          <StampGrid slots={program.slots} logoUrl={logoUrl} available={width - 2 * PAD * k - 2 * cardPad - 8 * k} />
        </GradCard>
      </View>
      <InfoLine Icon={JitGift} text={program.rewardHeadline} color="#9A3412" bg="#F8E1D2" />
      <InfoLine Icon={JitStamp} text={program.earnLine} color={colors.brandDeep} bg={colors.brandSoft} />
    </>
  );
}

/** A small phone showing the customer's QR code, as held out at checkout. */
function QrPhone() {
  const { k, colors } = useContext(Ctx);
  return (
    <View style={[styles.phone, { width: 52 * k, height: 80 * k, borderRadius: 11 * k, borderWidth: 2.5 * k, gap: 4 * k }]}>
      <View style={{ width: 16 * k, height: 3 * k, borderRadius: 2 * k, backgroundColor: '#CBD5E1' }} />
      {/* Decorative: the real code lives in the customer's app. */}
      <QRCode value="JitPlus" size={34 * k} color={colors.brandDeep} backgroundColor="#FFFFFF" />
      <View style={{ width: 24 * k, height: 4 * k, borderRadius: 3 * k, backgroundColor: colors.brandSoft }} />
    </View>
  );
}

function StepsSlide({ t }: SlideProps) {
  const { k, rtl, colors } = useContext(Ctx);
  const steps: { Icon?: LucideIcon; title: string; text: string }[] = [
    { Icon: Download, title: t('home.socialPostStep1Title'), text: t('home.socialPostStep1Text') },
    { Icon: UserPlus, title: t('home.socialPostStep2Title'), text: t('home.socialPostStep2Text') },
    { title: t('home.socialPostStep3Title'), text: t('home.socialPostStep3Text') },
  ];
  const align = rtl ? 'right' : 'left';
  const num = { width: 30 * k, height: 30 * k, borderRadius: 15 * k };
  return (
    <>
      <T b size={25} lh={33} color={INK} lines={1} fit style={{ marginBottom: 4 * k }}>{t('home.socialPostStepsTitle')}</T>
      {steps.map(({ Icon, title, text }, i) => (
        <View
          key={title}
          style={[
            styles.stepCard,
            { borderRadius: 18 * k, padding: 12 * k, gap: 11 * k, marginTop: 9 * k, flexDirection: rtl ? 'row-reverse' : 'row' },
          ]}
        >
          <LinearGradient colors={colors.gradient} start={GRADIENT_START} end={GRADIENT_END} style={[styles.centered, num]}>
            <T b size={14} color="#FFFFFF">{i + 1}</T>
          </LinearGradient>
          <View style={styles.flex1}>
            <T b size={14.5} lh={19.5} color={INK} align={align} lines={2}>{title}</T>
            <T size={12} lh={16.5} color="#475569" align={align} lines={2}>{text}</T>
          </View>
          {Icon ? <Icon size={21 * k} color={colors.brand} strokeWidth={2} /> : <QrPhone />}
        </View>
      ))}
    </>
  );
}

/** One reason to install, ticked. */
function CheckPill({ label }: { label: string }) {
  const { k, rtl } = useContext(Ctx);
  return (
    <View
      style={[
        styles.row,
        styles.veil,
        { borderRadius: 20 * k, paddingHorizontal: 11 * k, paddingVertical: 5 * k, gap: 5 * k, flexDirection: rtl ? 'row-reverse' : 'row' },
      ]}
    >
      <Check size={12 * k} color={GOLD} strokeWidth={3} />
      <T b size={12} color="#FFFFFF">{label}</T>
    </View>
  );
}

function CtaSlide({ merchantName, logoUrl, city, t }: SlideProps) {
  const { k, rtl } = useContext(Ctx);
  const align = rtl ? 'right' : 'left';
  return (
    <>
      <T b size={27} lh={34} color="#FFFFFF">
        {t('home.socialPostCtaTitle')}
        {'\n'}
        <PText style={{ color: GOLD }}>{t('home.socialPostCtaAccent')}</PText>
      </T>
      <View
        style={[
          styles.row,
          styles.white,
          { borderRadius: 30 * k, paddingHorizontal: 24 * k, paddingVertical: 11 * k, gap: 8 * k, marginTop: 14 * k, flexDirection: rtl ? 'row-reverse' : 'row' },
        ]}
      >
        <Download size={18 * k} color={INK} strokeWidth={2.4} />
        <T b size={16.5} color={INK}>{t('home.socialPostCtaButton')}</T>
      </View>
      <View style={[styles.row, styles.wrap, { gap: 6 * k, marginTop: 10 * k, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <CheckPill label={t('home.socialPostCtaFree')} />
        <CheckPill label={t('home.socialPostCtaPlatforms')} />
        <CheckPill label={t('home.socialPostCtaAllCards')} />
      </View>

      {/* Where to come and collect: the store itself. */}
      <View
        style={[
          styles.row,
          styles.stretch,
          styles.veil,
          { borderRadius: 18 * k, padding: 9 * k, gap: 11 * k, marginTop: 12 * k, flexDirection: rtl ? 'row-reverse' : 'row' },
        ]}
      >
        <View style={[styles.tile, { borderRadius: 12 * k }]}>
          <StoreLogo logoUrl={logoUrl} name={merchantName} size={44} radius={12} />
        </View>
        <View style={styles.flex1}>
          <T size={11.5} lh={15.5} color="rgba(255,255,255,0.82)" align={align} lines={1}>{t('home.socialPostCtaVisit')}</T>
          <T b size={15.5} lh={20.5} color="#FFFFFF" align={align} lines={1} fit>{merchantName}</T>
          {city ? (
            <View style={[styles.row, { gap: 3 * k, flexDirection: rtl ? 'row-reverse' : 'row', alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>
              <MapPin size={11 * k} color={GOLD} strokeWidth={2.4} />
              <T size={11.5} lh={15.5} color="#FFFFFF" lines={1}>{city}</T>
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.row, { gap: 5 * k, marginTop: 9 * k, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Link2 size={13 * k} color={GOLD} strokeWidth={2.4} />
        <T b size={12.5} color={GOLD}>{t('home.socialPostCtaLink')}</T>
      </View>
    </>
  );
}

const BODIES: Record<SocialSlideId, (props: SlideProps) => React.ReactElement> = {
  partner: PartnerSlide,
  perks: PerksSlide,
  reward: RewardSlide,
  steps: StepsSlide,
  cta: CtaSlide,
};

function skinOf(slide: SocialSlideId, colors: Palette): { bg: string; blob: string; dark: boolean } {
  if (slide === 'partner') return { bg: INK, blob: mix(INK, colors.brand, 0.22), dark: true };
  if (slide === 'cta') return { bg: colors.brandDeep, blob: mix(colors.brandDeep, '#FFFFFF', 0.1), dark: true };
  const tint = slide === 'reward' ? 0.1 : 0.04;
  return { bg: mix('#FFFFFF', colors.brand, tint), blob: mix('#FFFFFF', colors.brand, tint + 0.08), dark: false };
}

/**
 * One slide of the "we are on JitPlus" social carousel, co-branded with the
 * merchant's name, logo, colour and real loyalty programme. Drawn in views so
 * it can be captured as an image and shared to Instagram, Facebook or WhatsApp.
 */
function SocialPost({ slide, width, format = 'post', rtl = false, brandColor, ...rest }: SocialPostProps) {
  const k = width / BASE_WIDTH;
  const story = format === 'story';
  const ctx = useMemo<PostContext>(
    () => ({
      k,
      rtl,
      bold: rtl ? ARABIC_BOLD : font.bold,
      regular: rtl ? ARABIC_REGULAR : font.regular,
      colors: buildPalette(brandColor),
    }),
    [k, rtl, brandColor],
  );
  const skin = skinOf(slide, ctx.colors);
  const index = SOCIAL_SLIDES.indexOf(slide);
  const Body = BODIES[slide];
  const blobSize = width * 0.95;
  // Stories keep their top and bottom clear of the app's own interface.
  const edge = (story ? 70 : 24) * k;

  return (
    <Ctx.Provider value={ctx}>
      <View style={[styles.root, { width, height: width * SOCIAL_FORMATS[format].ratio, backgroundColor: skin.bg }]}>
        <View
          style={[
            styles.blob,
            { width: blobSize, height: blobSize, borderRadius: blobSize / 2, top: -blobSize * 0.52, right: -blobSize * 0.34, backgroundColor: skin.blob },
          ]}
        />

        <View style={[styles.header, { paddingHorizontal: PAD * k, paddingTop: edge }]}>
          <View style={[styles.row, { gap: 8 * k }]}>
            <View style={[styles.tile, { width: 30 * k, height: 30 * k, borderRadius: 8 * k }]}>
              <Image source={require('@/assets/images/jitpluslogo.png')} style={{ width: 22 * k, height: 22 * k }} resizeMode="contain" />
            </View>
            <PText style={{ fontFamily: font.bold, color: skin.dark ? '#FFFFFF' : INK, fontSize: 15 * k }}>JitPlus</PText>
          </View>
          <View
            style={{
              backgroundColor: skin.dark ? 'rgba(255,255,255,0.16)' : ctx.colors.brandSoft,
              borderRadius: 14 * k,
              paddingHorizontal: 11 * k,
              paddingVertical: 5 * k,
            }}
          >
            <PText style={{ fontFamily: font.bold, color: skin.dark ? '#FFFFFF' : ctx.colors.brandDeep, fontSize: 11.5 * k }}>
              {`${index + 1}/${SOCIAL_SLIDES.length}`}
            </PText>
          </View>
        </View>

        <View style={[styles.bodyWrap, { paddingHorizontal: PAD * k }, story && styles.storyBody]}>
          <Body {...rest} width={width} />
        </View>

        {/* Keeps the body optically centred under the header. */}
        <View style={[styles.footer, { height: edge + 16 * k }]}>
          {index === SOCIAL_SLIDES.length - 1 ? (
            <PText style={{ fontFamily: font.bold, color: 'rgba(255,255,255,0.7)', fontSize: 11.5 * k }}>@jitplus</PText>
          ) : null}
        </View>
      </View>
    </Ctx.Provider>
  );
}

export default React.memo(SocialPost);

const styles = StyleSheet.create({
  // Same as the app root: laid out left-to-right, mirrored by hand for Arabic.
  root: { overflow: 'hidden', direction: 'ltr' },
  blob: { position: 'absolute' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { alignItems: 'center' },
  bodyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  storyBody: { transform: [{ scale: STORY_BODY_SCALE }] },
  flex1: { flex: 1 },
  shrink: { flexShrink: 1 },
  stretch: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  wrap: { flexWrap: 'wrap' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  white: { backgroundColor: '#FFFFFF' },
  veil: { backgroundColor: 'rgba(255,255,255,0.16)' },

  tile: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  perkCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },

  stamp: { alignItems: 'center', justifyContent: 'center', borderColor: GREEN, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  stampGift: { backgroundColor: GREEN },

  stepCard: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#FFFFFF' },
  phone: { alignItems: 'center', justifyContent: 'center', borderColor: INK, backgroundColor: '#FFFFFF' },
});
