import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Share,
  Linking,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { MapPin, ArrowLeft, Info, Gift, Coins, Navigation, Star, Share2, Instagram, Globe, Eye, Users, CreditCard, Check, Store, Music } from 'lucide-react-native';
import { haptic } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import Skeleton from '@/components/Skeleton';
import { getCategoryEmoji } from '@/utils/categories';
import { useMerchantById } from '@/hooks/useQueryHooks';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { wp, hp, ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const { data: merchant, isLoading: loading } = useMerchantById(id, isAuthenticated);
  const queryClient = useQueryClient();
  const [joinLoading, setJoinLoading] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const handleJoinMerchant = useCallback(async () => {
    if (!id || joinLoading || merchant?.hasCard || justJoined) return;
    setJoinLoading(true);
    try {
      await api.joinMerchant(id);
      setJustJoined(true);
      haptic();
      queryClient.invalidateQueries({ queryKey: ['merchant', id] });
      queryClient.invalidateQueries({ queryKey: ['points'] });
    } catch (e) {
      if (__DEV__) console.warn('Join merchant error:', e);
    } finally {
      setJoinLoading(false);
    }
  }, [id, joinLoading, merchant?.hasCard, justJoined, queryClient]);

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgCard }]} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <Skeleton width={wp(80)} height={hp(30)} borderRadius={ms(18)} />
          <Skeleton width={ms(80)} height={ms(80)} borderRadius={ms(40)} />
          <Skeleton width={wp(200)} height={hp(24)} borderRadius={ms(8)} />
          <Skeleton width={wp(120)} height={hp(18)} borderRadius={ms(9)} />
          <View style={styles.loadingGrid}>
            <Skeleton width="48%" height={hp(100)} borderRadius={ms(16)} />
            <Skeleton width="48%" height={hp(100)} borderRadius={ms(16)} />
          </View>
          <Skeleton width="100%" height={hp(80)} borderRadius={ms(16)} />
          <Skeleton width="100%" height={hp(50)} borderRadius={ms(14)} />
        </View>
      </SafeAreaView>
    );
  }

  if (!merchant) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgCard }]} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <View style={[styles.errorIcon, { backgroundColor: theme.borderLight }]}>
            <Info size={28} color={theme.textMuted} />
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgCard }]} edges={['top', 'bottom']}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => { haptic(); router.back(); }}
          style={[styles.headerBtn, { borderColor: theme.borderLight }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={8}
        >
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.7} />
        </Pressable>
        <Pressable
          onPress={async () => {
            haptic();
            try {
              await Share.share({
                message: `${t('merchant.shareText', { name: merchant.nomBoutique })}\nhttps://play.google.com/store/apps/details?id=com.jitplus.client`,
              });
            } catch { /* user cancelled */ }
          }}
          style={[styles.headerBtn, { borderColor: theme.borderLight }]}
          accessibilityRole="button"
          accessibilityLabel={t('merchant.shareApp')}
          hitSlop={8}
        >
          <Share2 size={18} color={theme.text} strokeWidth={1.7} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Merchant identity */}
        <View style={styles.identitySection}>
          {merchant.logoUrl && !logoError ? (
            <Image
              source={resolveImageUrl(merchant.logoUrl)}
              style={[styles.logo, { borderColor: theme.borderLight }]}
              contentFit="cover"
              cachePolicy="disk"
              recyclingKey={merchant.logoUrl}
              onError={() => setLogoError(true)}
            />
          ) : (
            <View style={[styles.emojiWrap, { borderColor: theme.borderLight }]}>
              <Text style={styles.emoji}>{getCategoryEmoji(merchant.categorie)}</Text>
            </View>
          )}

          <Text style={[styles.merchantName, { color: theme.text }]} numberOfLines={1}>
            {merchant.nomBoutique}
          </Text>

          <View style={[styles.categoryBadge, { borderColor: theme.borderLight }]}>
            <Text style={[styles.categoryText, { color: theme.textSecondary }]} numberOfLines={1}>
              {merchant.categorie}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statChip, { borderColor: theme.borderLight }]}>
              <Eye size={13} color={theme.textMuted} strokeWidth={1.7} />
              <Text style={[styles.statValue, { color: theme.textSecondary }]}>
                {(merchant.profileViews ?? 0).toLocaleString('fr-MA')}
              </Text>
            </View>
            <View style={[styles.statChip, { borderColor: theme.borderLight }]}>
              <Users size={13} color={theme.textMuted} strokeWidth={1.7} />
              <Text style={[styles.statValue, { color: theme.textSecondary }]}>
                {(merchant.clientCount ?? 0).toLocaleString('fr-MA')}
              </Text>
            </View>
          </View>
        </View>

        {/* Separator */}
        <View style={[styles.separator, { backgroundColor: theme.borderLight }]} />

        {/* Info cards */}
        <View style={styles.cardsSection}>
          <View style={styles.gridRow}>
            {/* Loyalty card */}
            <View style={[styles.infoCard, { borderColor: theme.borderLight }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}12` }]}>
                  {merchant.loyaltyType === 'STAMPS' ? (
                    <Gift size={16} color={palette.violet} strokeWidth={1.8} />
                  ) : (
                    <Coins size={16} color={palette.violet} strokeWidth={1.8} />
                  )}
                </View>
                <Text style={[styles.cardLabel, { color: theme.textMuted }]} numberOfLines={1}>
                  {t('merchant.loyaltyProgram')}
                </Text>
              </View>
              <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1}>
                {merchant.loyaltyType === 'STAMPS' ? t('merchant.stampCard') : t('merchant.pointsAccumulation')}
              </Text>
              <Text style={[styles.cardSub, { color: theme.textMuted }]} numberOfLines={2}>
                {merchant.loyaltyType === 'STAMPS'
                  ? t('merchant.stampRule', { count: merchant.stampsForReward || 10 })
                  : t('merchant.pointsRule', { rate: merchant.conversionRate || 10 })}
              </Text>
            </View>

            {/* Location card */}
            <View style={[styles.infoCard, { borderColor: theme.borderLight }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardIconBadge, { backgroundColor: `${palette.gold}15` }]}>
                  <MapPin size={16} color={palette.gold} strokeWidth={1.8} />
                </View>
                <Text style={[styles.cardLabel, { color: theme.textMuted }]} numberOfLines={1}>
                  {t('merchant.info')}
                </Text>
              </View>
              <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={2}>
                {merchant.adresse || merchant.ville || t('discover.positionAvailable')}
              </Text>
              <View style={styles.metaLine}>
                <Store size={12} color={theme.textMuted} strokeWidth={1.7} />
                <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
                  {merchant.stores?.length ? `${merchant.stores.length} ${t('merchant.stores')}` : t('merchant.seeOnMap')}
                </Text>
              </View>
            </View>
          </View>

          {/* Reward highlight */}
          <View style={[styles.rewardCard, { borderColor: theme.borderLight }]}>
            <View style={[styles.cardIconBadge, { backgroundColor: `${palette.gold}15` }]}>
              <Star size={16} color={palette.gold} strokeWidth={1.8} />
            </View>
            <View style={styles.rewardTextWrap}>
              <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{t('merchant.rewardsSection')}</Text>
              <Text style={[styles.rewardMain, { color: theme.text }]} numberOfLines={1}>
                {merchant.rewards?.[0]?.titre || t('merchant.noRewards')}
              </Text>
              {!!merchant.rewards?.[0] && (
                <Text style={[styles.rewardCost, { color: theme.primary }]} numberOfLines={1}>
                  {merchant.loyaltyType === 'STAMPS'
                    ? t('merchant.stampsCost', { count: merchant.rewards[0].cout })
                    : t('merchant.pointsCost', { count: merchant.rewards[0].cout.toLocaleString('fr-MA') })}
                </Text>
              )}
            </View>
          </View>

          {/* Quick actions */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => {
                haptic();
                router.push({ pathname: '/(tabs)/discover', params: { focusMerchantId: merchant.id } });
              }}
              style={({ pressed }) => [styles.actionBtn, { borderColor: palette.violet, backgroundColor: `${palette.violet}08`, opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('merchant.seeOnMap')}
            >
              <Navigation size={16} color={palette.violet} strokeWidth={1.8} />
              <Text style={[styles.actionText, { color: palette.violet }]}>{t('merchant.seeOnMap')}</Text>
            </Pressable>

            {!!merchant.socialLinks?.instagram && (
              <Pressable
                onPress={async () => {
                  haptic();
                  const raw = merchant.socialLinks?.instagram ?? '';
                  const username = raw.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').trim();
                  if (!username) return;
                  const appUrl = `instagram://user?username=${encodeURIComponent(username)}`;
                  const webUrl = `https://www.instagram.com/${encodeURIComponent(username)}`;
                  const canOpen = await Linking.canOpenURL(appUrl);
                  Linking.openURL(canOpen ? appUrl : webUrl);
                }}
                style={({ pressed }) => [styles.actionBtn, { borderColor: '#E1306C', backgroundColor: '#E1306C10', opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Instagram"
              >
                <Instagram size={16} color="#E1306C" strokeWidth={1.8} />
                <Text style={[styles.actionText, { color: '#E1306C' }]}>Instagram</Text>
              </Pressable>
            )}

            {!!merchant.socialLinks?.tiktok && (
              <Pressable
                onPress={() => {
                  haptic();
                  const raw = merchant.socialLinks?.tiktok ?? '';
                  const username = raw.replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '').trim();
                  if (!username) return;
                  Linking.openURL(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
                }}
                style={({ pressed }) => [styles.actionBtn, { borderColor: '#010101', backgroundColor: '#01010108', opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="TikTok"
              >
                <Music size={16} color="#010101" strokeWidth={1.8} />
                <Text style={[styles.actionText, { color: '#010101' }]}>TikTok</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky join button at bottom */}
      <View style={styles.bottomBar}>
        {(merchant.hasCard || justJoined) ? (
          <View style={[styles.joinedBanner, { borderColor: theme.borderLight }]}>
            <Check size={18} color={palette.emerald} strokeWidth={1.8} />
            <Text style={[styles.joinedText, { color: palette.emerald }]}>{t('merchant.alreadyMember')}</Text>
          </View>
        ) : (
          <Pressable
            onPress={handleJoinMerchant}
            disabled={joinLoading}
            style={({ pressed }) => [styles.joinBtn, { backgroundColor: theme.primary, opacity: pressed || joinLoading ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('merchant.getLoyaltyCard')}
          >
            {joinLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <CreditCard size={18} color="#fff" strokeWidth={1.8} />
            )}
            <Text style={styles.joinBtnText} numberOfLines={1}>{t('merchant.getLoyaltyCard')}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Loading
  loadingWrap: { flex: 1, paddingHorizontal: wp(20), paddingTop: hp(24), gap: hp(14), alignItems: 'center' },
  loadingGrid: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },

  // Error
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: wp(40) },
  errorIcon: { width: ms(64), height: ms(64), borderRadius: ms(32), alignItems: 'center', justifyContent: 'center', marginBottom: hp(16) },
  errorTitle: { fontSize: ms(20), fontWeight: '700', marginBottom: hp(8) },
  errorText: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(22), marginBottom: hp(24) },
  errorButton: { paddingHorizontal: wp(24), paddingVertical: hp(12), borderRadius: ms(14) },
  errorButtonText: { color: '#fff', fontSize: ms(15), fontWeight: '700' },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: wp(16),
    paddingTop: hp(6),
    paddingBottom: hp(4),
  },
  headerBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: wp(16),
    paddingBottom: hp(16),
  },

  // Identity section
  identitySection: {
    alignItems: 'center',
    paddingTop: hp(8),
    paddingBottom: hp(16),
  },
  logo: {
    width: ms(80),
    height: ms(80),
    borderRadius: ms(40),
    borderWidth: 1.5,
    marginBottom: hp(12),
  },
  emojiWrap: {
    width: ms(80),
    height: ms(80),
    borderRadius: ms(40),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(12),
  },
  emoji: { fontSize: ms(36) },
  merchantName: {
    fontSize: ms(24),
    fontWeight: '800',
    letterSpacing: -0.4,
    maxWidth: '92%',
    marginBottom: hp(6),
    textAlign: 'center',
  },
  categoryBadge: {
    paddingHorizontal: wp(12),
    paddingVertical: hp(4),
    borderRadius: ms(10),
    borderWidth: 1,
    marginBottom: hp(12),
  },
  categoryText: {
    fontSize: ms(12),
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: wp(10),
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(5),
    borderWidth: 1,
    borderRadius: ms(999),
    paddingHorizontal: wp(12),
    paddingVertical: hp(5),
  },
  statValue: {
    fontSize: ms(12),
    fontWeight: '700',
  },

  // Separator
  separator: {
    height: 1,
    marginBottom: hp(14),
  },

  // Cards section
  cardsSection: {
    gap: hp(10),
  },
  gridRow: {
    flexDirection: 'row' as const,
    gap: wp(10),
  },
  infoCard: {
    flex: 1,
    borderRadius: ms(16),
    borderWidth: 1,
    padding: wp(12),
    minHeight: hp(110),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(8),
  },
  cardIconBadge: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: ms(10),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flex: 1,
  },
  cardValue: {
    fontSize: ms(13),
    fontWeight: '700',
    lineHeight: ms(19),
    marginBottom: hp(4),
  },
  cardSub: {
    fontSize: ms(11),
    fontWeight: '500',
    lineHeight: ms(16),
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(5),
    marginTop: 'auto',
  },
  metaText: {
    fontSize: ms(11),
    fontWeight: '600',
    flex: 1,
  },

  // Reward card
  rewardCard: {
    borderRadius: ms(16),
    borderWidth: 1,
    padding: wp(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    minHeight: hp(76),
  },
  rewardTextWrap: { flex: 1 },
  rewardMain: {
    fontSize: ms(14),
    fontWeight: '700',
    marginTop: hp(2),
    marginBottom: hp(2),
  },
  rewardCost: {
    fontSize: ms(12),
    fontWeight: '700',
  },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(10),
  },
  actionBtn: {
    flex: 1,
    borderRadius: ms(14),
    borderWidth: 1,
    minHeight: hp(44),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
  },
  actionText: {
    fontSize: ms(12),
    fontWeight: '600',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: wp(16),
    paddingVertical: hp(10),
  },
  joinBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(10),
    paddingVertical: hp(14),
    borderRadius: ms(16),
  },
  joinBtnText: {
    color: '#fff',
    fontSize: ms(14),
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  joinedBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(8),
    paddingVertical: hp(12),
    borderRadius: ms(14),
    borderWidth: 1,
  },
  joinedText: {
    fontSize: ms(14),
    fontWeight: '700' as const,
  },
});
