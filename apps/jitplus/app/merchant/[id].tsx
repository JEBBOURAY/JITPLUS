import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Share,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { MapPin, ArrowLeft, Info, Gift, Coins, Navigation, Star, Share2, Instagram, Globe, Eye, Users, CreditCard, Check, Store } from 'lucide-react-native';
import { haptic } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Skeleton from '@/components/Skeleton';
import { getCategoryEmoji } from '@/utils/categories';
import { useMerchantById } from '@/hooks/useQueryHooks';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { wp, hp, ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';

const HERO_HEIGHT = hp(260);

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const isCompact = screenHeight < 780;
  const isVeryCompact = screenHeight < 710;
  const heroHeight = isVeryCompact ? hp(220) : isCompact ? hp(238) : HERO_HEIGHT;

  // All hooks MUST be called before any conditional return (Rules of Hooks)
  const { data: merchant, isLoading: loading } = useMerchantById(id, isAuthenticated);
  const queryClient = useQueryClient();
  const [joinLoading, setJoinLoading] = useState(false);
  const [justJoined, setJustJoined] = useState(false);



  const handleJoinMerchant = useCallback(async () => {
    if (!id || joinLoading || merchant?.hasCard || justJoined) return;
    setJoinLoading(true);
    try {
      await api.joinMerchant(id);
      setJustJoined(true);
      haptic();
      // Refresh merchant data and points overview
      queryClient.invalidateQueries({ queryKey: ['merchant', id] });
      queryClient.invalidateQueries({ queryKey: ['points'] });
    } catch (e) {
      if (__DEV__) console.warn('Join merchant error:', e);
    } finally {
      setJoinLoading(false);
    }
  }, [id, joinLoading, merchant?.hasCard, justJoined, queryClient]);

  // Auth guard — redirect unauthenticated deep-links to welcome
  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <Skeleton width={wp(80)} height={hp(30)} borderRadius={ms(18)} />
          <Skeleton width={ms(92)} height={ms(92)} borderRadius={ms(46)} />
          <Skeleton width={wp(200)} height={hp(24)} borderRadius={ms(8)} />
          <Skeleton width={wp(120)} height={hp(18)} borderRadius={ms(9)} />
          <View style={styles.loadingGrid}>
            <Skeleton width="48%" height={hp(100)} borderRadius={ms(18)} />
            <Skeleton width="48%" height={hp(100)} borderRadius={ms(18)} />
          </View>
          <Skeleton width="100%" height={hp(90)} borderRadius={ms(18)} />
          <Skeleton width="100%" height={hp(54)} borderRadius={ms(16)} />
        </View>
      </SafeAreaView>
    );
  }

  if (!merchant) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.bg }]}>
        <View style={[styles.errorIcon, { backgroundColor: theme.primaryBg }]}>
          <Info size={32} color={theme.textMuted} />
        </View>
        <Text style={[styles.errorTitle, { color: theme.text }]}>{t('merchant.notFound')}</Text>
        <Text style={[styles.errorText, { color: theme.textMuted }]}>
          {t('merchant.notFoundDesc')}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.errorButton, { backgroundColor: theme.primary }]}
        >
          <Text style={styles.errorButtonText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#1F1631', '#3A1C71', '#B57A1A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.hero,
          {
            height: heroHeight,
            paddingHorizontal: isVeryCompact ? wp(16) : wp(20),
            borderBottomLeftRadius: isVeryCompact ? ms(22) : ms(28),
            borderBottomRightRadius: isVeryCompact ? ms(22) : ms(28),
          },
        ]}
      >
        <View style={styles.heroTopRow}>
          <Pressable
            onPress={() => {
              haptic();
              router.back();
            }}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
          >
            <ArrowLeft size={isVeryCompact ? 18 : 20} color="#fff" strokeWidth={1.7} />
          </Pressable>

          <Pressable
            onPress={async () => {
              haptic();
              try {
                await Share.share({
                  message: `${t('merchant.shareText', { name: merchant.nomBoutique })}\nhttps://play.google.com/store/apps/details?id=com.jitplus.client`,
                });
              } catch {
                // user cancelled
              }
            }}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t('merchant.shareApp')}
            hitSlop={8}
          >
            <Share2 size={isVeryCompact ? 16 : 18} color="#fff" strokeWidth={1.7} />
          </Pressable>
        </View>

        <View style={styles.heroCenter}>
          {merchant.logoUrl ? (
            <Image
              source={resolveImageUrl(merchant.logoUrl)}
              style={[
                styles.heroLogo,
                {
                  width: isVeryCompact ? ms(72) : ms(86),
                  height: isVeryCompact ? ms(72) : ms(86),
                  borderRadius: isVeryCompact ? ms(36) : ms(43),
                  marginBottom: isVeryCompact ? hp(6) : hp(10),
                },
              ]}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View
              style={[
                styles.heroEmojiWrap,
                {
                  width: isVeryCompact ? ms(72) : ms(86),
                  height: isVeryCompact ? ms(72) : ms(86),
                  borderRadius: isVeryCompact ? ms(36) : ms(43),
                  marginBottom: isVeryCompact ? hp(6) : hp(10),
                },
              ]}
            >
              <Text style={[styles.heroEmoji, { fontSize: isVeryCompact ? ms(34) : ms(42) }]}>{getCategoryEmoji(merchant.categorie)}</Text>
            </View>
          )}

          <Text style={[styles.heroName, { fontSize: isVeryCompact ? ms(21) : ms(25), marginBottom: isVeryCompact ? hp(4) : hp(6) }]} numberOfLines={1}>
            {merchant.nomBoutique}
          </Text>
          <View style={[styles.heroCategoryBadge, { marginBottom: isVeryCompact ? hp(6) : hp(10), paddingVertical: isVeryCompact ? hp(4) : hp(5) }]}>
            <Text style={[styles.heroCategoryText, { fontSize: isVeryCompact ? ms(11) : ms(12) }]} numberOfLines={1}>{merchant.categorie}</Text>
          </View>

          <View style={[styles.heroStatsRow, { gap: isVeryCompact ? wp(8) : wp(10) }]}>
            <View style={[styles.heroStatChip, { paddingHorizontal: isVeryCompact ? wp(10) : wp(12), paddingVertical: isVeryCompact ? hp(5) : hp(6) }]}>
              <Eye size={isVeryCompact ? 12 : 13} color="#E9D5FF" strokeWidth={1.7} />
              <Text style={[styles.heroStatValue, { fontSize: isVeryCompact ? ms(11) : ms(12) }]}>{(merchant.profileViews ?? 0).toLocaleString('fr-MA')}</Text>
            </View>
            <View style={[styles.heroStatChip, { paddingHorizontal: isVeryCompact ? wp(10) : wp(12), paddingVertical: isVeryCompact ? hp(5) : hp(6) }]}>
              <Users size={isVeryCompact ? 12 : 13} color="#E9D5FF" strokeWidth={1.7} />
              <Text style={[styles.heroStatValue, { fontSize: isVeryCompact ? ms(11) : ms(12) }]}>{(merchant.clientCount ?? 0).toLocaleString('fr-MA')}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View
        style={[
          styles.body,
          {
            backgroundColor: theme.bg,
            marginTop: isVeryCompact ? -hp(10) : -hp(16),
            borderTopLeftRadius: isVeryCompact ? ms(22) : ms(28),
            borderTopRightRadius: isVeryCompact ? ms(22) : ms(28),
            paddingHorizontal: isVeryCompact ? wp(12) : wp(16),
            paddingTop: isVeryCompact ? hp(10) : hp(16),
            paddingBottom: isVeryCompact ? hp(10) : hp(14),
            gap: isVeryCompact ? hp(8) : hp(12),
          },
        ]}
      >
        <View style={styles.gridRow}>
          <View style={[styles.premiumCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, minHeight: isVeryCompact ? hp(98) : isCompact ? hp(106) : hp(118), padding: isVeryCompact ? wp(10) : wp(12) }]}> 
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}18` }]}>
                {merchant.loyaltyType === 'STAMPS' ? (
                  <Gift size={18} color={palette.violet} strokeWidth={1.8} />
                ) : (
                  <Coins size={18} color={palette.violet} strokeWidth={1.8} />
                )}
              </View>
              <Text style={[styles.cardTitle, { color: theme.textSecondary, fontSize: isVeryCompact ? ms(10) : ms(11) }]} numberOfLines={1}>{t('merchant.loyaltyProgram')}</Text>
            </View>
            <Text style={[styles.cardMainValue, { color: theme.text, fontSize: isVeryCompact ? ms(12.5) : ms(14), lineHeight: isVeryCompact ? ms(17) : ms(20) }]} numberOfLines={1}>
              {merchant.loyaltyType === 'STAMPS' ? t('merchant.stampCard') : t('merchant.pointsAccumulation')}
            </Text>
            <Text style={[styles.cardSubValue, { color: theme.textMuted, fontSize: isVeryCompact ? ms(10.5) : ms(12), lineHeight: isVeryCompact ? ms(15) : ms(17) }]} numberOfLines={2}>
              {merchant.loyaltyType === 'STAMPS'
                ? t('merchant.stampRule', { count: merchant.stampsForReward || 10 })
                : t('merchant.pointsRule', { rate: merchant.conversionRate || 10 })}
            </Text>
          </View>

          <View style={[styles.premiumCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, minHeight: isVeryCompact ? hp(98) : isCompact ? hp(106) : hp(118), padding: isVeryCompact ? wp(10) : wp(12) }]}> 
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardIconBadge, { backgroundColor: `${palette.gold}22` }]}>
                <MapPin size={18} color={palette.gold} strokeWidth={1.8} />
              </View>
              <Text style={[styles.cardTitle, { color: theme.textSecondary, fontSize: isVeryCompact ? ms(10) : ms(11) }]} numberOfLines={1}>{t('merchant.info')}</Text>
            </View>
            <Text style={[styles.cardMainValue, { color: theme.text, fontSize: isVeryCompact ? ms(12.5) : ms(14), lineHeight: isVeryCompact ? ms(17) : ms(20) }]} numberOfLines={2}>
              {merchant.adresse || merchant.ville || t('discover.positionAvailable')}
            </Text>
            <View style={styles.metaLine}>
              <Store size={12} color={theme.textMuted} strokeWidth={1.7} />
              <Text style={[styles.metaText, { color: theme.textMuted, fontSize: isVeryCompact ? ms(10.5) : ms(11) }]} numberOfLines={1}>
                {merchant.stores?.length ? `${merchant.stores.length} ${t('merchant.stores')}` : t('merchant.seeOnMap')}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.rewardHighlight, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, minHeight: isVeryCompact ? hp(72) : hp(86), padding: isVeryCompact ? wp(10) : wp(12) }]}>
          <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}18` }]}>
            <Star size={18} color={palette.violet} strokeWidth={1.8} />
          </View>
          <View style={styles.rewardTextWrap}>
            <Text style={[styles.cardTitle, { color: theme.textSecondary, fontSize: isVeryCompact ? ms(10) : ms(11) }]}>{t('merchant.rewardsSection')}</Text>
            <Text style={[styles.rewardMain, { color: theme.text, fontSize: isVeryCompact ? ms(13) : ms(15) }]} numberOfLines={1}>
              {merchant.rewards?.[0]?.titre || t('merchant.noRewards')}
            </Text>
            {!!merchant.rewards?.[0] && (
              <Text style={[styles.rewardCost, { color: palette.violet, fontSize: isVeryCompact ? ms(11) : ms(12) }]} numberOfLines={1}>
                {merchant.loyaltyType === 'STAMPS'
                  ? t('merchant.stampsCost', { count: merchant.rewards[0].cout })
                  : t('merchant.pointsCost', { count: merchant.rewards[0].cout.toLocaleString('fr-MA') })}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.quickActionsRow, { gap: isVeryCompact ? wp(8) : wp(10) }]}>
          <Pressable
            onPress={() => {
              haptic();
              router.push({ pathname: '/(tabs)/discover', params: { focusMerchantId: merchant.id } });
            }}
            style={({ pressed }) => [styles.quickActionBtn, { backgroundColor: `${palette.violet}16`, borderColor: `${palette.violet}30`, minHeight: isVeryCompact ? hp(40) : hp(46), opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('merchant.seeOnMap')}
          >
            <Navigation size={isVeryCompact ? 14 : 16} color={palette.violet} strokeWidth={1.8} />
            <Text style={[styles.quickActionText, { color: palette.violet, fontSize: isVeryCompact ? ms(11) : ms(12) }]}>{t('merchant.seeOnMap')}</Text>
          </Pressable>

          {!!(merchant.socialLinks?.instagram || merchant.socialLinks?.tiktok) && (
            <Pressable
              onPress={async () => {
                haptic();
                const instagram = merchant.socialLinks?.instagram?.replace(/^@/, '');
                const tiktok = merchant.socialLinks?.tiktok?.replace(/^@/, '');
                if (instagram && /^[a-zA-Z0-9_.]{1,30}$/.test(instagram)) {
                  const appUrl = `instagram://user?username=${encodeURIComponent(instagram)}`;
                  const webUrl = `https://www.instagram.com/${encodeURIComponent(instagram)}`;
                  const canOpen = await Linking.canOpenURL(appUrl);
                  Linking.openURL(canOpen ? appUrl : webUrl);
                  return;
                }
                if (tiktok && /^[a-zA-Z0-9_.]{1,30}$/.test(tiktok)) {
                  Linking.openURL(`https://www.tiktok.com/@${encodeURIComponent(tiktok)}`);
                }
              }}
              style={({ pressed }) => [styles.quickActionBtn, { backgroundColor: `${palette.gold}14`, borderColor: `${palette.gold}36`, minHeight: isVeryCompact ? hp(40) : hp(46), opacity: pressed ? 0.8 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('merchant.socialLinks')}
            >
              {merchant.socialLinks?.instagram ? (
                <Instagram size={isVeryCompact ? 14 : 16} color={palette.gold} strokeWidth={1.8} />
              ) : (
                <Globe size={isVeryCompact ? 14 : 16} color={palette.gold} strokeWidth={1.8} />
              )}
              <Text style={[styles.quickActionText, { color: palette.gold, fontSize: isVeryCompact ? ms(11) : ms(12) }]}>{t('merchant.socialLinks')}</Text>
            </Pressable>
          )}
        </View>

        {(merchant.hasCard || justJoined) ? (
          <View style={[styles.joinButtonDone, { backgroundColor: `${palette.emerald}15`, borderColor: `${palette.emerald}34`, paddingVertical: isVeryCompact ? hp(10) : hp(13) }]}>
            <Check size={isVeryCompact ? 18 : 20} color={palette.emerald} strokeWidth={1.8} />
            <Text style={[styles.joinButtonDoneText, { color: palette.emerald, fontSize: isVeryCompact ? ms(13) : ms(15) }]}>{t('merchant.alreadyMember')}</Text>
          </View>
        ) : (
          <Pressable
            onPress={handleJoinMerchant}
            disabled={joinLoading}
            style={({ pressed }) => [styles.joinButton, { paddingVertical: isVeryCompact ? hp(11) : hp(14), opacity: pressed || joinLoading ? 0.75 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('merchant.getLoyaltyCard')}
          >
            {joinLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <CreditCard size={isVeryCompact ? 18 : 20} color="#fff" strokeWidth={1.8} />
            )}
            <Text style={[styles.joinButtonText, { fontSize: isVeryCompact ? ms(13) : ms(14) }]} numberOfLines={1}>{t('merchant.getLoyaltyCard')}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, paddingHorizontal: wp(20), paddingTop: hp(24), gap: hp(14) },
  loadingGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: wp(40) },
  errorIcon: { width: ms(72), height: ms(72), borderRadius: ms(36), alignItems: 'center', justifyContent: 'center', marginBottom: hp(20) },
  errorTitle: { fontSize: ms(22), fontWeight: '700', marginBottom: hp(8) },
  errorText: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(22), marginBottom: hp(24) },
  errorButton: { paddingHorizontal: wp(24), paddingVertical: hp(12), borderRadius: ms(14) },
  errorButtonText: { color: '#fff', fontSize: ms(15), fontWeight: '700' },
  hero: {
    height: HERO_HEIGHT,
    paddingHorizontal: wp(20),
    paddingTop: hp(8),
    borderBottomLeftRadius: ms(28),
    borderBottomRightRadius: ms(28),
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: hp(4),
  },
  iconButton: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginBottom: hp(8),
  },
  heroLogo: {
    width: ms(86),
    height: ms(86),
    borderRadius: ms(43),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    marginBottom: hp(10),
  },
  heroEmojiWrap: {
    width: ms(86),
    height: ms(86),
    borderRadius: ms(43),
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(10),
  },
  heroEmoji: { fontSize: ms(42) },
  heroName: {
    color: '#fff',
    fontSize: ms(25),
    fontWeight: '800',
    letterSpacing: -0.4,
    maxWidth: '92%',
    marginBottom: hp(6),
  },
  heroCategoryBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: wp(12),
    paddingVertical: hp(5),
    borderRadius: ms(12),
    marginBottom: hp(10),
  },
  heroCategoryText: {
    color: '#FDF4FF',
    fontSize: ms(12),
    fontWeight: '700',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: wp(10),
  },
  heroStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    backgroundColor: 'rgba(9,5,22,0.28)',
    borderColor: 'rgba(233,213,255,0.28)',
    borderWidth: 1,
    borderRadius: ms(999),
    paddingHorizontal: wp(12),
    paddingVertical: hp(6),
  },
  heroStatValue: {
    color: '#F3E8FF',
    fontSize: ms(12),
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: wp(24),
    paddingTop: hp(24),
    paddingBottom: hp(60),
  },
  body: {
    flex: 1,
    marginTop: -hp(16),
    borderTopLeftRadius: ms(28),
    borderTopRightRadius: ms(28),
    paddingHorizontal: wp(16),
    paddingTop: hp(16),
    paddingBottom: hp(14),
    gap: hp(12),
  },
  gridRow: {
    flexDirection: 'row' as const,
    gap: wp(10),
  },
  premiumCard: {
    flex: 1,
    borderRadius: ms(18),
    borderWidth: 1,
    padding: wp(12),
    minHeight: hp(118),
    shadowColor: '#1f1631',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(8),
  },
  cardIconBadge: {
    width: ms(30),
    height: ms(30),
    borderRadius: ms(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: ms(11),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    flex: 1,
  },
  cardMainValue: {
    fontSize: ms(14),
    fontWeight: '700',
    lineHeight: ms(20),
    marginBottom: hp(5),
  },
  cardSubValue: {
    fontSize: ms(12),
    fontWeight: '500',
    lineHeight: ms(17),
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    marginTop: 'auto',
  },
  metaText: {
    fontSize: ms(11),
    fontWeight: '600',
    flex: 1,
  },
  rewardHighlight: {
    borderRadius: ms(18),
    borderWidth: 1,
    padding: wp(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    minHeight: hp(86),
  },
  rewardTextWrap: { flex: 1 },
  rewardMain: {
    fontSize: ms(15),
    fontWeight: '700',
    marginTop: hp(2),
    marginBottom: hp(2),
  },
  rewardCost: {
    fontSize: ms(12),
    fontWeight: '700',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: wp(10),
  },
  quickActionBtn: {
    flex: 1,
    borderRadius: ms(14),
    borderWidth: 1,
    minHeight: hp(46),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
  },
  quickActionText: {
    fontSize: ms(12),
    fontWeight: '700',
  },

  joinButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(10),
    marginTop: 'auto',
    paddingVertical: hp(14),
    borderRadius: ms(18),
    backgroundColor: '#2E1960',
    borderWidth: 1,
    borderColor: '#5B2FB3',
    shadowColor: '#2E1960',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: ms(14),
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  joinButtonDone: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(10),
    marginTop: 'auto',
    paddingVertical: hp(13),
    borderRadius: ms(16),
    borderWidth: 1.5,
  },
  joinButtonDoneText: {
    fontSize: ms(15),
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
});
