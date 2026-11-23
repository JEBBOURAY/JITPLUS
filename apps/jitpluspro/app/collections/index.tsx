import { memo, useCallback, useMemo } from 'react';
import { Image } from 'expo-image';
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Text } from '@/components/AppText';
import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CollectionListItem } from '@jitplus/shared/src/collection';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useCollections } from '@/hooks/useCollectionHooks';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { Button, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';
import { CampaignRow, GameEmptyState, GamePremiumLock, HeaderAddButton, ListSeparator } from '@/components/games/GameList';
import { CollectionStatusPill, CollectionTile } from '@/components/collection/CollectionUI';

// Same artwork as the "Collection" card of the Jeux page.
const COLLECTION_IMAGE = require('@/assets/images/tools/cadeaux.png');

const CollectionRow = memo(function CollectionRow({ collection, onOpen }: {
  collection: CollectionListItem;
  onOpen: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <CampaignRow
      leading={<CollectionTile size={ms(52)} />}
      title={collection.name}
      status={<CollectionStatusPill status={collection.status} />}
      lines={[
        { text: t('collection.list.products', { count: collection.items.length, gift: collection.giftLabel }) },
        {
          text: t('collection.list.stats', { participants: collection.participants, completed: collection.completed }),
          tone: 'secondary',
        },
      ]}
      onPress={() => onOpen(collection.id)}
      accessibilityLabel={`${collection.name}, ${t(`collection.status.${collection.status}`)}`}
    />
  );
});

export default function CollectionsListScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;
  const enabled = !shouldWait && isPremium;

  const query = useCollections(enabled);
  const collections = useMemo(() => query.data ?? [], [query.data]);

  const open = useCallback((id: string) => router.push({ pathname: '/collections/[id]', params: { id } }), [router]);
  const create = useCallback(() => router.push('/collections/create'), [router]);
  const renderItem = useCallback(
    ({ item }: { item: CollectionListItem }) => <CollectionRow collection={item} onOpen={open} />,
    [open],
  );

  if (shouldWait) return null;

  const loading = enabled && query.isLoading;

  const header = (
    <View style={styles.headerContent}>
      {!isPremium && <GamePremiumLock ns="collection" />}
      {isPremium && isTeamMember && <Notice text={t('collection.list.ownerOnly')} />}
      {query.isError && <Notice tone="danger" text={t('collection.list.loadError')} />}

      {isPremium && collections.length === 0 && !loading && !query.isError && (
        <GameEmptyState
          visual={<Image source={COLLECTION_IMAGE} style={styles.emptyImage} contentFit="contain" accessible={false} />}
          title={t('collection.list.emptyTitle')}
          text={t('collection.list.intro')}
          steps={[t('collection.list.how1'), t('collection.list.how2'), t('collection.list.how3')]}
          action={canManage ? <Button icon={Plus} label={t('collection.list.create')} onPress={create} style={styles.stretch} /> : undefined}
        />
      )}

      {collections.length > 0 && (
        <Text style={[styles.blockTitle, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {t('collection.list.collections')}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('collection.title')}
        right={canManage && collections.length > 0 ? <HeaderAddButton label={t('collection.list.create')} onPress={create} /> : undefined}
      />
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={ListSeparator}
          refreshControl={enabled ? (
            <RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={theme.primary} colors={[theme.primary]} />
          ) : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 14, marginBottom: 10 },
  stretch: { alignSelf: 'stretch' },
  emptyImage: { width: 104, height: 104 },
  blockTitle: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3, marginTop: 4 },
});
