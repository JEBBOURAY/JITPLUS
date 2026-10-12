import { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { ChevronRight, Plus, ScanLine, Ticket } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/stores/authStore';
import { useScratchCampaigns } from '@/hooks/useScratchHooks';
import { ms } from '@/utils/responsive';
import PremiumLockCard from '@/components/PremiumLockCard';
import { Button, CampaignStatusPill, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';
import { formatYmd } from '@/components/scratch/DateField';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import type { ScratchCampaignListItem } from '@jitplus/shared/src/scratch';

export default function ScratchCampaignsScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const isPremium = merchant?.plan === 'PREMIUM';
  const canManage = isPremium && !isTeamMember;
  const row = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  const { data: campaigns = [], isLoading, isError, refetch, isRefetching } = useScratchCampaigns(!shouldWait);

  const openCampaign = useCallback(
    (id: string) => router.push({ pathname: '/scratch-campaigns/[id]', params: { id } }),
    [router],
  );

  const renderItem = useCallback(({ item }: { item: ScratchCampaignListItem }) => {
    const dateLine = item.status === 'SCHEDULED' && item.sendAt
      ? t('scratch.list.sendAt', { date: `${formatYmd(moroccoYmdOf(new Date(item.sendAt)), locale, false)}` })
      : item.sentAt
        ? t('scratch.list.sentAt', { date: formatYmd(moroccoYmdOf(new Date(item.sentAt)), locale, false) })
        : t('scratch.list.cardUntil', { date: formatYmd(item.cardExpiresOn, locale, false) });
    return (
      <TouchableOpacity
        onPress={() => openCampaign(item.id)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${t(`scratch.campaignStatus.${item.status}`)}`}
        style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, flexDirection: row }]}
      >
        <View style={styles.cardBody}>
          <View style={[styles.cardTop, { flexDirection: row }]}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {item.name}
            </Text>
            <CampaignStatusPill status={item.status} />
          </View>
          <Text style={[styles.cardMeta, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{dateLine}</Text>
          {item.recipientCount > 0 && (
            <Text style={[styles.cardMeta, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
              {t('scratch.list.recipients', { count: item.recipientCount })} · {t('scratch.list.scratched', { count: item.scratchedCount })} ·{' '}
              {t('scratch.list.redeemed', { count: item.redeemedCount })}
            </Text>
          )}
        </View>
        <ChevronRight size={18} color={theme.textMuted} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
      </TouchableOpacity>
    );
  }, [theme, t, locale, row, textAlign, isRTL, openCampaign]);

  if (shouldWait) return null;

  const header = (
    <View style={styles.headerContent}>
      <TouchableOpacity
        onPress={() => router.push('/coupon-validate')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('scratch.list.validateCoupon')}
        style={[styles.validateCard, { backgroundColor: theme.primaryBg, flexDirection: row }]}
      >
        <View style={[styles.validateIcon, { backgroundColor: theme.primary }]}>
          <ScanLine size={22} color="#FFFFFF" />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.validateTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{t('scratch.list.validateCoupon')}</Text>
          <Text style={[styles.cardMeta, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>{t('scratch.list.validateCouponHint')}</Text>
        </View>
        <ChevronRight size={18} color={theme.primary} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
      </TouchableOpacity>

      {!isPremium && campaigns.length === 0 && (
        <PremiumLockCard titleKey="scratch.list.premiumTitle" descriptionKey="scratch.list.premiumDesc" />
      )}
      {!isPremium && campaigns.length > 0 && <Notice tone="warning" text={t('scratch.list.readOnly')} />}
      {isPremium && isTeamMember && <Notice text={t('scratch.list.ownerOnly')} />}
      {!isPremium && (
        <Button label={t('messages.discoverPremium')} onPress={() => router.push('/plan')} />
      )}

      {campaigns.length === 0 && isPremium && !isLoading && (
        <View style={[styles.empty, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <Ticket size={ms(36)} color={theme.primary} strokeWidth={1.6} />
          <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{t('scratch.list.empty')}</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>{t('scratch.list.intro')}</Text>
          <Text style={[styles.emptyHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('scratch.list.emptyHint')}</Text>
          {canManage && <Button icon={Plus} label={t('scratch.list.create')} onPress={() => router.push('/scratch-campaigns/create')} />}
        </View>
      )}
      {isError && <Notice tone="danger" text={t('scratch.list.loadError')} />}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('scratch.list.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
        right={canManage && campaigns.length > 0 ? (
          <TouchableOpacity
            onPress={() => router.push('/scratch-campaigns/create')}
            style={[styles.addBtn, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
            accessibilityLabel={t('scratch.list.create')}
          >
            <Plus size={20} color="#FFFFFF" />
          </TouchableOpacity>
        ) : undefined}
      />
      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 14, marginBottom: 14 },
  separator: { height: 10 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  validateCard: { alignItems: 'center', gap: 12, borderRadius: 18, padding: 14 },
  validateIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  validateTitle: { fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  card: { alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, padding: 14 },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: ms(15), fontFamily: 'Lexend_600SemiBold' },
  cardMeta: { fontSize: ms(12), fontFamily: 'Lexend_400Regular', lineHeight: ms(18) },
  empty: { alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 22 },
  emptyTitle: { fontSize: ms(17), fontFamily: 'Lexend_600SemiBold' },
  emptyHint: { fontSize: ms(13), lineHeight: ms(20), fontFamily: 'Lexend_400Regular', textAlign: 'center' },
});
