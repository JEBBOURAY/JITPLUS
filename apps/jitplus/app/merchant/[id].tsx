import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { ArrowLeft, AlertCircle, Stamp, Coins, Gift, Send, Instagram, Eye, Users, Wallet, BadgeCheck, MapPin, Music2, LogOut, ChevronRight, Phone, Globe, Mail } from 'lucide-react-native';
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
import { getDistanceSafe, formatDistance } from '@/utils/distance';
import * as Location from 'expo-location';

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const { data: merchant, isLoading: loading, refetch } = useMerchantById(id, isAuthenticated);
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );
  const [joinLoading, setJoinLoading] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [justLeft, setJustLeft] = useState(false);
  const joiningRef = useRef(false);
  const leavingRef = useRef(false);
  const [logoError, setLogoError] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000 });
          if (mounted) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch { /* location unavailable */ }
    })();
    return () => { mounted = false; };
  }, []);

  const handleJoinMerchant = useCallback(async () => {
    if (!id || joiningRef.current || merchant?.hasCard || justJoined) return;
    joiningRef.current = true;
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
      Alert.alert(t('common.error'), t('merchant.joinError'));
    } finally {
      joiningRef.current = false;
      setJoinLoading(false);
    }
  }, [id, merchant?.hasCard, justJoined, queryClient, t]);

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
            if (leavingRef.current) return;
            leavingRef.current = true;
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
              Alert.alert(t('common.error'), t('merchant.leaveError'));
            } finally {
              leavingRef.current = false;
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
          <Skeleton width="100%" height={hp(100)} borderRadius={ms(16)} />
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
            <AlertCircle size={28} color={theme.textMuted} strokeWidth={2} />
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
              <ArrowLeft size={20} color={palette.gray900} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={async () => {
                haptic();
                try {
                  const deepLink = `jitplus://merchant/${merchant.id}`;
                  const { getStoreUrl } = require('@/constants');
                  const storeUrl = getStoreUrl();
                  await Share.share({
                    message: `${t('merchant.shareText', { name: merchant.nomBoutique })}\n\n${deepLink}\n\n${t('merchant.shareDownload')}\n${storeUrl}`,
                  });
                } catch { /* user cancelled */ }
              }}
              style={[styles.floatingBtn, { backgroundColor: 'rgba(255,255,255,0.85)' }]}
              accessibilityRole="button"
              accessibilityLabel={t('merchant.shareApp')}
              hitSlop={8}
            >
              <Send size={18} color={palette.gray900} strokeWidth={2} />
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
              <Eye size={15} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {(merchant.profileViews ?? 0).toLocaleString('fr-MA')}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('merchant.views')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.statChip, { backgroundColor: theme.bgCard }]}>
              <Users size={15} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {(merchant.clientCount ?? 0).toLocaleString('fr-MA')}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('merchant.clients')}</Text>
            </View>
          </View>
        </View>

        {/* Social links + Email */}
        {(() => {
            const storeEmail = merchant.stores?.find(s => !!s.email)?.email;
            const hasLinks = !!storeEmail || !!merchant.socialLinks?.instagram || !!merchant.socialLinks?.tiktok || !!merchant.socialLinks?.website;
            if (!hasLinks) return null;
            return (
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
                  style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: '#E1306C12', opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('merchant.openInstagram')}
                >
                  <Instagram size={18} color="#E1306C" strokeWidth={2} />
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
                  style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: `${palette.gray900}08`, opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('merchant.openTiktok')}
                >
                  <Music2 size={18} color={palette.gray900} strokeWidth={2} />
                </Pressable>
              )}

              {!!storeEmail && (
                <Pressable
                  onPress={() => {
                    haptic();
                    Linking.openURL(`mailto:${storeEmail}`);
                  }}
                  style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: '#EA433512', opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('merchant.email')}
                >
                  <Mail size={18} color="#EA4335" strokeWidth={2} />
                </Pressable>
              )}

              {!!merchant.socialLinks?.website && (
                <Pressable
                  onPress={() => {
                    haptic();
                    let url = merchant.socialLinks?.website ?? '';
                    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
                    try {
                      const parsed = new URL(url);
                      if (!['http:', 'https:'].includes(parsed.protocol)) return;
                      Linking.openURL(parsed.href);
                    } catch { /* invalid URL — ignore */ }
                  }}
                  style={({ pressed }) => [styles.socialIconBtn, { backgroundColor: `${palette.violet}10`, opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="link"
                  accessibilityLabel={t('merchant.website')}
                >
                  <Globe size={18} color={palette.violet} strokeWidth={2} />
                </Pressable>
              )}
            </View>
            );
          })()}

        {/* ── Content area ── */}
        <View style={styles.contentArea}>
          {/* Description */}
          {!!merchant.description && (
            <LinearGradient
              colors={[theme.bgCard, `${palette.violet}10`, `${palette.violet}18`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.descriptionCard, { backgroundColor: theme.bgCard }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {t('merchant.aboutUs')}
              </Text>
              <Text style={[styles.descriptionText, { color: theme.textSecondary }]}>
                {merchant.description}
              </Text>
            </LinearGradient>
          )}

          {/* Loyalty & Reward combined card */}
          <LinearGradient
            colors={[theme.bgCard, `${palette.gold}10`, `${palette.gold}18`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.loyaltyRewardCard, { backgroundColor: theme.bgCard }]}>
            <View style={styles.loyaltyRow}>
              <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}15` }]}>
                {merchant.loyaltyType === 'STAMPS' ? (
                  <Stamp size={18} color={palette.violet} strokeWidth={2} />
                ) : (
                  <Coins size={18} color={palette.violet} strokeWidth={2} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
                  {t('merchant.loyaltyProgram')}
                </Text>
                <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1}>
                  {merchant.loyaltyType === 'STAMPS' ? t('merchant.stampCard') : t('merchant.pointsAccumulation')}
                </Text>
              </View>
              {(merchant.hasCard || justJoined) && merchant.cardBalance != null && (
                <View style={[styles.balanceBadge, { backgroundColor: `${palette.violet}15` }]}>
                  <Text style={[styles.balanceBadgeText, { color: palette.violet }]}>
                    {merchant.loyaltyType === 'STAMPS'
                      ? t('merchant.yourStamps', { count: merchant.cardBalance })
                      : t('merchant.yourPoints', { count: merchant.cardBalance })}
                  </Text>
                </View>
              )}
            </View>

            {merchant.rewards && merchant.rewards.length > 0 && (
              <>
                <View style={[styles.loyaltyDivider, { backgroundColor: theme.borderLight }]} />
                <View style={styles.rewardsSectionHeader}>
                  <View style={[styles.cardIconBadge, { backgroundColor: `${palette.violet}15` }]}>
                    <Gift size={18} color={palette.violet} strokeWidth={2} />
                  </View>
                  <Text style={[styles.cardLabel, { color: theme.textMuted, marginBottom: 0 }]}>{t('merchant.rewardsSection')}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rewardsScroll} contentContainerStyle={styles.rewardsScrollContent}>
                  {merchant.rewards.map((reward, idx) => (
                    <View key={reward.id || idx} style={[styles.rewardCard, { backgroundColor: `${palette.violet}08`, borderColor: `${palette.violet}20` }]}>
                      <Gift size={22} color={palette.violet} strokeWidth={1.8} />
                      <Text style={[styles.rewardCardTitle, { color: theme.text }]} numberOfLines={2}>
                        {reward.titre}
                      </Text>
                      <View style={[styles.rewardCostBadge, { backgroundColor: `${palette.violet}15` }]}>
                        <Text style={[styles.rewardCost, { color: palette.violet }]} numberOfLines={1}>
                          {merchant.loyaltyType === 'STAMPS'
                            ? t('merchant.stampsCost', { count: reward.cout })
                            : t('merchant.pointsCost', { count: reward.cout.toLocaleString('fr-MA') })}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </LinearGradient>

          {/* Locations section */}
          {merchant.stores && merchant.stores.length >= 1 && (
            <LinearGradient
              colors={[theme.bgCard, `${palette.violet}10`, `${palette.violet}18`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.otherLocationsCard, { backgroundColor: theme.bgCard }]}>
              <View style={styles.otherLocationsHeader}>
                <View style={[styles.cardIconBadge, { backgroundColor: `${palette.gold}12` }]}>
                  <MapPin size={18} color={palette.gold} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                    {merchant.stores.length > 1 ? t('merchant.otherLocationsTitle') : t('merchant.locationTitle')}
                  </Text>
                  {merchant.stores.length > 1 && (
                    <Text style={[styles.otherLocationsCount, { color: theme.textMuted }]}>
                      {t('merchant.otherLocationsCount', { count: merchant.stores.length })}
                    </Text>
                  )}
                </View>
              </View>
              {merchant.stores.map((store, idx) => (
                <Pressable
                  key={store.id}
                  onPress={() => {
                    haptic();
                    if (store.latitude != null && store.longitude != null) {
                      const label = encodeURIComponent(store.nom || merchant.nomBoutique);
                      const url = Platform.select({
                        ios: `maps:0,0?q=${label}@${store.latitude},${store.longitude}`,
                        default: `geo:${store.latitude},${store.longitude}?q=${store.latitude},${store.longitude}(${label})`,
                      });
                      Linking.openURL(url);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.storeItem,
                    { backgroundColor: pressed ? `${palette.gold}06` : 'transparent' },
                    idx === 0 && { borderTopWidth: 0 },
                  ]}
                >
                  <View style={[styles.storeItemDot, { backgroundColor: palette.gold }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.storeItemName, { color: theme.text }]} numberOfLines={1}>
                      {store.nom}
                    </Text>
                    {(store.adresse || store.quartier || store.ville) && (
                      <Text style={[styles.storeAddress, { color: theme.textMuted }]} numberOfLines={1}>
                        {store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ')}
                      </Text>
                    )}
                    {!!store.telephone && (
                      <Pressable
                        onPress={() => {
                          haptic();
                          Linking.openURL(`tel:${store.telephone}`);
                        }}
                        hitSlop={4}
                        style={({ pressed }) => [styles.storePhoneRow, { opacity: pressed ? 0.6 : 1 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('merchant.call')} ${store.nom}`}
                      >
                        <Phone size={13} color={palette.emerald} strokeWidth={2} />
                        <Text style={[styles.storePhone, { color: palette.emerald }]} numberOfLines={1}>
                          {store.telephone}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {userLocation && store.latitude != null && store.longitude != null && (
                    <Text style={[styles.storeDistance, { color: theme.textMuted }]} numberOfLines={1}>
                      {formatDistance(getDistanceSafe(userLocation.latitude, userLocation.longitude, store.latitude, store.longitude))}
                    </Text>
                  )}
                  {store.latitude != null && store.longitude != null && (
                    <ChevronRight size={16} color={palette.gold} strokeWidth={2} />
                  )}
                </Pressable>
              ))}
            </LinearGradient>
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
                <Wallet size={18} color="#fff" strokeWidth={2} />
              )}
              <Text style={styles.joinBtnText} numberOfLines={1}>{t('merchant.rejoinCard')}</Text>
            </Pressable>
          ) : (merchant.hasCard || justJoined) ? (
            <View style={styles.memberBar}>
              <View style={[styles.joinedBanner, { backgroundColor: `${palette.emerald}08`, borderColor: `${palette.emerald}25` }]}>
                <BadgeCheck size={18} color={palette.emerald} strokeWidth={2} />
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
                  <LogOut size={18} color="#EF4444" strokeWidth={2} />
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
                <Wallet size={18} color="#fff" strokeWidth={2} />
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
  loyaltyRewardCard: {
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
  loyaltyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(12),
  },
  loyaltyDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: hp(12),
  },
  cardIconBadge: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cardLabel: {
    fontSize: ms(11),
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: hp(4),
  },
  cardValue: {
    fontSize: ms(14),
    fontWeight: '700' as const,
    lineHeight: ms(20),
  },
  balanceBadge: {
    paddingHorizontal: wp(10),
    paddingVertical: hp(4),
    borderRadius: ms(10),
    alignSelf: 'flex-start' as const,
  },
  balanceBadgeText: {
    fontSize: ms(13),
    fontWeight: '800' as const,
  },

  // Reward
  rewardsSectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(12),
    marginBottom: hp(8),
  },
  rewardsScroll: {
    marginBottom: hp(4),
  },
  rewardsScrollContent: {
    gap: wp(10),
  },
  rewardCard: {
    alignItems: 'center' as const,
    width: wp(120),
    paddingVertical: hp(12),
    paddingHorizontal: wp(10),
    borderRadius: ms(14),
    borderWidth: 1,
  },
  rewardCardTitle: {
    fontSize: ms(12),
    fontWeight: '700' as const,
    lineHeight: ms(16),
    textAlign: 'center' as const,
    marginTop: hp(6),
    marginBottom: hp(6),
  },
  rewardCostBadge: {
    paddingHorizontal: wp(10),
    paddingVertical: hp(3),
    borderRadius: ms(8),
  },
  rewardCost: {
    fontSize: ms(11),
    fontWeight: '700' as const,
  },

  // Social buttons
  socialRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: wp(14),
    paddingBottom: hp(16),
  },
  socialIconBtn: {
    width: ms(42),
    height: ms(42),
    borderRadius: ms(21),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
    lineHeight: ms(20),
  },
  storeAddress: {
    fontSize: ms(12),
    fontWeight: '400' as const,
    lineHeight: ms(17),
    marginTop: hp(2),
  },
  storePhoneRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: wp(5),
    marginTop: hp(4),
  },
  storePhone: {
    fontSize: ms(12),
    fontWeight: '600' as const,
    lineHeight: ms(17),
  },
  storeDistance: {
    fontSize: ms(12),
    fontWeight: '600' as const,
    marginRight: wp(4),
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
