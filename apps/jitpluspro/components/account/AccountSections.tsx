import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Switch, Platform } from 'react-native';
import {
  LogOut,
  ChevronDown,
  Smartphone,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Moon,
  Mail,
  MessageCircle,
  Globe,
} from 'lucide-react-native';
import { JitGames, JitGift, JitLock, JitStore } from '@/components/icons';
import InfoRow from '@/components/InfoRow';
import { palette, type useTheme } from '@/contexts/ThemeContext';
import { LANGUAGES, type AppLocale } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

type Theme = ReturnType<typeof useTheme>;
type TFn = (key: string, params?: Record<string, unknown>) => string;
type CardDarkBorder = { borderWidth: number; borderColor: string } | null;

const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 };

// Soft violet used consistently for every list/accordion icon.
const VIOLET_ICON_BG = 'rgba(124,58,237,0.09)';

/**
 * Chevron that smoothly rotates 180° (~250ms) when a section opens/closes,
 * instead of snapping between two static states.
 */
const AnimatedChevron = React.memo(function AnimatedChevron({ expanded, color }: { expanded: boolean; color: string }) {
  const [anim] = useState(() => new Animated.Value(expanded ? 1 : 0));
  useEffect(() => {
    Animated.timing(anim, {
      toValue: expanded ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [expanded, anim]);
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <ChevronDown size={ms(18)} color={color} strokeWidth={icon.stroke} />
    </Animated.View>
  );
});

export function PreferencesSection({
  prefExpanded,
  togglePref,
  theme,
  cardDarkBorder,
  locale,
  handleSelectLanguage,
  isTeamMember,
  referralCode,
  toggleDark,
  goToReferral,
  t,
}: {
  prefExpanded: boolean;
  togglePref: () => void;
  theme: Theme;
  cardDarkBorder: CardDarkBorder;
  locale: AppLocale;
  handleSelectLanguage: (code: AppLocale) => Promise<void>;
  isTeamMember: boolean;
  referralCode: string | null;
  toggleDark: () => void;
  goToReferral: () => void;
  t: TFn;
}) {
  const dir = useDir();
  return (
    <View>
      <TouchableOpacity
        onPress={togglePref}
        activeOpacity={0.7}
        style={[styles.sectionHeaderRow, { flexDirection: dir.row }]}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel={t('account.preferences')}
        accessibilityState={{ expanded: prefExpanded }}
      >
        <View style={[styles.sectionHeaderLeft, { flexDirection: dir.row }]}>
          <View style={[styles.sectionHeaderIcon, { backgroundColor: VIOLET_ICON_BG }]}>
            <SlidersHorizontal size={ms(15)} color={palette.violet} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.sectionTitle, dir.isRTL ? styles.sectionTitleRtl : styles.sectionTitleLtr, { color: theme.textSecondary }]}>{t('account.preferences')}</Text>
        </View>
        <AnimatedChevron expanded={prefExpanded} color={theme.textMuted} />
      </TouchableOpacity>
      {prefExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard }, cardDarkBorder]}>
          <InfoRow
            icon={<Moon size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
            label={t('account.darkMode')}
            subtitle={theme.isDark ? t('account.darkModeOn') : t('account.darkModeOff')}
            onPress={toggleDark}
            iconBg={VIOLET_ICON_BG}
            accessibilityRole="switch"
            accessibilityState={{ checked: theme.isDark }}
            right={
              <Switch
                value={theme.isDark}
                onValueChange={theme.setDarkMode}
                trackColor={{ false: theme.borderLight, true: palette.violet }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                ios_backgroundColor={theme.borderLight}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            }
          />
          {!isTeamMember && !referralCode && (
            <InfoRow
              icon={<JitGift size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('referral.menuTitle')}
              subtitle={t('referral.menuSubtitle')}
              onPress={goToReferral}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          <View style={styles.langBlock}>
            <View style={[styles.langBlockHead, { flexDirection: dir.row }]}>
              <View style={[styles.infoIconBox, { backgroundColor: VIOLET_ICON_BG }]}>
                <Globe size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoValue, { color: theme.text, textAlign: dir.textAlign }]}>{t('account.language')}</Text>
                <Text style={[styles.infoLabel, { color: theme.textMuted, textAlign: dir.textAlign }]}>{t('account.chooseLanguageDesc')}</Text>
              </View>
            </View>
            <View style={[styles.langPillsRow, { borderTopColor: theme.borderLight }]}>
              {LANGUAGES.map((l) => {
                const selected = l.code === locale;
                const isAr = l.code === 'ar';
                return (
                  <TouchableOpacity
                    key={l.code}
                    onPress={() => handleSelectLanguage(l.code)}
                    activeOpacity={0.7}
                    style={[
                      styles.langPill,
                      {
                        borderColor: selected ? theme.primary : theme.borderLight,
                        backgroundColor: selected ? `${theme.primary}12` : 'transparent',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={l.label}
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.langPillFlag} maxFontSizeMultiplier={1.2}>{l.flag}</Text>
                    <Text
                      style={[
                        styles.langPillLabel,
                        { color: selected ? theme.primary : theme.text },
                        isAr && styles.langPillLabelRtl,
                      ]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                    >
                      {isAr ? l.nativeLabel : l.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export function AccountSection({
  compteExpanded,
  toggleCompte,
  theme,
  cardDarkBorder,
  isTeamMember,
  goToSecurity,
  goToDevices,
  goToLegal,
  goToStore,
  openSupport,
  t,
}: {
  compteExpanded: boolean;
  toggleCompte: () => void;
  theme: Theme;
  cardDarkBorder: CardDarkBorder;
  isTeamMember: boolean;
  goToSecurity: () => void;
  goToDevices: () => void;
  goToLegal: () => void;
  goToStore: () => void;
  openSupport: () => void;
  t: TFn;
}) {
  const dir = useDir();
  return (
    <View>
      <TouchableOpacity
        onPress={toggleCompte}
        activeOpacity={0.7}
        style={[styles.sectionHeaderRow, { flexDirection: dir.row }]}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel={t('account.security')}
        accessibilityState={{ expanded: compteExpanded }}
      >
        <View style={[styles.sectionHeaderLeft, { flexDirection: dir.row }]}>
          <View style={[styles.sectionHeaderIcon, { backgroundColor: VIOLET_ICON_BG }]}>
            <ShieldCheck size={ms(15)} color={palette.violet} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.sectionTitle, dir.isRTL ? styles.sectionTitleRtl : styles.sectionTitleLtr, { color: theme.textSecondary }]}>{t('account.security')}</Text>
        </View>
        <AnimatedChevron expanded={compteExpanded} color={theme.textMuted} />
      </TouchableOpacity>
      {compteExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard }, cardDarkBorder]}>
          {!isTeamMember && (
            <InfoRow
              icon={<JitLock size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.passwordRow')}
              subtitle={t('account.passwordRowSubtitle')}
              onPress={goToSecurity}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          {!isTeamMember && (
            <InfoRow
              icon={<Smartphone size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.stores')}
              subtitle={t('account.storesSubtitle')}
              onPress={goToDevices}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          {!isTeamMember && (
            <InfoRow
              icon={<JitStore size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.storeHubTitle')}
              subtitle={t('account.storeHubSubtitle')}
              onPress={goToStore}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          <InfoRow
            icon={<Shield size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
            label={t('account.legalSection')}
            subtitle={t('account.legalSubtitle')}
            onPress={goToLegal}
            iconBg={VIOLET_ICON_BG}
          />
          <View style={styles.supportRowWrap}>
            <InfoRow
              icon={<MessageCircle size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.contactSupport')}
              subtitle={t('account.supportShortcutTag')}
              onPress={openSupport}
              iconBg={VIOLET_ICON_BG}
              noBorder
              right={
                <View style={[styles.supportChannels, { flexDirection: dir.row }]}>
                  <View style={[styles.channelDot, { backgroundColor: '#25D36618' }]}>
                    <MessageCircle size={ms(12)} color="#25D366" strokeWidth={icon.strokeSmall} />
                  </View>
                  <View style={[styles.channelDot, { backgroundColor: '#EA433518' }]}>
                    <Mail size={ms(12)} color="#EA4335" strokeWidth={icon.strokeSmall} />
                  </View>
                </View>
              }
            />
          </View>
        </View>
      )}
    </View>
  );
}

export function DangerSection({
  theme,
  cardDarkBorder,
  isTeamMember,
  handleSignOut,
  goToDelete,
  t,
}: {
  theme: Theme;
  cardDarkBorder: CardDarkBorder;
  isTeamMember: boolean;
  handleSignOut: () => void;
  goToDelete: () => void;
  t: TFn;
}) {
  const dir = useDir();
  return (
    <View style={styles.dangerSection}>
      <Text
        style={[styles.dangerEyebrow, dir.isRTL ? styles.sectionTitleRtl : styles.sectionTitleLtr, { color: theme.textMuted }]}
        maxFontSizeMultiplier={1.4}
      >
        {t('common.account')}
      </Text>
      <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard, marginBottom: hp(6) }, cardDarkBorder]}>
        <InfoRow
          icon={<LogOut size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} style={dir.flip} />}
          label={t('account.signOut')}
          onPress={handleSignOut}
          iconBg={VIOLET_ICON_BG}
          noBorder
        />
      </View>
      {!isTeamMember && (
        <TouchableOpacity
          onPress={goToDelete}
          activeOpacity={0.7}
          style={styles.deleteAccountLink}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel={t('account.deleteAccount')}
        >
          <Text style={[styles.deleteAccountLinkText, { color: theme.danger }]}> {t('account.deleteAccount')} </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function TeamMemberBanner({
  theme,
  teamMember,
  t,
}: {
  theme: Theme;
  teamMember: { nom: string } | null;
  t: TFn;
}) {
  const dir = useDir();
  if (!teamMember) return null;

  return (
    <View style={[styles.teamBanner, { flexDirection: dir.row, backgroundColor: `${palette.charbon}12`, borderColor: `${palette.charbon}30` }]}>
      <View style={[styles.infoIconBox, { backgroundColor: `${palette.charbon}15` }]}>
        <Shield size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoValue, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('account.teamMemberTitle', { name: teamMember.nom })}
        </Text>
        <Text style={[styles.infoLabel, { color: theme.textMuted, textAlign: dir.textAlign }]}>
          {t('account.teamMemberSub')}
        </Text>
      </View>
    </View>
  );
}

export function LuckyWheelCard({
  theme,
  cardDarkBorder,
  onPress,
  t,
}: {
  theme: Theme;
  cardDarkBorder: CardDarkBorder;
  onPress: () => void;
  t: TFn;
}) {
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard, marginTop: hp(8) }, cardDarkBorder]}>
      <InfoRow
        icon={<JitGames size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />}
        label={t('luckyWheel.menuTitle')}
        subtitle={t('luckyWheel.menuSubtitle')}
        onPress={onPress}
        noBorder
      />
    </View>
  );
}

export function LogoFooter({
  theme,
  version,
}: {
  theme: Theme;
  version: string;
}) {
  return (
    <View style={styles.logoFooter}>
      <Image
        source={require('@/assets/images/jitplusprologo.png')}
        style={styles.logoImage}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[styles.logoSubtext, { color: theme.textMuted }]}>JitPlus Pro</Text>
      <Text style={[styles.versionText, { color: theme.textMuted }]}>v{version}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(8),
    marginTop: hp(8),
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    flexShrink: 1,
  },
  sectionHeaderIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FS.sm,
    marginBottom: hp(8),
    marginTop: hp(8),
    fontFamily: font.semibold,
  },
  sectionTitleLtr: { marginLeft: wp(4) },
  sectionTitleRtl: { marginRight: wp(4), textAlign: 'right' },

  infoCard: {
    borderRadius: radius.lg,
    // Android can visually blank children when borderRadius + overflow:hidden
    // + elevation are combined on frequently re-rendered containers.
    overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
    marginBottom: hp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'ios' ? 0.04 : 0,
    shadowRadius: 12,
    elevation: Platform.OS === 'android' ? 0 : 2,
  },
  infoIconBox: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: FS.xs, marginBottom: hp(2), fontFamily: font.regular },
  infoValue: { fontSize: FS.md, fontFamily: font.medium },

  teamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: wp(14),
    marginBottom: hp(16),
    gap: wp(12),
  },

  supportRowWrap: { opacity: 0.78 },
  supportChannels: { flexDirection: 'row', gap: wp(6) },
  channelDot: {
    width: ms(24),
    height: ms(24),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Not gated by the Security accordion so sign-out stays visible.
  dangerSection: {
    marginTop: hp(14),
  },
  dangerEyebrow: {
    fontSize: FS.sm,
    marginBottom: hp(10),
    fontFamily: font.semibold,
  },
  // Low-affordance link: the actual confirmation lives on the Security screen.
  deleteAccountLink: {
    alignSelf: 'center',
    minHeight: ms(44),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(16),
    marginTop: hp(2),
    marginBottom: hp(8),
  },
  deleteAccountLinkText: {
    fontSize: FS.sm,
    fontFamily: font.medium,
    textDecorationLine: 'underline',
  },

  langBlock: {
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    gap: hp(12),
  },
  langBlockHead: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  langPillsRow: {
    flexDirection: 'row',
    gap: wp(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: hp(12),
  },
  langPill: {
    flex: 1,
    minHeight: ms(44),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
    paddingHorizontal: wp(8),
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  langPillFlag: { fontSize: ms(16) },
  langPillLabel: { fontSize: FS.sm, fontFamily: font.semibold, flexShrink: 1 },
  langPillLabelRtl: { writingDirection: 'rtl', textAlign: 'right' },

  logoFooter: { alignItems: 'center', paddingTop: hp(24), paddingBottom: hp(10), opacity: 0.5 },
  logoImage: { width: ms(22), height: ms(22), borderRadius: radius.sm },
  logoSubtext: { fontSize: FS.xs, marginTop: hp(5), letterSpacing: 0.3, fontFamily: font.medium },
  versionText: { fontSize: FS.xs, marginTop: hp(2), fontFamily: font.regular },
});
