import { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Share,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { MapPin, ArrowLeft, Info, Gift, Coins, Navigation, Star, Share2, Instagram, Globe, Eye, Users, CreditCard, Check } from 'lucide-react-native';
import GlassCard from '@/components/GlassCard';
import { haptic } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import FadeInView from '@/components/FadeInView';
import Skeleton from '@/components/Skeleton';
import { getCategoryEmoji } from '@/utils/categories';
import { useMerchantById } from '@/hooks/useQueryHooks';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { wp, hp, ms, SCREEN } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';

const BANNER_HEIGHT = hp(220);

/** Google Static Maps API key exposed at build time. */
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  // All hooks MUST be called before any conditional return (Rules of Hooks)
  const { data: merchant, isLoading: loading } = useMerchantById(id, isAuthenticated);
  const queryClient = useQueryClient();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [joinLoading, setJoinLoading] = useState(false);
  const [justJoined, setJustJoined] = useState(false);

  // Auth guard — redirect unauthenticated deep-links to welcome
  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  /**
   * Static Maps URL — one cheap HTTPS image instead of an interactive tile-based map.
   * Falls back to null when latitude/longitude or API key is missing.
   */
  // Static Maps URL — hides POIs, transit, business labels so only the road
  // network and the JitPlus violet pin are visible. One image = zero tile cost.
  const staticMapUrl = useMemo(() => {
    if (!merchant?.latitude || !merchant?.longitude || !GMAPS_KEY) return null;
    const styleParams = [
      'style=feature:poi|element:all|visibility:off',
      'style=feature:transit|element:all|visibility:off',
      'style=feature:poi.business|element:all|visibility:off',
      'style=feature:road|element:labels.icon|visibility:off',
    ].join('&');
    return `https://maps.googleapis.com/maps/api/staticmap?center=${merchant.latitude},${merchant.longitude}&zoom=15&size=600x200&scale=2&markers=color:0x7C3AED%7Csize:mid%7C${merchant.latitude},${merchant.longitude}&${styleParams}&region=MA&key=${GMAPS_KEY}`;
  }, [merchant?.latitude, merchant?.longitude]);

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

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, BANNER_HEIGHT - 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const bannerScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolateRight: 'clamp',
  });

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <SafeAreaView edges={['top']} style={{ paddingHorizontal: wp(20), paddingTop: hp(16) }}>
          <Skeleton width={ms(40)} height={ms(40)} borderRadius={ms(20)} />
          <View style={{ marginTop: hp(30), gap: hp(16) }}>
            <Skeleton width={wp(200)} height={hp(28)} borderRadius={ms(8)} />
            <Skeleton width={wp(100)} height={hp(20)} borderRadius={ms(8)} />
            <Skeleton width={SCREEN.width - wp(40)} height={hp(120)} borderRadius={ms(18)} />
            <Skeleton width={SCREEN.width - wp(40)} height={hp(80)} borderRadius={ms(18)} />
          </View>
        </SafeAreaView>
      </View>
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
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Sticky Header (appears on scroll) */}
      <Animated.View
        style={[
          styles.stickyHeader,
          {
            backgroundColor: theme.bg,
            opacity: headerOpacity,
            borderBottomColor: theme.borderLight,
          },
        ]}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.stickyHeaderContent}>
            <Text style={[styles.stickyHeaderTitle, { color: theme.text }]} numberOfLines={1}>
              {merchant.nomBoutique}
            </Text>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Back Button */}
      <SafeAreaView style={styles.backButtonSafe} edges={['top']}>
        <Pressable
          onPress={() => {
            haptic();
            router.back();
          }}
          style={[styles.backButton, { backgroundColor: 'rgba(255,255,255,0.3)' }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color="#fff" strokeWidth={1.5} />
        </Pressable>
      </SafeAreaView>

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Banner ── */}
        <Animated.View style={[styles.bannerContainer, { transform: [{ scale: bannerScale }] }]}>
          <LinearGradient
            colors={[palette.violetDark, palette.violet, palette.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            {merchant.logoUrl ? (
              <Image
                source={resolveImageUrl(merchant.logoUrl)}
                style={styles.bannerLogo}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <Text style={styles.bannerEmoji}>{getCategoryEmoji(merchant.categorie)}</Text>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Content */}
        <View style={[styles.content, { backgroundColor: theme.bg }]}>
          <FadeInView delay={100}>
            <View style={styles.titleRow}>
              <Text style={[styles.merchantName, { color: theme.text }]}>
                {merchant.nomBoutique}
              </Text>
              <View style={[styles.categoryBadge, { backgroundColor: theme.primaryBg }]}>
                <Text style={[styles.categoryText, { color: theme.primaryLight }]}>
                  {merchant.categorie}
                </Text>
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                {merchant.profileViews != null && (
                  <View style={[styles.statItem, { backgroundColor: theme.primaryBg }]}>
                    <Eye size={14} color={theme.primaryLight} strokeWidth={1.5} />
                    <Text style={[styles.statText, { color: theme.text }]}>
                      {merchant.profileViews.toLocaleString('fr-MA')}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                      {t('merchant.views')}
                    </Text>
                  </View>
                )}
                {merchant.clientCount != null && (
                  <View style={[styles.statItem, { backgroundColor: theme.primaryBg }]}>
                    <Users size={14} color={theme.primaryLight} strokeWidth={1.5} />
                    <Text style={[styles.statText, { color: theme.text }]}>
                      {merchant.clientCount.toLocaleString('fr-MA')}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                      {t('merchant.clients')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </FadeInView>

          {/* Loyalty Card */}
          <FadeInView delay={200}>
            <GlassCard>
              <View style={[styles.loyaltyCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                {/* Premium accent bar */}
                <LinearGradient
                  colors={[palette.violet, palette.violetLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.cardAccentBar}
                />
                <View style={styles.loyaltyHeader}>
                  <View style={[styles.loyaltyIconBox, { backgroundColor: theme.primaryBg }]}>
                    {merchant.loyaltyType === 'STAMPS' ? (
                      <Gift size={22} color={theme.primaryLight} strokeWidth={1.5} />
                    ) : (
                      <Coins size={22} color={theme.primaryLight} strokeWidth={1.5} />
                    )}
                  </View>
                  <View style={styles.loyaltyDetail}>
                    <Text style={[styles.loyaltyLabel, { color: theme.textSecondary }]}>
                      {t('merchant.loyaltyProgram')}
                    </Text>
                    <Text style={[styles.loyaltyValue, { color: theme.text }]}>
                      {merchant.loyaltyType === 'STAMPS'
                        ? t('merchant.stampCard')
                        : t('merchant.pointsAccumulation')}
                    </Text>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

                <View style={[styles.ruleBox, { backgroundColor: theme.primaryBg }]}>
                  <Text style={styles.ruleEmoji}>
                    {merchant.loyaltyType === 'STAMPS' ? '🎁' : '💰'}
                  </Text>
                  <Text style={[styles.ruleText, { color: theme.text }]}>
                    {merchant.loyaltyType === 'STAMPS'
                      ? t('merchant.stampRule', { count: merchant.stampsForReward || 10 })
                      : t('merchant.pointsRule', { rate: merchant.conversionRate || 10 })}
                  </Text>
                </View>
              </View>
            </GlassCard>
          </FadeInView>

          {/* Get Loyalty Card / Already Member */}
          <FadeInView delay={250}>
            {(merchant.hasCard || justJoined) ? (
              <View style={[styles.joinButtonDone, { backgroundColor: `${palette.emerald}15`, borderColor: `${palette.emerald}30` }]}>
                <Check size={20} color={palette.emerald} strokeWidth={1.5} />
                <Text style={[styles.joinButtonDoneText, { color: palette.emerald }]}>
                  {t('merchant.alreadyMember')}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={handleJoinMerchant}
                disabled={joinLoading}
                style={({ pressed }) => [
                  styles.joinButton,
                  { opacity: pressed || joinLoading ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('merchant.getLoyaltyCard')}
              >
                {joinLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <CreditCard size={20} color="#fff" strokeWidth={1.5} />
                )}
                <Text style={styles.joinButtonText}>
                  {t('merchant.getLoyaltyCard')}
                </Text>
              </Pressable>
            )}
          </FadeInView>

          {/* Info Section */}
          {(merchant.adresse || merchant.description) && (
            <FadeInView delay={300}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                {t('merchant.info')}
              </Text>
              <GlassCard>
                <View style={[styles.infoCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                  {/* Premium accent bar */}
                  <LinearGradient
                    colors={[palette.violet, palette.violetLight]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.cardAccentBar}
                  />
                  {merchant.adresse && (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: theme.primaryBg }]}>
                        <MapPin size={16} color={theme.primaryLight} strokeWidth={1.5} />
                      </View>
                      <Text style={[styles.infoText, { color: theme.text }]}>
                        {merchant.adresse}
                      </Text>
                    </View>
                  )}
                  {merchant.description && (
                    <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
                      <View style={[styles.infoIconBox, { backgroundColor: theme.primaryBg, marginTop: 2 }]}>
                        <Info size={16} color={theme.primaryLight} strokeWidth={1.5} />
                      </View>
                      <Text style={[styles.infoText, { color: theme.text, lineHeight: 22 }]}>
                        {merchant.description}
                      </Text>
                    </View>
                  )}
                </View>
              </GlassCard>
            </FadeInView>
          )}

          {/* ── Réseaux sociaux ── */}
          {!!(merchant.socialLinks?.instagram || merchant.socialLinks?.tiktok) && (
            <FadeInView delay={350}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: hp(28) }]}>
                {t('merchant.socialLinks')}
              </Text>
              <View style={styles.socialGrid}>
                {!!merchant.socialLinks.instagram && (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Instagram @${merchant.socialLinks!.instagram!.replace(/^@/, '')}`}
                    style={({ pressed }) => [
                      styles.socialCard,
                      { backgroundColor: theme.bgCard, borderColor: theme.borderLight },
                      pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                    ]}
                    onPress={async () => {
                      haptic();
                      const username = merchant.socialLinks!.instagram!.replace(/^@/, '');
                      // Validate username: only alphanumeric, underscores, and dots (Instagram rules)
                      if (!/^[a-zA-Z0-9_.]{1,30}$/.test(username)) return;
                      const appUrl = `instagram://user?username=${encodeURIComponent(username)}`;
                      const webUrl = `https://www.instagram.com/${encodeURIComponent(username)}`;
                      const canOpen = await Linking.canOpenURL(appUrl);
                      Linking.openURL(canOpen ? appUrl : webUrl);
                    }}
                  >
                    <View style={[styles.socialIconBox, { backgroundColor: '#fce4ec' }]}>
                      <Instagram size={20} color="#E1306C" strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.socialLabel, { color: theme.textSecondary }]}>Instagram</Text>
                    <Text style={[styles.socialUsername, { color: theme.text }]} numberOfLines={1}>
                      @{merchant.socialLinks.instagram.replace(/^@/, '')}
                    </Text>
                  </Pressable>
                )}
                {!!merchant.socialLinks.tiktok && (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`TikTok @${merchant.socialLinks!.tiktok!.replace(/^@/, '')}`}
                    style={({ pressed }) => [
                      styles.socialCard,
                      { backgroundColor: theme.bgCard, borderColor: theme.borderLight },
                      pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                    ]}
                    onPress={async () => {
                      haptic();
                      const username = merchant.socialLinks!.tiktok!.replace(/^@/, '');
                      // Validate username: only alphanumeric, underscores, and dots (TikTok rules)
                      if (!/^[a-zA-Z0-9_.]{1,30}$/.test(username)) return;
                      const webUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
                      Linking.openURL(webUrl);
                    }}
                  >
                    <View style={[styles.socialIconBox, { backgroundColor: '#f0f0f0' }]}>
                      <Globe size={20} color="#000" strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.socialLabel, { color: theme.textSecondary }]}>TikTok</Text>
                    <Text style={[styles.socialUsername, { color: theme.text }]} numberOfLines={1}>
                      @{merchant.socialLinks.tiktok.replace(/^@/, '')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </FadeInView>
          )}

          {/* ── Voir sur la carte ── */}
          {!!(merchant.latitude && merchant.longitude) && (
            <FadeInView delay={400}>
              {staticMapUrl ? (
                // Static map thumbnail — tapping opens the full interactive map
                <Pressable
                  onPress={() => {
                    haptic();
                    router.push({
                      pathname: '/(tabs)/discover',
                      params: { focusMerchantId: merchant.id },
                    });
                  }}
                  style={({ pressed }) => [styles.staticMapWrapper, { opacity: pressed ? 0.85 : 1 }]}
                  accessibilityLabel={t('merchant.seeOnMap')}
                >
                  <Image
                    source={{ uri: staticMapUrl }}
                    style={styles.staticMap}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                  <View style={styles.staticMapOverlay}>
                    <Navigation size={16} color="#fff" strokeWidth={1.5} />
                    <Text style={styles.mapButtonText}>{t('merchant.seeOnMap')}</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    haptic();
                    router.push({
                      pathname: '/(tabs)/discover',
                      params: { focusMerchantId: merchant.id },
                    });
                  }}
                  style={({ pressed }) => [
                    styles.mapButton,
                    { backgroundColor: palette.violet, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Navigation size={18} color="#fff" strokeWidth={1.5} />
                  <Text style={styles.mapButtonText}>{t('merchant.seeOnMap')}</Text>
                </Pressable>
              )}
            </FadeInView>
          )}

          {/* ── Récompenses ── */}
          <FadeInView delay={450}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: hp(28) }]}>
              {t('merchant.rewardsSection')}
            </Text>
            {(!merchant.rewards || merchant.rewards.length === 0) ? (
              <View style={[styles.emptyRewards, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                <Text style={styles.emptyRewardsEmoji}>🎁</Text>
                <Text style={[styles.emptyRewardsText, { color: theme.textMuted }]}>
                  {t('merchant.noRewards')}
                </Text>
              </View>
            ) : (
              <View style={styles.rewardsList}>
                {merchant.rewards.map((reward, index) => (
                  <GlassCard key={reward.id}>
                    <View
                      style={[
                        styles.rewardCard,
                        { backgroundColor: theme.bgCard, borderColor: theme.borderLight },
                        index === merchant.rewards!.length - 1 && { marginBottom: 0 },
                      ]}
                    >
                      <LinearGradient
                        colors={[`${palette.violet}18`, `${palette.violet}06`]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.rewardGradient}
                      >
                        {/* Premium accent bar */}
                        <LinearGradient
                          colors={[palette.gold, palette.goldLight]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.rewardAccentBar}
                        />
                        <View style={[styles.rewardIconBox, { backgroundColor: `${palette.violet}22` }]}>
                          <Star size={20} color={palette.violet} strokeWidth={1.5} fill={`${palette.violet}44`} />
                        </View>
                        <View style={styles.rewardBody}>
                          <Text style={[styles.rewardTitle, { color: theme.text }]} numberOfLines={2}>
                            {reward.titre}
                          </Text>
                          {!!reward.description && (
                            <Text style={[styles.rewardDesc, { color: theme.textMuted }]} numberOfLines={3}>
                              {reward.description}
                            </Text>
                          )}
                        </View>
                        <View style={[styles.rewardCostBadge, { backgroundColor: `${palette.violet}18` }]}>
                          <Text style={[styles.rewardCostText, { color: palette.violet }]}>
                            {merchant.loyaltyType === 'STAMPS'
                              ? t('merchant.stampsCost', { count: reward.cout })
                              : t('merchant.pointsCost', { count: reward.cout.toLocaleString('fr-MA') })}
                          </Text>
                        </View>
                      </LinearGradient>
                    </View>
                  </GlassCard>
                ))}
              </View>
            )}
          </FadeInView>

          {/* ── Partager l'app ── */}
          <FadeInView delay={500}>
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
              style={({ pressed }) => [
                styles.shareButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Share2 size={18} color={palette.violet} strokeWidth={1.5} />
              <Text style={[styles.shareButtonText, { color: palette.violet }]}>
                {t('merchant.shareApp')}
              </Text>
            </Pressable>
          </FadeInView>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: wp(40) },
  errorIcon: { width: ms(72), height: ms(72), borderRadius: ms(36), alignItems: 'center', justifyContent: 'center', marginBottom: hp(20) },
  errorTitle: { fontSize: ms(22), fontWeight: '700', marginBottom: hp(8) },
  errorText: { fontSize: ms(14), textAlign: 'center', lineHeight: ms(22), marginBottom: hp(24) },
  errorButton: { paddingHorizontal: wp(24), paddingVertical: hp(12), borderRadius: ms(14) },
  errorButtonText: { color: '#fff', fontSize: ms(15), fontWeight: '700' },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: hp(10),
    borderBottomWidth: 1,
  },
  stickyHeaderContent: {
    alignItems: 'center',
    paddingHorizontal: wp(60),
    flexDirection: 'row',
    justifyContent: 'center',
    height: hp(44),
  },
  stickyHeaderTitle: { fontSize: ms(17), fontWeight: '700' },
  backButtonSafe: {
    position: 'absolute',
    top: hp(5),
    left: wp(16),
    zIndex: 20,
  },
  backButton: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: hp(6),
  },
  bannerContainer: { height: BANNER_HEIGHT, width: '100%' },
  banner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bannerEmoji: { fontSize: ms(80) },
  bannerLogo: {
    width: hp(110), height: hp(110), borderRadius: hp(55),
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)',
  },
  content: {
    paddingHorizontal: wp(24),
    paddingTop: hp(24),
    paddingBottom: hp(60),
    minHeight: SCREEN.height - BANNER_HEIGHT,
    marginTop: -24,
    borderTopLeftRadius: ms(28),
    borderTopRightRadius: ms(28),
  },
  titleRow: { marginBottom: hp(24) },
  merchantName: { fontSize: ms(28), fontWeight: '800', marginBottom: hp(10), letterSpacing: -0.4 },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: wp(12),
    paddingVertical: hp(6),
    borderRadius: ms(12),
  },
  categoryText: { fontSize: ms(13), fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    gap: wp(10),
    marginTop: hp(14),
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    borderRadius: ms(14),
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  statText: { fontSize: ms(15), fontWeight: '800' },
  statLabel: { fontSize: ms(12), fontWeight: '500' },
  loyaltyCard: {
    borderRadius: ms(20),
    padding: wp(20),
    paddingLeft: wp(16),
    marginBottom: hp(28),
    borderWidth: 1,
    overflow: 'hidden' as const,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardAccentBar: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: ms(4),
    borderTopLeftRadius: ms(20),
    borderBottomLeftRadius: ms(20),
  },
  loyaltyHeader: { flexDirection: 'row', alignItems: 'center' },
  loyaltyIconBox: {
    width: ms(46),
    height: ms(46),
    borderRadius: ms(15),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: wp(14),
  },
  loyaltyDetail: { flex: 1 },
  loyaltyLabel: { fontSize: ms(12), marginBottom: hp(4), fontWeight: '500' },
  loyaltyValue: { fontSize: ms(16), fontWeight: '700' },
  divider: { height: 1, marginVertical: hp(16) },
  ruleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    borderRadius: ms(14),
    padding: wp(14),
  },
  ruleEmoji: { fontSize: ms(20) },
  ruleText: { fontSize: ms(14), fontWeight: '600', flex: 1 },
  sectionTitle: {
    fontSize: ms(13),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: hp(10),
    marginLeft: wp(4),
  },
  infoCard: {
    borderRadius: ms(18),
    padding: wp(16),
    paddingLeft: wp(12),
    borderWidth: 1,
    overflow: 'hidden' as const,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(14), gap: wp(12) },
  infoIconBox: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { fontSize: ms(14), flex: 1 },

  // ── Social links ──
  socialGrid: {
    flexDirection: 'row' as const,
    gap: wp(10),
  },
  socialCard: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: hp(16),
    paddingHorizontal: wp(10),
    borderRadius: ms(18),
    borderWidth: 1,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  socialIconBox: {
    width: ms(44),
    height: ms(44),
    borderRadius: ms(14),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: hp(8),
  },
  socialLabel: { fontSize: ms(11), fontWeight: '500' as const, marginBottom: hp(2) },
  socialUsername: { fontSize: ms(13), fontWeight: '700' as const },

  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(8),
    marginTop: hp(8),
    paddingVertical: hp(16),
    borderRadius: ms(18),
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  mapButtonText: { color: '#fff', fontSize: ms(15), fontWeight: '700', letterSpacing: 0.2 },

  // ── Static map thumbnail (FinOps: one image request vs. full tile-based map) ──
  staticMapWrapper: {
    borderRadius: ms(18),
    overflow: 'hidden',
    marginTop: hp(8),
    height: hp(140),
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  staticMap: { width: '100%', height: '100%' },
  staticMapOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(10),
    gap: wp(8),
    backgroundColor: 'rgba(124,58,237,0.78)',
  },

  // ── Rewards ──
  rewardsList: { gap: hp(10) },
  rewardCard: {
    borderRadius: ms(18),
    borderWidth: 1,
    marginBottom: hp(12),
    overflow: 'hidden' as const,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  rewardAccentBar: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: ms(4),
    borderTopLeftRadius: ms(18),
    borderBottomLeftRadius: ms(18),
  },
  rewardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: wp(16),
    gap: wp(14),
  },
  rewardIconBox: {
    width: ms(44), height: ms(44), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rewardBody: { flex: 1, gap: hp(4) },
  rewardTitle: { fontSize: ms(15), fontWeight: '700', lineHeight: ms(22) },
  rewardDesc: { fontSize: ms(13), lineHeight: ms(19) },
  rewardCostBadge: {
    paddingHorizontal: wp(10), paddingVertical: hp(6),
    borderRadius: ms(10), flexShrink: 0,
  },
  rewardCostText: { fontSize: ms(13), fontWeight: '700' },

  emptyRewards: {
    borderRadius: ms(18), borderWidth: 1,
    paddingVertical: hp(28), alignItems: 'center', gap: hp(8),
  },
  emptyRewardsEmoji: { fontSize: ms(32) },
  emptyRewardsText: { fontSize: ms(14), textAlign: 'center', paddingHorizontal: wp(24) },

  // ── Share button ──
  shareButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(8),
    marginTop: hp(20),
    paddingVertical: hp(16),
    borderRadius: ms(18),
    borderWidth: 1.5,
    borderColor: `${palette.violet}35`,
    backgroundColor: `${palette.violet}0D`,
  },
  shareButtonText: { fontSize: ms(15), fontWeight: '700' as const, letterSpacing: 0.2 },

  // ── Join / Loyalty card button ──
  joinButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(10),
    marginBottom: hp(24),
    paddingVertical: hp(16),
    borderRadius: ms(18),
    backgroundColor: palette.violet,
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 5,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: ms(15),
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  joinButtonDone: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(10),
    marginBottom: hp(24),
    paddingVertical: hp(14),
    borderRadius: ms(16),
    borderWidth: 1.5,
  },
  joinButtonDoneText: {
    fontSize: ms(15),
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
});
