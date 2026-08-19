import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';
import {
  BarChart3,
  Bell,
  Download,
  Gift,
  Megaphone,
  QrCode,
  ScanLine,
  Settings2,
  X,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import api from '@/services/api';

const jitPlusLogo = require('@/assets/images/jitpluslogo.png');
const jitPlusProLogo = require('@/assets/images/jitplusprologo.png');

type JourneyMode = 'merchant' | 'client';

type JourneyStep = {
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  accent: 'violet' | 'gold' | 'deep';
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Exact timeline from the design spec (seconds converted to ms).
const CARD_SCALE_DURATION = 320;
const CARD_OPACITY_DURATION = 280;
const CONTENT_DURATION = 250;
const PATH_DURATION = 1300;
const PATH_DELAY = 100;
const STEP_DURATION = 450;
const STEP_DELAYS = [120, 320, 520, 720];
const LABEL_DURATION = 400;
const LABEL_DELAYS = [240, 440, 640, 840];
const DOT_DURATION = 250;
const TOGGLE_DURATION = 200;
const CARD_SCALE_EASING = Easing.bezier(0.16, 0.8, 0.24, 1);
const STEP_OVERSHOOT_EASING = Easing.bezier(0.34, 1.4, 0.4, 1);

export default function WelcomeGuideCard() {
  const merchant = useAuthStore((s) => s.merchant);
  const updateMerchant = useAuthStore((s) => s.updateMerchant);
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { width, height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const rtl = I18nManager.isRTL || locale === 'ar';
  const reduceMotionRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeMode, setActiveMode] = useState<JourneyMode>('merchant');
  const [closedThisFocus, setClosedThisFocus] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const contentProgress = useRef(new Animated.Value(0)).current;
  const pathProgress = useRef(new Animated.Value(0)).current;
  const stepProgress = useMemo(() => [0, 1, 2, 3].map(() => new Animated.Value(0)), []);
  const labelProgress = useMemo(() => [0, 1, 2, 3].map(() => new Animated.Value(0)), []);
  const dotProgress = useRef(new Animated.Value(0)).current;
  const toggleAnim = useRef(new Animated.Value(0)).current;
  const runningAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const showGuide = !!merchant?.welcomeGuideVisible && isFocused && !closedThisFocus;
  const compact = height < 760;
  const cardWidth = Math.min(width - 16, 480);
  const cardMaxHeight = Math.round(height * 0.86);
  // contentWrap has 16px horizontal padding on each side — the roadmap must size to that inner width, not the full card.
  const roadmapWidth = cardWidth - 32;
  const roadmapHeight = compact ? 266 : 308;
  const nodeSize = compact ? 46 : 50;
  const stepY = compact ? [6, 72, 138, 204] : [8, 86, 164, 242];
  const firstSide = rtl ? 1 : -1;
  const nodeX = useCallback((index: number) => ((index % 2 === 0 ? firstSide : -firstSide) === -1 ? 44 : roadmapWidth - 44), [roadmapWidth, firstSide]);
  const labelSide = useCallback((index: number) => ((index % 2 === 0 ? -firstSide : firstSide) === -1 ? 'right' : 'left'), [firstSide]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) {
        reduceMotionRef.current = value;
        setReduceMotion(value);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      reduceMotionRef.current = value;
      setReduceMotion(value);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setClosedThisFocus(false);
      setDontShowAgain(false);
      toggleAnim.setValue(0);
    }
  }, [isFocused, toggleAnim]);

  const journeys = useMemo<Record<JourneyMode, JourneyStep[]>>(() => ({
    merchant: [
      { title: t('home.welcomeGuideMerchantStep1Title'), desc: t('home.welcomeGuideMerchantStep1Desc'), Icon: Settings2, accent: 'violet' },
      { title: t('home.welcomeGuideMerchantStep2Title'), desc: t('home.welcomeGuideMerchantStep2Desc'), Icon: ScanLine, accent: 'violet' },
      { title: t('home.welcomeGuideMerchantStep3Title'), desc: t('home.welcomeGuideMerchantStep3Desc'), Icon: Megaphone, accent: 'violet' },
      { title: t('home.welcomeGuideMerchantStep4Title'), desc: t('home.welcomeGuideMerchantStep4Desc'), Icon: BarChart3, accent: 'deep' },
    ],
    client: [
      { title: t('home.welcomeGuideClientStep1Title'), desc: t('home.welcomeGuideClientStep1Desc'), Icon: Download, accent: 'violet' },
      { title: t('home.welcomeGuideClientStep2Title'), desc: t('home.welcomeGuideClientStep2Desc'), Icon: QrCode, accent: 'violet' },
      { title: t('home.welcomeGuideClientStep3Title'), desc: t('home.welcomeGuideClientStep3Desc'), Icon: Gift, accent: 'gold' },
      { title: t('home.welcomeGuideClientStep4Title'), desc: t('home.welcomeGuideClientStep4Desc'), Icon: Bell, accent: 'deep' },
    ],
  }), [t]);

  const activeJourney = journeys[activeMode];
  const buildPath = useMemo(() => {
    const points = activeJourney.map((_, index) => ({ x: nodeX(index), y: stepY[index] + nodeSize / 2 }));
    const segments = points.slice(1).map((point, index) => {
      const previous = points[index];
      return `C ${previous.x} ${previous.y + 28}, ${point.x} ${point.y - 28}, ${point.x} ${point.y}`;
    });
    return `M ${points[0].x} ${points[0].y} ${segments.join(' ')}`;
  }, [activeJourney, nodeSize, nodeX, stepY]);

  const pathStrokeLength = 1000;
  const pathDashOffset = pathProgress.interpolate({ inputRange: [0, 1], outputRange: [pathStrokeLength, 0] });

  const playAnimations = useCallback(() => {
    runningAnimationRef.current?.stop();
    cardScale.stopAnimation();
    cardOpacity.stopAnimation();
    contentProgress.stopAnimation();
    pathProgress.stopAnimation();
    stepProgress.forEach((anim) => anim.stopAnimation());
    labelProgress.forEach((anim) => anim.stopAnimation());

    cardScale.setValue(0.92);
    cardOpacity.setValue(0);
    contentProgress.setValue(0);
    pathProgress.setValue(0);
    stepProgress.forEach((anim) => anim.setValue(0));
    labelProgress.forEach((anim) => anim.setValue(0));

    if (reduceMotionRef.current) {
      cardScale.setValue(1);
      cardOpacity.setValue(1);
      contentProgress.setValue(1);
      pathProgress.setValue(1);
      stepProgress.forEach((anim) => anim.setValue(1));
      labelProgress.forEach((anim) => anim.setValue(1));
      dotProgress.setValue(activeMode === 'client' ? 1 : 0);
      return;
    }

    // Étape A (carte) + B (tracé) + C (points) + D (texte) jouées en parallèle, chacune avec son propre délai.
    runningAnimationRef.current = Animated.parallel([
      Animated.timing(cardScale, {
        toValue: 1,
        duration: CARD_SCALE_DURATION,
        easing: CARD_SCALE_EASING,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: CARD_OPACITY_DURATION,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.timing(contentProgress, {
        toValue: 1,
        duration: CONTENT_DURATION,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.timing(pathProgress, {
        toValue: 1,
        duration: PATH_DURATION,
        delay: PATH_DELAY,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      ...stepProgress.map((anim, index) => Animated.timing(anim, {
        toValue: 1,
        duration: STEP_DURATION,
        delay: STEP_DELAYS[index],
        easing: STEP_OVERSHOOT_EASING,
        useNativeDriver: true,
      })),
      ...labelProgress.map((anim, index) => Animated.timing(anim, {
        toValue: 1,
        duration: LABEL_DURATION,
        delay: LABEL_DELAYS[index],
        easing: Easing.ease,
        useNativeDriver: true,
      })),
    ]);
    runningAnimationRef.current.start();

    Animated.timing(dotProgress, {
      toValue: activeMode === 'client' ? 1 : 0,
      duration: DOT_DURATION,
      easing: Easing.ease,
      useNativeDriver: false,
    }).start();
  }, [activeMode, cardOpacity, cardScale, contentProgress, dotProgress, labelProgress, pathProgress, stepProgress]);

  useEffect(() => {
    if (!showGuide) {
      runningAnimationRef.current?.stop();
      return;
    }
    playAnimations();
    return () => runningAnimationRef.current?.stop();
  }, [playAnimations, showGuide, activeMode]);

  const closeLocally = useCallback(() => {
    setClosedThisFocus(true);
  }, []);

  const handleToggleDontShow = useCallback(() => {
    setDontShowAgain((prev) => {
      const next = !prev;
      Animated.timing(toggleAnim, {
        toValue: next ? 1 : 0,
        duration: TOGGLE_DURATION,
        easing: Easing.ease,
        useNativeDriver: false,
      }).start();
      return next;
    });
  }, [toggleAnim]);

  const persistDontShow = useCallback(async () => {
    if (!merchant?.id) return;
    try {
      await api.patch('/merchant/profile', { welcomeGuideVisible: false });
      updateMerchant({ welcomeGuideVisible: false });
      setClosedThisFocus(true);
    } catch {
      // Keep it open if persistence fails; the user can retry.
    }
  }, [merchant?.id, updateMerchant]);

  const commitClose = useCallback(() => {
    if (dontShowAgain) {
      void persistDontShow();
      return;
    }
    closeLocally();
  }, [closeLocally, dontShowAgain, persistDontShow]);

  if (!showGuide || !merchant) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable style={styles.backdrop} />

      <Animated.View
        style={[
          styles.card,
          {
            width: cardWidth,
            maxHeight: cardMaxHeight,
            backgroundColor: theme.bgCard,
            borderColor: theme.border,
            shadowColor: '#000',
            opacity: reduceMotion ? 1 : cardOpacity,
            transform: [{ scale: reduceMotion ? 1 : cardScale }],
          },
        ]}
      >
        <Svg pointerEvents="none" style={styles.textureSvg} width={cardWidth} height={120}>
          <Defs>
            <Pattern id="guideDots" patternUnits="userSpaceOnUse" width="14" height="14">
              <Circle cx="1.6" cy="1.6" r="0.9" fill={theme.primary} fillOpacity="0.14" />
            </Pattern>
            <SvgLinearGradient id="guideDotsFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#000" stopOpacity="0.98" />
              <Stop offset="100%" stopColor="#000" stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="guideHalo" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={palette.gold} stopOpacity="0.34" />
              <Stop offset="100%" stopColor={palette.gold} stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width={cardWidth} height="120" fill="url(#guideDots)" mask="url(#guideDotsFade)" />
          <Circle cx={rtl ? cardWidth - 48 : 48} cy="22" r="70" fill="url(#guideHalo)" opacity="0.5" />
        </Svg>

        <View style={styles.headerRow}>
          <View style={[styles.headerCopy, rtl && styles.headerCopyRtl]}>
            <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{t('home.welcomeGuideTitle')}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>{t('home.welcomeGuideSubtitle')}</Text>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.bgInput, borderColor: theme.border }]}
            onPress={commitClose}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <X size={16} color={theme.textSecondary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <Animated.View
          style={[
            styles.contentWrap,
            {
              opacity: reduceMotion ? 1 : contentProgress,
              transform: [{
                translateY: reduceMotion ? 0 : contentProgress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }),
              }],
            },
          ]}
        >
          <View style={styles.lockupWrap}>
            <View style={[styles.brandRow, rtl && styles.brandRowRtl]}>
              <TouchableOpacity
                style={[
                  styles.brandCard,
                  { backgroundColor: theme.bgInput, borderColor: activeMode === 'merchant' ? palette.charbon : theme.border },
                  activeMode === 'merchant' && styles.brandCardActive,
                ]}
                onPress={() => setActiveMode('merchant')}
                accessibilityRole="button"
                accessibilityState={{ selected: activeMode === 'merchant' }}
                accessibilityLabel="JitPlus Pro"
              >
                <Image source={jitPlusProLogo} style={styles.brandLogo} contentFit="contain" />
                <Text style={[styles.brandName, { color: theme.text }]} maxFontSizeMultiplier={1.1}>{t('home.welcomeGuideProLabel')}</Text>
                <Text style={[styles.brandLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.1}>{t('home.welcomeGuideProHint')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.brandCard,
                  styles.brandCardPro,
                  { backgroundColor: theme.bgInput, borderColor: activeMode === 'client' ? palette.charbon : theme.border },
                  activeMode === 'client' && styles.brandCardActive,
                ]}
                onPress={() => setActiveMode('client')}
                accessibilityRole="button"
                accessibilityState={{ selected: activeMode === 'client' }}
                accessibilityLabel="JitPlus"
              >
                <Image source={jitPlusLogo} style={styles.brandLogo} contentFit="contain" />
                <Text style={[styles.brandName, { color: theme.text }]} maxFontSizeMultiplier={1.1}>{t('home.welcomeGuideAvailableOn')}</Text>
                <Text style={[styles.brandLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.1}>{t('home.welcomeGuideClientHint')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.caption, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.15}>
              {t('home.welcomeGuideAvailability')}
            </Text>
          </View>

          <View style={{ height: roadmapHeight, marginTop: 6 }}>
            <Svg width={roadmapWidth} height={roadmapHeight} style={styles.roadmapSvg}>
              <Defs>
                {/* Defined in this same <Svg> — react-native-svg does not resolve url(#id) across separate <Svg> elements. */}
                <SvgLinearGradient id="guideRoad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#C4B5FD" />
                  <Stop offset="65%" stopColor="#8B5CF6" />
                  <Stop offset="100%" stopColor={activeMode === 'client' ? '#FCD34D' : '#4C1D95'} />
                </SvgLinearGradient>
              </Defs>
              <AnimatedPath
                d={buildPath}
                stroke="url(#guideRoad)"
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
                strokeDasharray="1,11"
                strokeDashoffset={pathDashOffset as unknown as number}
              />
            </Svg>

            {activeJourney.map((step, index) => {
              const side = labelSide(index);
              const x = nodeX(index);
              const y = stepY[index];
              const stepAnim = stepProgress[index];
              const labelAnim = labelProgress[index];
              const backgroundColor = step.accent === 'gold' ? palette.gold : step.accent === 'deep' ? '#4C1D95' : '#8B5CF6';
              const labelPosition = side === 'left'
                ? { left: x + nodeSize + 12, textAlign: 'left' as const }
                : { right: roadmapWidth - x + nodeSize + 12, textAlign: 'right' as const };
              const labelTranslateX = labelAnim.interpolate({
                inputRange: [0, 1],
                outputRange: side === 'left' ? [-4, 0] : [4, 0],
              });

              return (
                <React.Fragment key={`${activeMode}-${index}`}>
                  <Animated.View
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`${index + 1}. ${step.title}. ${step.desc}`}
                    style={[
                      styles.stepWrap,
                      {
                        top: y,
                        left: x - nodeSize / 2,
                        width: nodeSize,
                        height: nodeSize,
                        backgroundColor,
                        opacity: stepAnim,
                        transform: [{ scale: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
                      },
                    ]}
                  >
                    <step.Icon size={18} color="#fff" strokeWidth={2.4} />
                    <View style={[styles.badge, { borderColor: backgroundColor }]}>
                      <Text style={styles.badgeText}>{index + 1}</Text>
                    </View>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.stepLabel,
                      labelPosition,
                      {
                        top: y - 2,
                        opacity: labelAnim,
                        transform: [{ translateX: labelTranslateX }],
                      },
                    ]}
                  >
                    <Text style={[styles.stepTitle, { color: theme.text }]} maxFontSizeMultiplier={1.15}>{step.title}</Text>
                  </Animated.View>
                </React.Fragment>
              );
            })}
          </View>

          <View style={[styles.dotsRow, rtl && styles.dotsRowRtl]}>
            <Animated.View
              style={[
                styles.dot,
                {
                  width: dotProgress.interpolate({ inputRange: [0, 1], outputRange: [16, 6] }),
                  backgroundColor: dotProgress.interpolate({ inputRange: [0, 1], outputRange: [palette.violet, theme.border] }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                {
                  width: dotProgress.interpolate({ inputRange: [0, 1], outputRange: [6, 16] }),
                  backgroundColor: dotProgress.interpolate({ inputRange: [0, 1], outputRange: [theme.border, palette.violet] }),
                },
              ]}
            />
          </View>
        </Animated.View>

        <View style={[styles.footer, rtl && styles.footerRtl, { borderTopColor: `${theme.border}AA` }]}>
          <TouchableOpacity
            style={[styles.hideRow, rtl && styles.hideRowRtl]}
            onPress={handleToggleDontShow}
            accessibilityRole="switch"
            accessibilityState={{ checked: dontShowAgain }}
            hitSlop={10}
          >
            <View style={[styles.toggleTrack, { backgroundColor: theme.border }]}>
              <Animated.View style={[styles.toggleGradientWrap, { opacity: toggleAnim }]}>
                <ExpoLinearGradient
                  colors={[palette.violet, palette.charbon]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.toggleThumb,
                  { transform: [{ translateX: toggleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }] },
                ]}
              />
            </View>
            <Text style={[styles.hideLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.1}>
              {t('onboarding.skipDontShow')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: palette.charbon, shadowColor: '#000' }]}
            onPress={commitClose}
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text style={styles.primaryBtnText}>{t('common.gotIt')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,15,20,0.44)',
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    alignSelf: 'center',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 18,
  },
  textureSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  headerRow: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: { flex: 1 },
  headerCopyRtl: { alignItems: 'flex-end' },
  title: { fontSize: 16, lineHeight: 19, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { fontSize: 11, lineHeight: 15, marginTop: 4, fontWeight: '500' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  lockupWrap: { alignItems: 'center', marginBottom: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 10 },
  brandRowRtl: { flexDirection: 'row-reverse' },
  brandCard: {
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  brandCardPro: {
    borderWidth: 1.25,
  },
  brandCardActive: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 3,
  },
  brandLogo: { width: 34, height: 34 },
  brandName: { fontSize: 13.5, fontWeight: '800', letterSpacing: -0.1 },
  brandLabel: { fontSize: 9.5, lineHeight: 12, textAlign: 'center', fontWeight: '600' },
  caption: { marginTop: 8, fontSize: 10, lineHeight: 13, textAlign: 'center', maxWidth: 300, fontWeight: '700' },
  roadmapSvg: { position: 'absolute', top: 0, left: 0 },
  stepWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 8, fontWeight: '900', color: '#0F172A' },
  stepLabel: { position: 'absolute', width: 170, justifyContent: 'center' },
  stepTitle: { fontSize: 11.5, lineHeight: 14, fontWeight: '800', letterSpacing: -0.1 },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  dotsRowRtl: { flexDirection: 'row-reverse' },
  dot: { height: 6, borderRadius: 3 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerRtl: { flexDirection: 'row-reverse' },
  hideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  hideRowRtl: { flexDirection: 'row-reverse', justifyContent: 'flex-end' },
  hideLabel: { fontSize: 11, fontWeight: '600' },
  toggleTrack: {
    width: 34,
    height: 20,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  toggleGradientWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    overflow: 'hidden',
  },
  toggleThumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  primaryBtn: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.1 },
});