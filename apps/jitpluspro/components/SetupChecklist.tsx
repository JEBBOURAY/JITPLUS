import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  I18nManager,
  Modal,
  Pressable,
} from 'react-native';
import {
  Check,
  Coins,
  Gift,
  ScanLine,
  Trophy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Store,
  Eye,
  Ticket,
  X,
  Info,
  EyeOff,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, palette, brandGradientFull } from '@/contexts/ThemeContext';
import { useScanGuard } from '@/hooks/useScanGuard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRewards, useTransactions } from '@/hooks/useQueryHooks';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { ms } from '@/utils/responsive';
import { useTour } from '@/components/GuidedTour';

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
type Tier = 'primary' | 'required' | 'neutral';

interface ChecklistItemVM {
  id: string;
  tier: Tier;
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  done: boolean;
  onPress: () => void;
}

interface SecondaryVM {
  id: string;
  title: string;
  Icon: LucideIcon;
  onPress: () => void;
  badge?: string;
}

const TIER_COLORS: Record<Tier, { bg: string; fg: string }> = {
  primary: { bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' },
  required: { bg: 'rgba(239,68,68,0.10)', fg: '#EF4444' },
  neutral: { bg: 'rgba(100,116,139,0.10)', fg: '#64748B' },
};

/** Pure helper — computes progress from resolved booleans. Exported for tests. */
export function getChecklistProgress(input: {
  hasLogo: boolean;
  loyaltyChosen: boolean;
  hasReward: boolean;
  hasScanned: boolean;
}): { done: number; total: number; allDone: boolean } {
  const flags = [
    input.hasLogo,
    input.loyaltyChosen,
    input.hasReward,
    input.hasScanned,
  ];
  const total = flags.length;
  const done = flags.filter(Boolean).length;
  return { done, total, allDone: done === total };
}

/**
 * Progressive, non-blocking setup checklist shown on the Accueil tab.
 * Reflects real backend state (loyalty program, rewards, first scan, email
 * verification) and persists locally to avoid a content flash on reload.
 */
function SetupChecklistInner() {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const isRTL = I18nManager.isRTL;
  const tour = useTour();
  const { openScanner } = useScanGuard();

  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);

  const rewardsQuery = useRewards(!!merchant && !isTeamMember);
  // First-scan detection via transactions (shared query key with Accueil, works
  // on every plan). Avoids the Pro-only /dashboard-kpis endpoint (403 on trial/free).
  const transactionsQuery = useTransactions(!!merchant && !isTeamMember);

  // ── Local persisted flags ──
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [scannedCache, setScannedCache] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [hideNoticeSeen, setHideNoticeSeen] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // True only when the user hides the guide during this very session, so the
  // one-time "hidden" notice is deferred to the *next* Accueil open.
  const closedThisSessionRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [d, s, c, h, n] = await AsyncStorage.multiGet([
          ASYNC_STORAGE_KEYS.CHECKLIST_DISMISSED,
          ASYNC_STORAGE_KEYS.CHECKLIST_SCANNED,
          ASYNC_STORAGE_KEYS.CHECKLIST_COLLAPSED,
          ASYNC_STORAGE_KEYS.CHECKLIST_HIDDEN,
          ASYNC_STORAGE_KEYS.CHECKLIST_HIDE_NOTICE_SEEN,
        ]);
        if (!active) return;
        setDismissed(d[1] === 'true');
        setScannedCache(s[1] === 'true');
        setCollapsed(c[1] === 'true');
        setHidden(h[1] === 'true');
        setHideNoticeSeen(n[1] === 'true');
      } catch {
        if (active) {
          setDismissed(false);
          setCollapsed(false);
          setHidden(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ── Resolved state ──
  const isSocial = !!merchant?.googleId || !!merchant?.appleId;
  const emailVerified = !!merchant?.emailVerified;
  const emailItemShown = !isSocial; // social accounts are considered verified
  // Loyalty program is real backend truth now: null until the merchant chooses.
  const loyaltyChosen = !!merchant?.loyaltyType;
  const hasLogo = !!merchant?.logoUrl;
  const hasReward = (rewardsQuery.data?.length ?? 0) > 0;
  const backendScanned =
    transactionsQuery.data?.pages?.some((p) => p.transactions.length > 0) ?? false;
  const hasScanned = backendScanned || scannedCache;

  // Cache "first scan done" once observed so the item stays checked on reload.
  useEffect(() => {
    if (backendScanned && !scannedCache) {
      setScannedCache(true);
      AsyncStorage.setItem(ASYNC_STORAGE_KEYS.CHECKLIST_SCANNED, 'true').catch(() => {});
    }
  }, [backendScanned, scannedCache]);

  // Auto-propose the guided tour once, the first time the checklist is visible
  // after registration (memorized in AsyncStorage by the tour provider).
  const checklistVisible = !isTeamMember && dismissed === false && hidden === false;
  useEffect(() => {
    if (checklistVisible) tour?.requestAutoStart();
  }, [checklistVisible, tour]);

  // One-time discreet notice after a permanent hide: persist "seen" the first
  // time we would render it (i.e. on the *next* Accueil open, not the session
  // where the user hit "hide"). closedThisSessionRef defers it by one session.
  useEffect(() => {
    if (hidden === true && !hideNoticeSeen && !closedThisSessionRef.current) {
      AsyncStorage.setItem(ASYNC_STORAGE_KEYS.CHECKLIST_HIDE_NOTICE_SEEN, 'true').catch(() => {});
    }
  }, [hidden, hideNoticeSeen]);

  const { done, total, allDone } = getChecklistProgress({
    hasLogo,
    loyaltyChosen,
    hasReward,
    hasScanned,
  });

  // ── Handlers ──
  const goToAccount = useCallback(() => {
    router.push('/account');
  }, [router]);

  const goToLoyalty = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      AsyncStorage.setItem(
        ASYNC_STORAGE_KEYS.CHECKLIST_COLLAPSED,
        next ? 'true' : 'false',
      ).catch(() => {});
      return next;
    });
  }, []);

  const openConfirm = useCallback(() => setConfirmVisible(true), []);
  const closeConfirm = useCallback(() => setConfirmVisible(false), []);

  // Permanent hide from the Accueil — display preference only. Underlying setup
  // features stay fully functional and reachable from Compte → Ma boutique.
  const confirmHide = useCallback(() => {
    closedThisSessionRef.current = true;
    setConfirmVisible(false);
    setHidden(true);
    AsyncStorage.setItem(ASYNC_STORAGE_KEYS.CHECKLIST_HIDDEN, 'true').catch(() => {});
  }, []);

  // ── Loyalty subtitle from current program ──
  const loyaltySubtitle = useMemo(() => {
    if (!merchant?.loyaltyType) return t('checklist.loyaltySubChoose');
    if (merchant?.loyaltyType === 'STAMPS') return t('checklist.loyaltySubStamps');
    const rate = merchant?.pointsRate ?? merchant?.pointsRules?.pointsPerDirham ?? 1;
    return t('checklist.loyaltySubPoints', { rate });
  }, [merchant?.loyaltyType, merchant?.pointsRate, merchant?.pointsRules?.pointsPerDirham, t]);

  const items = useMemo<ChecklistItemVM[]>(() => {
    const list: ChecklistItemVM[] = [
      {
        id: 'logo',
        tier: 'primary',
        title: t('checklist.logoTitle'),
        subtitle: t('checklist.logoSub'),
        Icon: Store,
        done: hasLogo,
        onPress: goToAccount,
      },
      {
        id: 'loyalty',
        tier: 'primary',
        title: t('checklist.loyaltyTitle'),
        subtitle: loyaltySubtitle,
        Icon: Coins,
        done: loyaltyChosen,
        onPress: goToLoyalty,
      },
      {
        id: 'reward',
        tier: 'primary',
        title: t('checklist.rewardTitle'),
        subtitle: t('checklist.rewardSub'),
        Icon: Gift,
        done: hasReward,
        onPress: () => router.push('/settings'),
      },
      {
        id: 'scan',
        tier: 'neutral',
        title: t('checklist.scanTitle'),
        subtitle: t('checklist.scanSub'),
        Icon: ScanLine,
        done: hasScanned,
        onPress: openScanner,
      },
    ];
    return list;
  }, [
    t,
    loyaltySubtitle,
    hasLogo,
    loyaltyChosen,
    goToAccount,
    goToLoyalty,
    hasReward,
    hasScanned,
    emailItemShown,
    emailVerified,
    merchant?.email,
    router,
  ]);

  const secondary = useMemo<SecondaryVM[]>(
    () => [
      {
        id: 'profile',
        title: t('checklist.secondaryProfile'),
        Icon: Store,
        onPress: () => router.push('/stores'),
      },
      {
        id: 'preview',
        title: t('checklist.secondaryPreview'),
        Icon: Eye,
        onPress: () => router.push({ pathname: '/store-preview', params: { mode: 'edit', view: 'preview' } } as never),
      },
      {
        id: 'wheel',
        title: t('checklist.secondaryWheel'),
        Icon: Ticket,
        onPress: () => router.push('/lucky-wheel'),
        badge: t('checklist.proBadge'),
      },
    ],
    [t, router],
  );

  // Group primary + required items with tier section labels.
  const tier1 = items.filter((i) => i.tier === 'primary');
  const tier2 = items.filter((i) => i.tier === 'required');
  const neutralItems = items.filter((i) => i.tier === 'neutral');

  // Priority order used to surface the single "next step" and the done preview.
  const orderedItems = [...tier1, ...neutralItems, ...tier2];
  const nextStep = orderedItems.find((i) => !i.done);
  const doneItems = orderedItems.filter((i) => i.done);
  const progressPct = total > 0 ? done / total : 0;

  // Team members and loading states render nothing (avoid a content flash).
  if (isTeamMember || dismissed === null || collapsed === null || hidden === null) return null;

  // Auto-dismissed once 100% complete (legacy behaviour) → nothing.
  if (dismissed) return null;

  // Permanently hidden by the user. Show the one-time discreet notice on the
  // *next* Accueil open following the hide, then nothing ever again.
  if (hidden) {
    if (!hideNoticeSeen && !closedThisSessionRef.current) {
      return (
        <View style={styles.noticeRow} accessibilityRole="text">
          <Info size={ms(15)} color={theme.textMuted} strokeWidth={2} />
          <Text
            style={[styles.noticeText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('checklist.hiddenNotice')}
          </Text>
        </View>
      );
    }
    return null;
  }

  // ── Collapsed (compact) form — a single reduced line with a progress ring ──
  if (collapsed && !allDone) {
    return (
      <>
        <TouchableOpacity
          onPress={toggleCollapsed}
          activeOpacity={0.85}
          style={[
            styles.collapsedCard,
            { backgroundColor: theme.bgCard, borderColor: theme.borderLight },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('checklist.expand')}
        >
          <ProgressRing pct={progressPct} theme={theme} />
          <View style={styles.flex1}>
            <Text
              style={[styles.title, { color: theme.text }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {t('checklist.title')}
            </Text>
            {!!nextStep && (
              <Text
                style={[styles.rowSub, { color: theme.textMuted }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {t('checklist.collapsedNext', { name: nextStep.title })}
              </Text>
            )}
          </View>
          <ChevronDown size={ms(20)} color={theme.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        <HideConfirmSheet
          visible={confirmVisible}
          onCancel={closeConfirm}
          onConfirm={confirmHide}
          theme={theme}
          t={t}
        />
      </>
    );
  }

  return (
    <>
      <View
        style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
        accessibilityRole="summary"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.flex1}>
            <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
              {allDone ? t('checklist.doneTitle') : t('checklist.title')}
            </Text>
            <Text
              style={[styles.progressLabel, { color: theme.textMuted }]}
              maxFontSizeMultiplier={1.4}
            >
              {allDone ? t('checklist.doneSub') : t('checklist.progress', { done, total })}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {!allDone && (
              <TouchableOpacity
                onPress={toggleCollapsed}
                style={styles.headerBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('checklist.collapse')}
              >
                <ChevronUp size={ms(20)} color={theme.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={openConfirm}
              style={styles.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('checklist.dismiss')}
            >
              <X size={ms(20)} color={theme.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: theme.borderLight }]}>
          <LinearGradient
            colors={[...brandGradientFull]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBar, { width: `${Math.max(progressPct * 100, 6)}%` }]}
          />
        </View>

        {allDone ? (
          <View style={styles.doneWrap}>
            <View style={[styles.doneBadge, { backgroundColor: 'rgba(124,58,237,0.10)' }]}>
              <Trophy size={ms(28)} color={palette.violet} strokeWidth={1.75} />
            </View>
          </View>
        ) : showAll ? (
          <>
            {/* Full list */}
            <SectionLabel label={t('checklist.tierPrimary')} tier="primary" />
            {tier1.map((it) => (
              <ChecklistRow key={it.id} item={it} theme={theme} isRTL={isRTL} />
            ))}
            {neutralItems.map((it) => (
              <ChecklistRow key={it.id} item={it} theme={theme} isRTL={isRTL} />
            ))}
            {tier2.length > 0 && (
              <>
                <SectionLabel label={t('checklist.tierRequired')} tier="required" />
                {tier2.map((it) => (
                  <ChecklistRow key={it.id} item={it} theme={theme} isRTL={isRTL} />
                ))}
              </>
            )}
            <TouchableOpacity
              onPress={() => setShowAll(false)}
              style={styles.viewAllBtn}
              accessibilityRole="button"
            >
              <Text style={[styles.viewAllText, { color: palette.violet }]}>{t('checklist.viewLess')}</Text>
              <ChevronUp size={ms(16)} color={palette.violet} strokeWidth={2} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Next step highlight */}
            {!!nextStep && (
              <NextStepHighlight
                item={nextStep}
                eyebrow={t('checklist.nextEyebrow')}
                theme={theme}
                isRTL={isRTL}
              />
            )}

            {/* Compact done preview */}
            {doneItems.map((it) => (
              <CompactDoneRow key={it.id} title={it.title} theme={theme} />
            ))}

            {/* View all */}
            <TouchableOpacity
              onPress={() => setShowAll(true)}
              style={styles.viewAllBtn}
              accessibilityRole="button"
            >
              <Text style={[styles.viewAllText, { color: palette.violet }]}>
                {t('checklist.viewAll', { count: total })}
              </Text>
              <ChevronDown size={ms(16)} color={palette.violet} strokeWidth={2} />
            </TouchableOpacity>
          </>
        )}

        {/* Tier 3 — secondary links (outside the progress bar) */}
        <View style={[styles.secondaryWrap, { borderTopColor: theme.borderLight }]}>
          {secondary.map((s, idx) => (
            <TouchableOpacity
              key={s.id}
              onPress={s.onPress}
              activeOpacity={0.7}
              style={[
                styles.secondaryRow,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight },
              ]}
              accessibilityRole="button"
              accessibilityLabel={s.title}
            >
              <s.Icon size={ms(18)} color={theme.textMuted} strokeWidth={1.75} />
              <Text style={[styles.secondaryText, { color: theme.textSecondary }]} numberOfLines={1}>
                {s.title}
              </Text>
              {s.badge && (
                <View style={[styles.proBadge, { backgroundColor: 'rgba(252,211,77,0.18)' }]}>
                  <Text style={styles.proBadgeText}>{s.badge}</Text>
                </View>
              )}
              <ChevronRight
                size={ms(18)}
                color={theme.textMuted}
                style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <HideConfirmSheet
        visible={confirmVisible}
        onCancel={closeConfirm}
        onConfirm={confirmHide}
        theme={theme}
        t={t}
      />
    </>
  );
}

// ── Circular progress ring (compact view) ──
const ProgressRing = React.memo(function ProgressRing({
  pct,
  theme,
}: {
  pct: number;
  theme: ReturnType<typeof useTheme>;
}) {
  const size = ms(44);
  const stroke = ms(4);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.borderLight} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.violet}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={[styles.ringText, { color: theme.text }]} maxFontSizeMultiplier={1.2}>
          {Math.round(clamped * 100)}%
        </Text>
      </View>
    </View>
  );
});

// ── "Next step" highlight row (expanded default view) ──
const NextStepHighlight = React.memo(function NextStepHighlight({
  item,
  eyebrow,
  theme,
  isRTL,
}: {
  item: ChecklistItemVM;
  eyebrow: string;
  theme: ReturnType<typeof useTheme>;
  isRTL: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={item.onPress}
      activeOpacity={0.85}
      style={[styles.nextRow, { borderColor: theme.borderLight }]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <LinearGradient
        colors={[...brandGradientFull]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.nextIcon}
      >
        <item.Icon size={ms(20)} color="#fff" strokeWidth={2} />
      </LinearGradient>
      <View style={styles.nextTextWrap}>
        <Text style={styles.nextEyebrow} maxFontSizeMultiplier={1.3}>
          {eyebrow}
        </Text>
        <Text style={[styles.nextTitle, { color: theme.text }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {item.title}
        </Text>
        {!!item.subtitle && (
          <Text style={[styles.nextSub, { color: theme.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {item.subtitle}
          </Text>
        )}
      </View>
      <LinearGradient
        colors={[...brandGradientFull]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.nextArrow}
      >
        <ArrowRight
          size={ms(18)}
          color="#fff"
          strokeWidth={2.25}
          style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
        />
      </LinearGradient>
    </TouchableOpacity>
  );
});

// ── Compact "done" preview row ──
const CompactDoneRow = React.memo(function CompactDoneRow({
  title,
  theme,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.compactDoneRow}>
      <View style={[styles.compactCheck, { backgroundColor: theme.success }]}>
        <Check size={ms(11)} color="#fff" strokeWidth={3} />
      </View>
      <Text
        style={[styles.compactDoneText, { color: theme.textMuted }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {title}
      </Text>
    </View>
  );
});

// ── Confirmation bottom sheet for permanent hide ──
const HideConfirmSheet = React.memo(function HideConfirmSheet({
  visible,
  onCancel,
  onConfirm,
  theme,
  t,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={t('checklist.cancel')}>
        <Pressable
          style={styles.sheetOuter}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={[styles.sheet, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <View style={[styles.sheetIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
              <EyeOff size={ms(26)} color={theme.danger} strokeWidth={1.9} />
            </View>
            <Text style={[styles.sheetTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
              {t('checklist.hideTitle')}
            </Text>
            <Text style={[styles.sheetBody, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
              {t('checklist.hideBody')}
            </Text>
            <TouchableOpacity
              onPress={onConfirm}
              activeOpacity={0.85}
              style={[styles.sheetPrimary, { backgroundColor: theme.danger }]}
              accessibilityRole="button"
              accessibilityLabel={t('checklist.hideConfirm')}
            >
              <Text style={styles.sheetPrimaryText}>{t('checklist.hideConfirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.7}
              style={styles.sheetCancel}
              accessibilityRole="button"
              accessibilityLabel={t('checklist.cancel')}
            >
              <Text style={[styles.sheetCancelText, { color: theme.textMuted }]}>{t('checklist.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

// ── Section label (tier heading) ──
const SectionLabel = React.memo(function SectionLabel({ label, tier }: { label: string; tier: Tier }) {
  const c = TIER_COLORS[tier];
  return (
    <View style={styles.sectionLabelRow}>
      <View style={[styles.tierDot, { backgroundColor: c.fg }]} />
      <Text style={[styles.sectionLabel, { color: c.fg }]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </View>
  );
});

// ── Interactive checklist row ──
const ChecklistRow = React.memo(function ChecklistRow({
  item,
  theme,
  isRTL,
}: {
  item: ChecklistItemVM;
  theme: ReturnType<typeof useTheme>;
  isRTL: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={item.onPress}
      activeOpacity={0.7}
      disabled={item.done}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ checked: item.done }}
      accessibilityLabel={item.title}
    >
      <StatusDot done={item.done} tier={item.tier} theme={theme} />
      <View style={styles.rowTextWrap}>
        <Text
          style={[
            styles.rowTitle,
            { color: theme.text },
            item.done && { color: theme.textMuted, textDecorationLine: 'line-through' },
          ]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
        >
          {item.title}
        </Text>
        {!!item.subtitle && !item.done && (
          <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {item.subtitle}
          </Text>
        )}
      </View>
      {!item.done && (
        <ChevronRight
          size={ms(18)}
          color={theme.textMuted}
          style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
        />
      )}
    </TouchableOpacity>
  );
});

// ── Status indicator (checked / pending) ──
const StatusDot = React.memo(function StatusDot({
  done,
  tier,
  theme,
}: {
  done: boolean;
  tier: Tier;
  theme: ReturnType<typeof useTheme>;
}) {
  const c = TIER_COLORS[tier];
  if (done) {
    return (
      <View style={[styles.dot, { backgroundColor: theme.success }]}>
        <Check size={ms(14)} color="#fff" strokeWidth={3} />
      </View>
    );
  }
  return <View style={[styles.dot, styles.dotPending, { borderColor: c.fg }]} />;
});

export const SetupChecklist = React.memo(SetupChecklistInner);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
    ...Platform.select({
      ios: { shadowColor: '#1F2937', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: ms(16), fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  progressLabel: { fontSize: ms(12), fontFamily: 'Lexend_500Medium', marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressBar: { height: '100%', borderRadius: 3 },

  doneWrap: { alignItems: 'center', paddingVertical: 12 },
  doneBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 4 },
  tierDot: { width: 7, height: 7, borderRadius: 4 },
  sectionLabel: {
    fontSize: ms(11),
    fontFamily: 'Lexend_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 44 },
  rowTextWrap: { flex: 1 },
  rowTitle: { fontSize: ms(14), fontFamily: 'Lexend_600SemiBold' },
  rowSub: { fontSize: ms(12), fontFamily: 'Lexend_400Regular', marginTop: 1 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dotPending: { borderWidth: 2, backgroundColor: 'transparent' },

  secondaryWrap: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 44 },
  secondaryText: { flex: 1, fontSize: ms(13), fontFamily: 'Lexend_500Medium' },
  proBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  proBadgeText: { fontSize: ms(10), fontFamily: 'Lexend_700Bold', color: '#B45309' },

  // ── Progress ring (collapsed) ──
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: ms(12), fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },

  // ── Collapsed card ──
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
    minHeight: 44,
    ...Platform.select({
      ios: { shadowColor: '#1F2937', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },

  // ── Next step highlight ──
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(124,58,237,0.04)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 44,
  },
  nextIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextTextWrap: { flex: 1 },
  nextEyebrow: {
    fontSize: ms(10),
    fontFamily: 'Lexend_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.violet,
    marginBottom: 2,
  },
  nextTitle: { fontSize: ms(14), fontFamily: 'Lexend_600SemiBold' },
  nextSub: { fontSize: ms(12), fontFamily: 'Lexend_400Regular', marginTop: 1 },
  nextArrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  // ── Compact done preview ──
  compactDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  compactCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  compactDoneText: { flex: 1, fontSize: ms(13), fontFamily: 'Lexend_500Medium', textDecorationLine: 'line-through' },

  // ── View all / view less ──
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 8, minHeight: 44 },
  viewAllText: { fontSize: ms(13), fontFamily: 'Lexend_600SemiBold' },

  // ── Post-hide discreet notice ──
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 10, marginTop: 8 },
  noticeText: { flex: 1, fontSize: ms(12), fontFamily: 'Lexend_400Regular' },

  // ── Confirmation bottom sheet ──
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetOuter: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 36,
    paddingHorizontal: 24,
    gap: 12,
  },
  sheetIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: ms(18), fontFamily: 'Lexend_700Bold', letterSpacing: -0.3, textAlign: 'center' },
  sheetBody: { fontSize: ms(13), fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: ms(19) },
  sheetPrimary: {
    alignSelf: 'stretch',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 4,
  },
  sheetPrimaryText: { fontSize: ms(15), fontFamily: 'Lexend_700Bold', color: '#fff' },
  sheetCancel: { alignSelf: 'stretch', paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  sheetCancelText: { fontSize: ms(14), fontFamily: 'Lexend_600SemiBold' },
});
