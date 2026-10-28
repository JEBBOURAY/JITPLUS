import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, Pencil } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Skeleton from '@/components/Skeleton';
import { useAppFonts } from '@/utils/fonts';
import { getInitials } from '@/utils/profileCompletion';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';
import type { Client } from '@/types';

const LOCALE_TAGS: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };

interface ProfileHeaderProps {
  client: Client | null;
  isLoading: boolean;
  onEdit: () => void;
}

function ProfileHeader({ client, isLoading, onEdit }: ProfileHeaderProps) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const fonts = useAppFonts();

  const createdAt = client?.createdAt;
  const memberSince = useMemo(() => {
    if (!createdAt) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    try {
      const label = new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? 'fr-FR', { month: 'long', year: 'numeric' }).format(date);
      return t('profile.memberSince', { date: label });
    } catch {
      return null;
    }
  }, [createdAt, locale, t]);

  const fullName = [client?.prenom, client?.nom].filter(Boolean).join(' ');
  const contact = client?.email || client?.telephone || null;
  const contactVerified = client?.email ? !!client.emailVerified : !!client?.telephoneVerified;

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={styles.identityRow}>
        <LinearGradient
          colors={[palette.violet, palette.violetVivid, palette.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarRing}
        >
          <View style={[styles.avatarInner, { backgroundColor: theme.isDark ? palette.violetDeep : palette.violet }]}>
            <Text style={[styles.avatarText, { fontFamily: fonts.bold }]}>{getInitials(client)}</Text>
          </View>
        </LinearGradient>

        <View style={styles.identityText}>
          {isLoading ? (
            <>
              <Skeleton width={wp(140)} height={ms(18)} borderRadius={6} />
              <Skeleton width={wp(100)} height={ms(12)} borderRadius={6} style={{ marginTop: hp(8) }} />
            </>
          ) : (
            <>
              <Text style={[styles.name, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1}>
                {fullName || '—'}
              </Text>
              {!!contact && (
                <View style={styles.contactRow}>
                  <Text style={[styles.contact, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={1}>
                    {contact}
                  </Text>
                  {contactVerified && <BadgeCheck size={ms(14)} color={palette.emerald} strokeWidth={2.2} />}
                </View>
              )}
              {!!memberSince && (
                <Text style={[styles.memberSince, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
                  {memberSince}
                </Text>
              )}
            </>
          )}
        </View>

        <Pressable
          onPress={onEdit}
          disabled={isLoading}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('profile.editProfile')}
          style={({ pressed }) => [
            styles.editBtn,
            { backgroundColor: theme.primaryBg, borderColor: `${theme.primary}33` },
            pressed && styles.pressed,
          ]}
        >
          <Pencil size={ms(13)} color={theme.primary} strokeWidth={2.4} />
          <Text style={[styles.editText, { color: theme.primary, fontFamily: fonts.semibold }]} numberOfLines={1}>
            {t('profile.edit')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default memo(ProfileHeader);

const AVATAR = ms(64);
const RING = ms(2.5);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: hp(14),
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(14),
    padding: wp(16),
  },
  avatarRing: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    padding: RING,
  },
  avatarInner: {
    flex: 1,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: FS.xl, letterSpacing: 0.5 },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontSize: FS.xl, letterSpacing: -0.3, textAlign: 'left' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: wp(4), marginTop: hp(2) },
  contact: { fontSize: FS.sm, flexShrink: 1, textAlign: 'left' },
  memberSince: { fontSize: FS.xs, marginTop: hp(3), textAlign: 'left' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(5),
    height: ms(34),
    paddingHorizontal: wp(12),
    borderRadius: ms(17),
    borderWidth: 1,
  },
  editText: { fontSize: FS.xs },
  pressed: { opacity: 0.7 },
});
