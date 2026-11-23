import { useCallback } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text } from '@/components/AppText';
import { Edit3, Play, Square, Trash2 } from 'lucide-react-native';
import { JitBell } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useActivateCollection, useCollection, useDeleteCollection, useEndCollection, useOtherActiveCollection } from '@/hooks/useCollectionHooks';
import { getErrorMessage } from '@/utils/error';
import { isolate } from '@/utils/bidi';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { Button, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import { HelpText } from '@/components/games/GameWizard';
import { Kpi, KpiRow } from '@/components/games/Kpi';
import { GameDetailMissing, GameScreenLoading, useBackTo } from '@/components/games/GameScreen';
import { useGamePush } from '@/components/games/useGamePush';
import { CollectionStatusPill, CollectionSteps, collectionPushMessage, collectionRuleLines } from '@/components/collection/CollectionUI';
import { availableActions } from '@/components/collection/collectionForm';

export default function CollectionDetailScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);

  const query = useCollection(id, !shouldWait);
  const collection = query.data;
  const activate = useActivateCollection();
  const end = useEndCollection();
  const remove = useDeleteCollection();
  const push = useGamePush();
  const otherActive = useOtherActiveCollection(id, !shouldWait && !isTeamMember);

  const fail = useCallback((e: unknown) => toast.error(getErrorMessage(e, t('common.genericError'))), [t]);
  const goBack = useBackTo('/collections');

  const confirmLaunch = useCallback(() => {
    // Only one collection runs at a time: say it before the launch is refused.
    if (otherActive) {
      Alert.alert(t('collection.wizard.activeExistsTitle'), t('collection.wizard.activeExistsBodyDraft', { name: isolate(otherActive.name) }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('collection.wizard.activeExistsOpen'), onPress: () => router.push({ pathname: '/collections/[id]', params: { id: otherActive.id } }) },
      ]);
      return;
    }
    Alert.alert(t('collection.wizard.launchTitle'), t('collection.wizard.launchBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('collection.wizard.launch'),
        onPress: () => activate.mutateAsync(id).then(
          (launched) => push.offer(t('collection.wizard.launchedTitle'), collectionPushMessage(t, launched)),
          fail,
        ),
      },
    ]);
  }, [otherActive, activate, push, id, router, t, fail]);

  const confirmEnd = useCallback(() => {
    Alert.alert(t('collection.detail.endTitle'), t('collection.detail.endConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('collection.detail.end'), style: 'destructive', onPress: () => end.mutateAsync(id).catch(fail) },
    ]);
  }, [end, id, t, fail]);

  const confirmDelete = useCallback(() => {
    Alert.alert(t('collection.detail.delete'), t('collection.detail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutateAsync(id).then(goBack, fail) },
    ]);
  }, [remove, id, t, fail, goBack]);

  if (shouldWait) return null;

  if (query.isLoading) return <GameScreenLoading />;
  if (!collection) return <GameDetailMissing title={t('collection.title')} onBack={goBack} ns="collection" query={query} />;

  // Launching needs the plan; ending and deleting stay possible after it expired.
  const actions = isTeamMember ? [] : availableActions(collection.status).filter((a) => isPremium || a === 'end' || a === 'delete');
  const busy = activate.isPending || end.isPending || remove.isPending;
  const number = (n: number) => n.toLocaleString(getIntlLocale(locale));
  const rules = collectionRuleLines(t, locale, {
    onePerVisit: collection.onePerVisit,
    repeatable: collection.repeatable,
    giftNextDay: collection.giftDelayHours > 0,
    couponValidityDays: collection.couponValidityDays,
    endsOn: collection.endsAt ? moroccoYmdOf(new Date(collection.endsAt)) : '',
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={collection.name} wrap onBack={goBack} right={<CollectionStatusPill status={collection.status} />} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {collection.status === 'DRAFT' && <Notice text={t('collection.detail.draftNote')} />}
        {collection.status === 'ENDED' && <Notice text={t('collection.detail.endedNote')} />}

        {collection.status !== 'DRAFT' && (
          <KpiRow>
            <Kpi label={t('collection.detail.participants')} value={number(collection.participants)} />
            <Kpi label={t('collection.detail.completed')} value={number(collection.completed)} />
            <Kpi label={t('collection.detail.giftsUsed')} value={number(collection.giftsUsed)} />
          </KpiRow>
        )}

        <Section title={t('collection.detail.itemsTitle')}>
          <CollectionSteps
            items={collection.items.map((i) => ({
              key: i.id,
              label: i.label,
              imageUrl: i.imageUrl,
              meta: collection.status === 'DRAFT' ? undefined : t('collection.detail.itemChecks', { count: i.checks }),
            }))}
            gift={collection.giftLabel}
            giftImageUrl={collection.giftImageUrl}
            giftCaption={t('collection.detail.gift')}
          />
          {collection.status !== 'DRAFT' && <HelpText text={t('collection.detail.itemsHint')} />}
        </Section>

        <Section title={t('collection.detail.rulesTitle')}>
          {rules.map((rule) => (
            <Text key={rule} style={[styles.rule, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
              {rule}
            </Text>
          ))}
        </Section>

        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.includes('activate') && (
              <Button icon={Play} label={t('collection.detail.activate')} onPress={confirmLaunch} loading={activate.isPending} />
            )}
            {actions.includes('push') && (
              <Button
                icon={JitBell}
                label={t('collection.detail.push')}
                onPress={() => push.prompt(collectionPushMessage(t, collection))}
                loading={push.isPending}
              />
            )}
            {actions.includes('edit') && (
              <Button
                variant="secondary"
                icon={Edit3}
                label={t('collection.detail.edit')}
                onPress={() => router.push({ pathname: '/collections/create', params: { id: collection.id } })}
                disabled={busy}
              />
            )}
            {actions.includes('end') && (
              <Button variant="danger" icon={Square} label={t('collection.detail.end')} onPress={confirmEnd} loading={end.isPending} />
            )}
            {actions.includes('delete') && (
              <Button variant="ghost" icon={Trash2} label={t('collection.detail.delete')} onPress={confirmDelete} loading={remove.isPending} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  actions: { gap: 10 },
  rule: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular },
});
