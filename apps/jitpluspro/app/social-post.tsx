import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  PixelRatio,
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Copy, Download, Facebook, Images, Instagram, MessageCircle, Send, Share2, Twitter, type LucideIcon } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import { useFonts } from 'expo-font';
import i18n from '@/i18n';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage, LANGUAGES, type AppLocale } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { CLIENT_APP_ANDROID_URL, CLIENT_APP_IOS_URL } from '@/constants/app';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ActionButton } from '@/components/ui/ActionButton';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { useAuthStore } from '@/stores/authStore';
import { usePlvProgram } from '@/components/plv/usePlvProgram';
import { useLuckyWheelActiveInfo } from '@/hooks/useQueryHooks';
import { useScratchCampaigns } from '@/hooks/useScratchHooks';
import { useMerchantDeals } from '@/hooks/queries/deals';
import {
  canSaveToGallery,
  canShareMany,
  captionModeOf,
  getInstalledShareTargets,
  prepareShareFile,
  saveToGallery,
  shareToTarget,
  shareViaSystemSheet,
  targetsForFormat,
  type ShareTargetId,
} from '@/utils/socialShare';
import SocialPost, { SOCIAL_ARABIC_FONTS, SOCIAL_FORMATS, SOCIAL_SLIDES, type SocialFormat } from '@/components/social/SocialPost';

const FORMATS: readonly { id: SocialFormat; labelKey: string }[] = [
  { id: 'post', labelKey: 'home.socialPostFormatPost' },
  { id: 'story', labelKey: 'home.socialPostFormatStory' },
];
/** Scratch campaigns customers can still receive or play. */
const LIVE_SCRATCH = new Set(['SCHEDULED', 'SENDING', 'SENT']);
const COPIED_FEEDBACK_MS = 2000;
/** Time a slide needs to be drawn after the pager jumps to it, before its capture. */
const SLIDE_SETTLE_MS = 160;

/** Brand names stay as they are; only the story wordings are translated. */
const TARGET_UI: Record<ShareTargetId, { Icon: LucideIcon; color: string; label?: string; labelKey?: string }> = {
  instagramStory: { Icon: Instagram, color: '#E1306C', labelKey: 'home.socialPostTargetInstagramStory' },
  facebookStory: { Icon: Facebook, color: '#1877F2', labelKey: 'home.socialPostTargetFacebookStory' },
  instagram: { Icon: Instagram, color: '#E1306C', label: 'Instagram' },
  facebook: { Icon: Facebook, color: '#1877F2', label: 'Facebook' },
  whatsapp: { Icon: MessageCircle, color: '#25D366', label: 'WhatsApp' },
  whatsappBusiness: { Icon: MessageCircle, color: '#128C7E', label: 'WA Business' },
  telegram: { Icon: Send, color: '#229ED9', label: 'Telegram' },
  x: { Icon: Twitter, color: '#111827', label: 'X' },
};

/** What is being exported: one network, the system sheet, the whole carousel, or the gallery. */
type Busy = ShareTargetId | 'sheet' | 'all' | 'gallery';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// react-native-view-shot reads the size in pixels on Android and in points on iOS.
const EXPORT_SCALE = Platform.OS === 'ios' ? PixelRatio.get() : 1;

interface ChoiceChipsProps<V extends string> {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}

/** A labelled row of pills where exactly one is selected. */
function ChoiceChips<V extends string>({ label, options, value, onChange }: ChoiceChipsProps<V>) {
  const theme = useTheme();
  const { row, textAlign } = useDir();
  return (
    <>
      <Text style={[styles.label, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.2}>{label}</Text>
      <View style={[styles.chipRow, { flexDirection: row }]}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              activeOpacity={0.8}
              style={[
                styles.chip,
                { backgroundColor: active ? theme.primary : theme.bgCard, borderColor: active ? theme.primary : theme.border },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.chipText, { color: active ? '#FFFFFF' : theme.text }]} maxFontSizeMultiplier={1.2}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({ value: lang.code, label: lang.nativeLabel }));

/**
 * "Affiche réseaux sociaux": the carousel of visuals to post on social media,
 * with its language, format, share button and caption.
 */
export default function SocialPostScreen() {
  const shouldWait = useRequireAuth();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const merchant = useAuthStore((s) => s.merchant);

  // The post can be written in another language than the app: many stores
  // run the app in French and talk to their customers in Darija.
  const [postLocale, setPostLocale] = useState<AppLocale>(locale);
  const postT = useCallback(
    (scope: string, options?: Record<string, unknown>) => i18n.t(scope, { ...options, locale: postLocale }),
    [postLocale],
  );
  const postLang = useMemo(() => ({ t: postT, locale: postLocale }), [postT, postLocale]);
  const program = usePlvProgram(postLang);
  const storeName = merchant?.nom || postT('home.clientShareStoreFallback');
  // Lexend has no Arabic glyphs: the Arabic post is drawn in Cairo, loaded on this screen only.
  // If the font cannot load, the post still renders, in the system Arabic font.
  const [arabicFontsLoaded, arabicFontsError] = useFonts(SOCIAL_ARABIC_FONTS);
  const arabicFontsReady = arabicFontsLoaded || !!arabicFontsError;
  const [format, setFormat] = useState<SocialFormat>('post');

  // Only promise what the store really runs: games and deals appear when one is live.
  const { data: wheelInfo } = useLuckyWheelActiveInfo();
  const { data: scratchCampaigns } = useScratchCampaigns(!!merchant);
  const { data: dealsData } = useMerchantDeals(!!merchant);
  const perks = useMemo(
    () => ({
      games: !!wheelInfo?.hasActiveLuckyWheel || !!scratchCampaigns?.some((c) => LIVE_SCRATCH.has(c.status)),
      deals: !!dealsData?.deals.some((d) => d.displayStatus === 'LIVE' || d.displayStatus === 'SCHEDULED'),
    }),
    [wheelInfo, scratchCampaigns, dealsData],
  );

  const caption = postT('home.clientShareSocialMessage', {
    storeName,
    androidUrl: CLIENT_APP_ANDROID_URL,
    iosUrl: CLIENT_APP_IOS_URL,
  });

  const pagerRef = useRef<ScrollView | null>(null);
  const slideRefs = useRef<(View | null)[]>([]);
  const [slideW, setSlideW] = useState(0);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<Busy | null>(null);
  // Networks installed on this phone; empty on a build without direct sharing.
  const [installed, setInstalled] = useState<ShareTargetId[]>([]);
  useEffect(() => {
    let alive = true;
    getInstalledShareTargets()
      .then((ids) => {
        if (alive) setInstalled(ids);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const targets = useMemo(() => targetsForFormat(installed, format), [installed, format]);
  const shareMany = canShareMany();
  const galleryAvailable = canSaveToGallery();
  // Set once the caption was put on the clipboard for a network that ignores pre-filled text.
  const [captionReady, setCaptionReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const total = SOCIAL_SLIDES.length;
  const rtl = postLocale === 'ar';
  const formatOptions = useMemo(() => FORMATS.map((f) => ({ value: f.id, label: t(f.labelKey) })), [t]);

  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setSlideW((prev) => (prev === w ? prev : w));
  }, []);

  // Tracked while scrolling: a slow drag that settles on a page fires no momentum event.
  const onPagerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (slideW <= 0) return;
      const next = Math.min(total - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / slideW)));
      setIndex((prev) => (prev === next ? prev : next));
    },
    [slideW, total],
  );

  const goTo = useCallback(
    (i: number) => {
      setIndex(i);
      pagerRef.current?.scrollTo({ x: i * slideW, animated: true });
    },
    [slideW],
  );

  const captureSlide = useCallback(
    async (i: number) => {
      const target = slideRefs.current[i];
      if (!target) throw new Error('Slide view unavailable');
      const uri = await captureRef(target, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: SOCIAL_FORMATS[format].width / EXPORT_SCALE,
        height: SOCIAL_FORMATS[format].height / EXPORT_SCALE,
      });
      return prepareShareFile(uri, `jitplus-${format}-${i + 1}.png`);
    },
    [format],
  );

  /** Runs one export at a time and reports any failure. */
  const runExport = useCallback(
    async (kind: Busy, job: () => Promise<void>) => {
      if (busy) return;
      setBusy(kind);
      try {
        await job();
      } catch {
        Alert.alert(t('common.error'), t('home.clientShareSocialError'));
      } finally {
        setBusy(null);
      }
    },
    [busy, t],
  );

  const shareDialogTitle = t('home.socialPostShareDialog');
  const shareUnavailable = useCallback(() => {
    Alert.alert(t('common.error'), t('home.clientQrShareUnavailable'));
  }, [t]);

  // Instagram and Facebook drop pre-filled captions: theirs waits on the clipboard.
  // Copied before leaving the app, Android refuses clipboard writes from the background.
  const putCaptionOnClipboard = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(caption);
      setCaptionReady(true);
    } catch {
      // The caption can still be copied with its button.
    }
  }, [caption]);

  const shareSlide = useCallback(
    () =>
      runExport('sheet', async () => {
        const uri = await captureSlide(index);
        if (!(await shareViaSystemSheet([uri], shareDialogTitle))) {
          shareUnavailable();
          return;
        }
        // Ready for the next visual of the carousel.
        if (index < total - 1) goTo(index + 1);
      }),
    [runExport, captureSlide, index, total, goTo, shareDialogTitle, shareUnavailable],
  );

  const shareDirect = useCallback(
    (id: ShareTargetId) =>
      runExport(id, async () => {
        const uri = await captureSlide(index);
        if (captionModeOf(id) === 'clipboard') await putCaptionOnClipboard();
        try {
          await shareToTarget(id, uri, caption);
        } catch {
          // The app refused the image: the system sheet still reaches it.
          if (!(await shareViaSystemSheet([uri], shareDialogTitle))) {
            shareUnavailable();
            return;
          }
        }
        if (index < total - 1) goTo(index + 1);
      }),
    [runExport, captureSlide, index, total, goTo, caption, putCaptionOnClipboard, shareDialogTitle, shareUnavailable],
  );

  /** Captures every visual of the carousel, in order, then comes back to the current one. */
  const captureAll = useCallback(async () => {
    const uris: string[] = [];
    try {
      for (let i = 0; i < total; i++) {
        // A slide outside the screen can capture blank: bring each one into view first.
        pagerRef.current?.scrollTo({ x: i * slideW, animated: false });
        await wait(SLIDE_SETTLE_MS);
        uris.push(await captureSlide(i));
      }
    } finally {
      pagerRef.current?.scrollTo({ x: index * slideW, animated: false });
      setIndex(index);
    }
    return uris;
  }, [captureSlide, index, total, slideW]);

  /** The whole carousel in one share: Instagram and Facebook turn it into a multi-image post. */
  const shareAll = useCallback(
    () =>
      runExport('all', async () => {
        const uris = await captureAll();
        await putCaptionOnClipboard();
        if (!(await shareViaSystemSheet(uris, shareDialogTitle))) shareUnavailable();
      }),
    [runExport, captureAll, putCaptionOnClipboard, shareDialogTitle, shareUnavailable],
  );

  /** The whole carousel into the phone's gallery, to publish it later. */
  const saveAllToGallery = useCallback(
    () =>
      runExport('gallery', async () => {
        const uris = await captureAll();
        if (await saveToGallery(uris)) {
          Alert.alert(t('home.socialPostSavedTitle'), t('home.socialPostSaved', { total }));
        } else {
          Alert.alert(t('common.error'), t('home.socialPostSavePermission'));
        }
      }),
    [runExport, captureAll, t, total],
  );

  const copyCaption = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(caption);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      Alert.alert(t('common.error'), t('home.clientShareSocialError'));
    }
  }, [caption, t]);

  if (shouldWait) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('home.clientPosterSocial')} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 26 }]}
        showsVerticalScrollIndicator={false}
      >
          <Text style={[styles.subtitle, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t('home.socialPostSubtitle')}
          </Text>

          <ChoiceChips label={t('home.socialPostLangLabel')} options={LANGUAGE_OPTIONS} value={postLocale} onChange={setPostLocale} />
          <ChoiceChips label={t('home.socialPostFormatLabel')} options={formatOptions} value={format} onChange={setFormat} />

          <View style={styles.pagerFrame} onLayout={onPagerLayout}>
            {slideW > 0 ? (
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onPagerScroll}
                scrollEventThrottle={32}
                accessibilityLabel={t('home.socialPostSlideLabel', { n: index + 1, total })}
              >
                {SOCIAL_SLIDES.map((slide, i) => (
                  <View
                    key={slide}
                    ref={(node) => {
                      slideRefs.current[i] = node;
                    }}
                    collapsable={false}
                  >
                    {/* The Arabic post waits for its font; the pager keeps its place meanwhile. */}
                    {rtl && !arabicFontsReady ? (
                      <View style={{ width: slideW, height: slideW * SOCIAL_FORMATS[format].ratio }} />
                    ) : (
                      <SocialPost
                        slide={slide}
                        width={slideW}
                        format={format}
                        merchantName={storeName}
                        logoUrl={merchant?.logoUrl}
                        brandColor={merchant?.themeColor}
                        city={merchant?.ville}
                        program={program}
                        perks={perks}
                        t={postT}
                        rtl={rtl}
                      />
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>

          <View style={styles.dots}>
            {SOCIAL_SLIDES.map((slide, i) => (
              <TouchableOpacity
                key={slide}
                onPress={() => goTo(i)}
                hitSlop={DOT_HIT_SLOP}
                accessibilityRole="button"
                accessibilityState={{ selected: i === index }}
                accessibilityLabel={t('home.socialPostSlideLabel', { n: i + 1, total })}
              >
                <View style={[styles.dot, { backgroundColor: i === index ? theme.primary : theme.border }, i === index && styles.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          {targets.length > 0 ? (
            <>
              <Text style={[styles.label, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.2}>
                {t('home.socialPostDirectLabel')}
              </Text>
              <View style={[styles.targetRow, { flexDirection: row }]}>
                {targets.map((id) => {
                  const ui = TARGET_UI[id];
                  const label =
                    id === 'whatsapp' && format === 'story'
                      ? t('home.socialPostTargetWhatsappStatus')
                      : ui.labelKey ? t(ui.labelKey) : ui.label ?? '';
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => shareDirect(id)}
                      disabled={busy !== null || slideW === 0}
                      activeOpacity={0.8}
                      style={[
                        styles.target,
                        { backgroundColor: theme.bgCard, borderColor: theme.border, opacity: busy !== null && busy !== id ? 0.5 : 1 },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ busy: busy === id, disabled: busy !== null }}
                      accessibilityLabel={label}
                    >
                      <View style={[styles.targetIcon, { backgroundColor: ui.color }]}>
                        {busy === id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <ui.Icon size={20} color="#FFFFFF" strokeWidth={2} />
                        )}
                      </View>
                      <Text style={[styles.targetText, { color: theme.text }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          <ActionButton
            label={t('home.socialPostShareCta', { n: index + 1, total })}
            icon={Share2}
            size="lg"
            onPress={shareSlide}
            loading={busy === 'sheet'}
            disabled={slideW === 0 || busy !== null}
            style={styles.cta}
          />
          {shareMany ? (
            <ActionButton
              label={t('home.socialPostShareAllCta', { total })}
              icon={Images}
              variant="secondary"
              onPress={shareAll}
              loading={busy === 'all'}
              disabled={slideW === 0 || busy !== null}
              style={styles.shareAll}
            />
          ) : null}
          {galleryAvailable ? (
            <ActionButton
              label={t('home.socialPostSaveCta', { total })}
              icon={Download}
              variant="secondary"
              onPress={saveAllToGallery}
              loading={busy === 'gallery'}
              disabled={slideW === 0 || busy !== null}
              style={styles.shareAll}
            />
          ) : null}
          {captionReady ? (
            <Text style={[styles.notice, { color: theme.success }]} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
              {t('home.socialPostCaptionReady')}
            </Text>
          ) : null}

          <View style={[styles.captionCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[styles.captionLabel, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.2}>
              {t('home.socialPostCaptionLabel')}
            </Text>
            <Text
              style={[styles.captionText, { color: theme.textSecondary, textAlign: rtl ? 'right' : 'left' }]}
              maxFontSizeMultiplier={1.35}
            >
              {caption}
            </Text>
            <ActionButton
              label={copied ? t('home.socialPostCopied') : t('home.socialPostCopyCta')}
              icon={copied ? Check : Copy}
              variant="secondary"
              onPress={copyCaption}
              style={styles.copyBtn}
            />
          </View>

          <Text style={[styles.hint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {shareMany ? t('home.socialPostHintAll', { total }) : t('home.socialPostHint')}
          </Text>
      </ScrollView>
    </View>
  );
}

const DOT_HIT_SLOP = { top: 12, bottom: 12, left: 6, right: 6 };

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, fontFamily: font.regular, paddingHorizontal: 4 },
  label: { fontSize: 12, fontFamily: font.semibold, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },

  chipRow: { gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontFamily: font.semibold },

  pagerFrame: { marginTop: 14, borderRadius: 18, overflow: 'hidden' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 22 },

  targetRow: { flexWrap: 'wrap', gap: 8 },
  target: { flexGrow: 1, flexBasis: '22%', minWidth: 72, alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6 },
  targetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  targetText: { marginTop: 6, fontSize: 11.5, lineHeight: 15, textAlign: 'center', fontFamily: font.semibold },

  cta: { width: '100%', marginTop: 14, borderWidth: 0 },
  shareAll: { width: '100%', marginTop: 8 },
  notice: { marginTop: 10, fontSize: 12.5, lineHeight: 18, textAlign: 'center', fontFamily: font.semibold },

  captionCard: { marginTop: 14, borderWidth: 1, borderRadius: 18, padding: 14 },
  captionLabel: { fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },
  captionText: { fontSize: 12.5, lineHeight: 18.5, marginTop: 8, fontFamily: font.regular },
  copyBtn: { width: '100%', marginTop: 12 },

  hint: { marginTop: 12, fontSize: 11.5, lineHeight: 17, textAlign: 'center', fontFamily: font.regular },
});
