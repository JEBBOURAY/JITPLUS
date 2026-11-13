import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Switch, Platform } from 'react-native';
import { LogOut, Smartphone, Bell, Shield, Moon, Globe } from 'lucide-react-native';
import { JitGames, JitGift, JitLock } from '@/components/icons';
import InfoRow from '@/components/InfoRow';
import { palette, type useTheme } from '@/contexts/ThemeContext';
import { LANGUAGES, type AppLocale } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { font } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

type Theme = ReturnType<typeof useTheme>;
type TFn = (key: string, params?: Record<string, unknown>) => string;

const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 };

/** Titled card holding a list of rows. Always visible: nothing hides behind a tap. */
function Group({ theme, title, children }: { theme: Theme; title?: string; children: React.ReactNode }) {
  const dir = useDir();
  return (
    <View style={styles.group}>
      {title ? (
        <Text
          style={[styles.groupTitle, { color: theme.textMuted, textAlign: dir.textAlign }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.card,
          { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard },
          // Shadows are invisible on the near-black dark background: a border
          // detaches the card instead.
          theme.isDark && { borderWidth: 1, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function PreferencesSection({
  theme,
  locale,
  handleSelectLanguage,
  isTeamMember,
  referralCode,
  hideReferral = false,
  goToReferral,
  goToNotifications,
  t,
}: {
  theme: Theme;
  locale: AppLocale;
  handleSelectLanguage: (code: AppLocale) => Promise<void>;
  isTeamMember: boolean;
  referralCode: string | null;
  hideReferral?: boolean;
  goToReferral: () => void;
  goToNotifications: () => void;
  t: TFn;
}) {
  const { isDark, setDarkMode } = theme;
  return (
    <Group theme={theme} title={t('account.preferences')}>
      <InfoRow
        Icon={Moon}
        label={t('account.darkMode')}
        subtitle={isDark ? t('account.darkModeOn') : t('account.darkModeOff')}
        onPress={() => setDarkMode(!isDark)}
        accessibilityRole="switch"
        accessibilityState={{ checked: isDark }}
        right={
          <Switch
            value={isDark}
            onValueChange={setDarkMode}
            trackColor={{ false: theme.borderLight, true: palette.violet }}
            thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            ios_backgroundColor={theme.borderLight}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        }
      />
      <InfoRow
        Icon={Bell}
        label={t('notifSettings.title')}
        subtitle={t('notifSettings.accountRowSubtitle')}
        onPress={goToNotifications}
        chevron
      />
      {!isTeamMember && !hideReferral && !referralCode && (
        <InfoRow
          Icon={JitGift}
          label={t('referral.menuTitle')}
          subtitle={t('referral.menuSubtitle')}
          onPress={goToReferral}
          chevron
        />
      )}
      <InfoRow Icon={Globe} label={t('account.language')} subtitle={t('account.chooseLanguageDesc')} />
      <View style={styles.langPillsRow} accessibilityRole="radiogroup">
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
                  backgroundColor: selected ? theme.primaryBg : 'transparent',
                },
              ]}
              accessibilityRole="radio"
              accessibilityLabel={l.label}
              accessibilityState={{ checked: selected }}
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
    </Group>
  );
}

/** Owner-only: password and active sessions. */
export function SecuritySection({
  theme,
  goToSecurity,
  goToDevices,
  t,
}: {
  theme: Theme;
  goToSecurity: () => void;
  goToDevices: () => void;
  t: TFn;
}) {
  return (
    <Group theme={theme} title={t('account.security')}>
      <InfoRow
        Icon={JitLock}
        label={t('account.passwordRow')}
        subtitle={t('account.passwordRowSubtitle')}
        onPress={goToSecurity}
        chevron
      />
      <InfoRow
        Icon={Smartphone}
        label={t('account.stores')}
        subtitle={t('account.storesSubtitle')}
        onPress={goToDevices}
        chevron
        noBorder
      />
    </Group>
  );
}

export function LegalSection({
  theme,
  goToLegal,
  t,
}: {
  theme: Theme;
  goToLegal: () => void;
  t: TFn;
}) {
  return (
    <Group theme={theme}>
      <InfoRow
        Icon={Shield}
        label={t('account.legalSection')}
        subtitle={t('account.legalSubtitle')}
        onPress={goToLegal}
        chevron
        noBorder
      />
    </Group>
  );
}

export function DangerSection({
  theme,
  isTeamMember,
  handleSignOut,
  goToDelete,
  t,
}: {
  theme: Theme;
  isTeamMember: boolean;
  handleSignOut: () => void;
  goToDelete: () => void;
  t: TFn;
}) {
  return (
    <>
      <Group theme={theme}>
        <InfoRow Icon={LogOut} flipIcon label={t('account.signOut')} onPress={handleSignOut} noBorder />
      </Group>
      {!isTeamMember && (
        // Low-affordance link: the actual confirmation lives on the Security screen.
        <TouchableOpacity
          onPress={goToDelete}
          activeOpacity={0.7}
          style={styles.deleteAccountLink}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
        >
          <Text style={[styles.deleteAccountLinkText, { color: theme.danger }]}>{t('account.deleteAccount')}</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

export function TeamMemberBanner({
  teamMember,
  t,
}: {
  teamMember: { nom: string } | null;
  t: TFn;
}) {
  if (!teamMember) return null;

  return (
    <View style={[styles.teamBanner, { backgroundColor: `${palette.charbon}12`, borderColor: `${palette.charbon}30` }]}>
      <InfoRow
        Icon={Shield}
        neutral
        label={t('account.teamMemberTitle', { name: teamMember.nom })}
        subtitle={t('account.teamMemberSub')}
        noBorder
      />
    </View>
  );
}

export function LuckyWheelCard({
  theme,
  onPress,
  t,
}: {
  theme: Theme;
  onPress: () => void;
  t: TFn;
}) {
  return (
    <Group theme={theme}>
      <InfoRow
        Icon={JitGames}
        label={t('luckyWheel.menuTitle')}
        subtitle={t('luckyWheel.menuSubtitle')}
        onPress={onPress}
        chevron
        noBorder
      />
    </Group>
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
  group: { marginBottom: hp(18) },
  groupTitle: {
    fontSize: FS.sm,
    marginBottom: hp(8),
    marginHorizontal: wp(4),
    fontFamily: font.semibold,
  },
  card: {
    borderRadius: radius.lg,
    // Android can visually blank children when borderRadius + overflow:hidden
    // + elevation are combined on frequently re-rendered containers.
    overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'ios' ? 0.04 : 0,
    shadowRadius: 12,
  },

  teamBanner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: hp(18),
  },

  deleteAccountLink: {
    alignSelf: 'center',
    minHeight: ms(44),
    justifyContent: 'center',
    paddingHorizontal: wp(16),
    marginTop: -hp(8),
  },
  deleteAccountLinkText: {
    fontSize: FS.sm,
    fontFamily: font.medium,
    textDecorationLine: 'underline',
  },

  langPillsRow: {
    flexDirection: 'row',
    gap: wp(8),
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
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
