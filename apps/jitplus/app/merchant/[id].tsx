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
  Alert,
  Platform,
  Image as RNImage,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { MapPin, ArrowLeft, Info, Gift, Coins, Navigation, Star, Share2, Instagram, Eye, Users, CreditCard, Check, Store, Music, XCircle, ChevronRight } from 'lucide-react-native';
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
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [justLeft, setJustLeft] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const handleJoinMerchant = useCallback(async () => {
    if (!id || joinLoading || merchant?.hasCard || justJoined) return;
    setJoinLoading(true);
    try {
      await api.joinMerchant(id);
      setJustJoined(true);
      setJustLeft(false);
      haptic();
      queryClient.invalidateQueries({ queryKey: ['merchant', id] });
      queryClient.invalidateQueries({ queryKey: ['points'] });
    } catch (e) {
      if (__DEV__) console.warn('Join merchant error:', e);
    } finally {
      setJoinLoading(false);
    }
  }, [id, joinLoading, merchant?.hasCard, justJoined, queryClient]);

  const handleLeaveMerchant = useCallback(() => {
    if (!id || !merchant || leaveLoading) return;

    const balanceLabel = merchant.loyaltyType === 'STAMPS'
      ? t('merchant.leaveStampsWarning', { count: merchant.cardBalance ?? 0 })
      : t('merchant.leavePointsWarning', { count: merchant.cardBalance ?? 0 });

    Alert.alert(
      t('merchant.leaveTitle'),
      `${balanceLabel}\n\n${t('merchant.leaveMessage')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('merchant.leaveConfirm'),
          style: 'destructive',
          onPress: async () => {
            setLeaveLoading(true);
            try {
              await api.leaveMerchant(id);
              setJustLeft(true);
              setJustJoined(false);
              haptic();
              queryClient.invalidateQueries({ queryKey: ['merchant', id] });
              queryClient.invalidateQueries({ queryKey: ['points'] });
            } catch (e) {
              if (__DEV__) console.warn('Leave merchant error:', e);
            } finally {
              setLeaveLoading(false);
            }
          },
        },
      ],
    );
  }, [id, merchant, leaveLoading, queryClient, t]);

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
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* ── Hero section: Cover + overlay header + logo ── */}
        <View style={styles.heroSection}>
          {merchant.coverUrl && !coverError ? (
            <Image
              source={resolveImageUrl(merchant.coverUrl)}
              style={styles.coverImage}
              contentFit="cover"
              cachePolicy="disk"
              recyclingKey={merchant.coverUrl}
              onError={() => setCoverError(true)}
            />
          ) : (
            <LinearGradient
              colors={[`${palette.violet}18`, `${palette.violet}08`, theme.bg]}
              style={styles.coverImage}
            />
          )}
          {/* Gradient fade at bottom of cover */}
          <LinearGradient
            colors={['transparent', theme.bg]}
            style={styles.coverFade}
          />

          {/* Floating header buttons */}
          <SafeAreaView edges={['top']} style={styles.floatingHeader}>
            <Pressable
              onPress={() => { haptic(); router.back(); }}
              style={[styles.floatingBtn, { backgroundColor: 'rgba(255,255,255,0.85)' }]}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={8}
            >
              <ArrowLeft size={20} color={palette.gray900} strokeWidth={1.8} />
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
              style={[styles.floatingBtn, { backgroundColor: 'rgba(255,255,255,0.85)' }]}
              accessibilityRole="button"
              accessibilityLabel={t('merchant.shareApp')}
              hitSlop={8}
            >
              <Share2 size={18} color={palette.gray900} strokeWidth={1.8} />
            </Pressable>
          </SafeAreaView>

          {/* Logo overlapping cover */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoRing, { backgroundColor: theme.bg }]}>
              {merchant.logoUrl && !logoError ? (
                <Image
                  source={resolveImageUrl(merchant.logoUrl)}
                  style={styles.logo}
                  contentFit="cover"
                  cachePolicy="disk"
                  recyclingKey={merchant.logoUrl}
                  onError={() => setLogoError(true)}
                />
              ) : (
                <View style={[styles.emojiWrap, { backgroundColor: `${palette.violet}10` }]}>
                  <Text style={styles.emoji}>{getCategoryEmoji(merchant.categorie)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Identity ── */}
        <View style={styles.identitySection}>
          <Text style={[styles.merchantName, { color: theme.text }]} numberOfLines={2}>
            {merchant.nomBoutique}
          </Text>

          <View style={[styles.categoryBadge, { backgroundColor: `${palette.violet}10` }]}>
            <Text style={[styles.categoryText, { color: palette.violet }]} numberOfLines={1}>
              {getCategoryEmoji(merchant.categorie)} {merchant.categorie}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: theme.bgCard }]}>
              <Eye size={14} color={palette.violet} strokeWidth={1.8} />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {(merchant.profileViews ?? 0).toLocaleString('fr-MA')}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('merchant.views')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.statChip, { backgroundColor: theme.bgCard }]}>
              <Users size={14} color={palette.violet} strokeWidth={1.8} />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {(merchant.clientCount ?? 0).toLocaleString('fr-MA')}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('merchant.clients')}</Text>
            </View>
          </View>
        </View>

        {/* ── Content area ── */}
        <View style={styles.contentArea}>
          {/* Description */}
          {!!merchant.description && (
            <View style={[styles.descriptionCard, { backgroundColor: theme.bgCard }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {t('merchant.aboutUs')}
              </Text>
              <Text style={[styles.descriptionText, { color: theme.textSecondary }]}>
                {merchant.description}
              </Text>
            </View>
          )}

          {/* Loyalty & Location cards */}
          <View style={styles.gridRow}>
            {/* Loyalty card */}
            <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
              <LinearGradient
                colors={[`${palette.violet}12`, 'transparent']}
                style={styles.infoCardGradient}
              />
              <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}15` }]}>
                {merchant.loyaltyType === 'STAMPS' ? (
                  <Gift size={18} color={palette.violet} strokeWidth={1.8} />
                ) : (
                  <Coins size={18} color={palette.violet} strokeWidth={1.8} />
                )}
              </View>
              <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
                {t('merchant.loyaltyProgram')}
              </Text>
              <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1}>
                {merchant.loyaltyType === 'STAMPS' ? t('merchant.stampCard') : t('merchant.pointsAccumulation')}
              </Text>
              <Text style={[styles.cardSub, { color: theme.textMuted }]} numberOfLines={2}>
                {merchant.loyaltyType === 'STAMPS'
                  ? t('merchant.stampRule', { count: merchant.rewards?.[0]?.cout || 10 })
                  : t('merchant.pointsRule', { rate: merchant.conversionRate || 10 })}
              </Text>
            </View>

            {/* Location card */}
            <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
              <LinearGradient
                colors={[`${palette.gold}10`, 'transparent']}
                style={styles.infoCardGradient}
              />
              <View style={[styles.cardIconBadge, { backgroundColor: `${palette.gold}15` }]}>
                <MapPin size={18} color={palette.gold} strokeWidth={1.8} />
              </View>
              <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
                {t('merchant.info')}
              </Text>
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
          <View style={[styles.rewardCard, { backgroundColor: theme.bgCard }]}>
            <View style={styles.rewardAccent} />
            <View style={[styles.cardIconBadge, { backgroundColor: `${palette.gold}15` }]}>
              <Star size={18} color={palette.gold} strokeWidth={1.8} />
            </View>
            <View style={styles.rewardTextWrap}>
              <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{t('merchant.rewardsSection')}</Text>
              <Text style={[styles.rewardMain, { color: theme.text }]} numberOfLines={1}>
                {merchant.rewards?.[0]?.titre || t('merchant.noRewards')}
              </Text>
              {!!merchant.rewards?.[0] && (
                <View style={[styles.rewardCostBadge, { backgroundColor: `${palette.violet}12` }]}>
                  <Text style={[styles.rewardCost, { color: palette.violet }]} numberOfLines={1}>
                    {merchant.loyaltyType === 'STAMPS'
                      ? t('merchant.stampsCost', { count: merchant.rewards[0].cout })
                      : t('merchant.pointsCost', { count: merchant.rewards[0].cout.toLocaleString('fr-MA') })}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Social links */}
          {(!!merchant.socialLinks?.instagram || !!merchant.socialLinks?.tiktok) && (
            <View style={styles.socialRow}>
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
                  style={({ pressed }) => [styles.socialBtn, { backgroundColor: '#E1306C10', opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Instagram"
                >
                  <Instagram size={18} color="#E1306C" strokeWidth={1.8} />
                  <Text style={[styles.socialText, { color: '#E1306C' }]}>Instagram</Text>
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
                  style={({ pressed }) => [styles.socialBtn, { backgroundColor: `${palette.gray900}06`, opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="TikTok"
                >
                  <Music size={18} color={palette.gray900} strokeWidth={1.8} />
                  <Text style={[styles.socialText, { color: palette.gray900 }]}>TikTok</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Other locations / multi-store section */}
          {merchant.stores && merchant.stores.length > 1 && (
            <View style={[styles.otherLocationsCard, { backgroundColor: theme.bgCard }]}>
              <View style={styles.otherLocationsHeader}>
                <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}12` }]}>
                  <Store size={18} color={palette.violet} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>{t('merchant.otherLocationsTitle')}</Text>
                  <Text style={[styles.otherLocationsCount, { color: theme.textMuted }]}>
                    {t('merchant.otherLocationsCount', { count: merchant.stores.length })}
                  </Text>
                </View>
              </View>
              {merchant.stores.map((store, idx) => (
                <Pressable
                  key={store.id}
                  onPress={() => {
                    haptic();
                    if (store.latitude != null && store.longitude != null) {
                      router.push({ pathname: '/(tabs)/discover', params: { focusMerchantId: merchant.id } });
                    }
                  }}
                  style={({ pressed }) => [
                    styles.storeItem,
                    { backgroundColor: pressed ? `${palette.violet}06` : 'transparent' },
                    idx === 0 && { borderTopWidth: 0 },
                  ]}
                >
                  <View style={[styles.storeItemDot, { backgroundColor: palette.violet }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.storeItemName, { color: theme.text }]} numberOfLines={1}>
                      {store.nom}
                    </Text>
                    <Text style={[styles.storeItemAddr, { color: theme.textMuted }]} numberOfLines={1}>
                      {store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ') || t('merchant.seeOnMap')}
                    </Text>
                  </View>
                  {store.latitude != null && store.longitude != null && (
                    <ChevronRight size={16} color={palette.violet} strokeWidth={1.8} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Premium bottom bar ── */}
      <View style={[styles.bottomBar, { backgroundColor: theme.bg, borderTopColor: theme.borderLight }]}>
        <SafeAreaView edges={['bottom']} style={styles.bottomBarInner}>
          {(justLeft || merchant.cardDeactivated) && !justJoined ? (
            <Pressable
              onPress={handleJoinMerchant}
              disabled={joinLoading}
              style={({ pressed }) => [styles.joinBtn, { backgroundColor: palette.violet, opacity: pressed || joinLoading ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('merchant.rejoinCard')}
            >
              {joinLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <CreditCard size={18} color="#fff" strokeWidth={1.8} />
              )}
              <Text style={styles.joinBtnText} numberOfLines={1}>{t('merchant.rejoinCard')}</Text>
            </Pressable>
          ) : (merchant.hasCard || justJoined) ? (
            <View style={styles.memberBar}>
              <View style={[styles.joinedBanner, { backgroundColor: `${palette.emerald}08`, borderColor: `${palette.emerald}25` }]}>
                <Check size={18} color={palette.emerald} strokeWidth={2} />
                <Text style={[styles.joinedText, { color: palette.emerald }]}>{t('merchant.alreadyMember')}</Text>
              </View>
              <Pressable
                onPress={handleLeaveMerchant}
                disabled={leaveLoading}
                style={({ pressed }) => [styles.leaveBtn, { borderColor: '#EF444440', backgroundColor: '#EF444408', opacity: pressed || leaveLoading ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('merchant.leaveCard')}
              >
                {leaveLoading ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <XCircle size={18} color="#EF4444" strokeWidth={1.8} />
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleJoinMerchant}
              disabled={joinLoading}
              style={({ pressed }) => [styles.joinBtn, { backgroundColor: palette.violet, opacity: pressed || joinLoading ? 0.85 : 1 }]}
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
        </SafeAreaView>
      </View>
    </View>
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

  // Scroll
  scrollContent: {
    paddingBottom: hp(100),
  },

  // ── Hero section ──
  heroSection: {
    position: 'relative' as const,
    height: hp(220),
    marginBottom: hp(40),
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFade: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: hp(80),
  },
  floatingHeader: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: wp(16),
    paddingTop: hp(4),
  },
  floatingBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  logoContainer: {
    position: 'absolute' as const,
    bottom: -ms(40),
    alignSelf: 'center' as const,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
  },
  logoRing: {
    width: ms(92),
    height: ms(92),
    borderRadius: ms(46),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  logo: {
    width: ms(84),
    height: ms(84),
    borderRadius: ms(42),
  },
  emojiWrap: {
    width: ms(84),
    height: ms(84),
    borderRadius: ms(42),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emoji: { fontSize: ms(38) },

  // ── Identity section ──
  identitySection: {
    alignItems: 'center' as const,
    paddingHorizontal: wp(20),
    paddingBottom: hp(20),
  },
  merchantName: {
    fontSize: ms(26),
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    maxWidth: '92%',
    marginBottom: hp(8),
    textAlign: 'center' as const,
  },
  categoryBadge: {
    paddingHorizontal: wp(14),
    paddingVertical: hp(5),
    borderRadius: ms(20),
    marginBottom: hp(14),
  },
  categoryText: {
    fontSize: ms(12),
    fontWeight: '600' as const,
  },
  statsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(6),
  },
  statChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(6),
    borderRadius: ms(12),
    paddingHorizontal: wp(14),
    paddingVertical: hp(8),
  },
  statValue: {
    fontSize: ms(14),
    fontWeight: '800' as const,
  },
  statLabel: {
    fontSize: ms(11),
    fontWeight: '500' as const,
  },
  statDivider: {
    width: 1,
    height: ms(20),
    backgroundColor: '#00000010',
  },

  // ── Content area ──
  contentArea: {
    paddingHorizontal: wp(16),
    gap: hp(12),
  },

  // Section title
  sectionTitle: {
    fontSize: ms(16),
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    marginBottom: hp(8),
  },

  // Description
  descriptionCard: {
    borderRadius: ms(18),
    padding: wp(16),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  descriptionText: {
    fontSize: ms(14),
    lineHeight: ms(22),
    fontWeight: '400' as const,
  },

  // Grid
  gridRow: {
    flexDirection: 'row' as const,
    gap: wp(10),
  },
  infoCard: {
    flex: 1,
    borderRadius: ms(18),
    padding: wp(14),
    minHeight: hp(140),
    overflow: 'hidden' as const,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  infoCardGradient: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: hp(60),
    borderTopLeftRadius: ms(18),
    borderTopRightRadius: ms(18),
  },
  cardIconBadge: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: hp(8),
  },
  cardLabel: {
    fontSize: ms(10),
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: hp(4),
  },
  cardValue: {
    fontSize: ms(14),
    fontWeight: '700' as const,
    lineHeight: ms(20),
    marginBottom: hp(4),
  },
  cardSub: {
    fontSize: ms(11),
    fontWeight: '500' as const,
    lineHeight: ms(16),
  },
  metaLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(5),
    marginTop: 'auto' as const,
  },
  metaText: {
    fontSize: ms(11),
    fontWeight: '600' as const,
    flex: 1,
  },

  // Reward card
  rewardCard: {
    borderRadius: ms(18),
    padding: wp(14),
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(12),
    minHeight: hp(80),
    overflow: 'hidden' as const,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  rewardAccent: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: ms(4),
    backgroundColor: palette.gold,
    borderTopLeftRadius: ms(18),
    borderBottomLeftRadius: ms(18),
  },
  rewardTextWrap: { flex: 1 },
  rewardMain: {
    fontSize: ms(15),
    fontWeight: '700' as const,
    marginTop: hp(2),
    marginBottom: hp(4),
  },
  rewardCostBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: wp(10),
    paddingVertical: hp(3),
    borderRadius: ms(8),
  },
  rewardCost: {
    fontSize: ms(12),
    fontWeight: '700' as const,
  },

  // Social buttons
  socialRow: {
    flexDirection: 'row' as const,
    gap: wp(10),
  },
  socialBtn: {
    flex: 1,
    borderRadius: ms(14),
    minHeight: hp(46),
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(8),
  },
  socialText: {
    fontSize: ms(13),
    fontWeight: '600' as const,
  },

  // ── Other locations ──
  otherLocationsCard: {
    borderRadius: ms(18),
    padding: wp(14),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  otherLocationsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(12),
    marginBottom: hp(6),
  },
  otherLocationsCount: {
    fontSize: ms(12),
    fontWeight: '500' as const,
    marginTop: hp(2),
  },
  storeItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(12),
    paddingVertical: hp(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000008',
    borderRadius: ms(8),
    paddingHorizontal: wp(4),
  },
  storeItemDot: {
    width: ms(8),
    height: ms(8),
    borderRadius: ms(4),
  },
  storeItemName: {
    fontSize: ms(14),
    fontWeight: '700' as const,
  },
  storeItemAddr: {
    fontSize: ms(12),
    fontWeight: '500' as const,
    marginTop: hp(2),
  },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: wp(16),
    paddingTop: hp(10),
  },
  bottomBarInner: {
    // SafeAreaView handles bottom padding
  },
  joinBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(10),
    paddingVertical: hp(15),
    borderRadius: ms(16),
    ...Platform.select({
      ios: {
        shadowColor: palette.violet,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  joinBtnText: {
    color: '#fff',
    fontSize: ms(15),
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  joinedBanner: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(8),
    paddingVertical: hp(13),
    borderRadius: ms(14),
    borderWidth: 1,
  },
  joinedText: {
    fontSize: ms(14),
    fontWeight: '700' as const,
  },
  memberBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(10),
  },
  leaveBtn: {
    width: ms(46),
    height: ms(46),
    borderRadius: ms(14),
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
