import { useCallback } from 'react';
import { useGuardedCallback } from './useGuardedCallback';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/utils/error';
import { Store as StoreType } from '@/types';
import type { CreateStorePayload } from '@/types';
import { useStores, useCreateStore, useUpdateStore, useDeleteStore, queryKeys } from './useQueryHooks';
import { useLanguage } from '@/contexts/LanguageContext';

export const MAX_STORES = 10;

/**
 * Shared hook for Store CRUD operations.
 * Backed by React Query for caching, deduplication, and stale-while-revalidate.
 * Form state is intentionally kept in each consumer.
 */
export function useStoresCRUD() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { data: stores = [], isLoading: loading, isRefetching: refreshing } = useStores();
  const createMutation = useCreateStore();
  const updateMutation = useUpdateStore();
  const deleteMutation = useDeleteStore();

  const saving = createMutation.isPending || updateMutation.isPending;

  // ── Refresh ──
  const loadStores = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.stores });
  }, [qc]);

  const onRefresh = useGuardedCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.stores });
  }, [qc]);

  // ── Can create? ──
  const canCreateStore = stores.length < MAX_STORES;

  const alertMaxStores = () => {
    Alert.alert(t('storesCrud.limitTitle'), t('storesCrud.limitMsg', { max: MAX_STORES }));
  };

  // ── Save (create or update) ──
  const saveStore = async (
    payload: CreateStorePayload,
    editingStoreId?: string,
  ): Promise<boolean> => {
    if (!payload.nom?.trim()) {
      Alert.alert(t('common.error'), t('storesCrud.nameRequired'));
      return false;
    }
    try {
      if (editingStoreId) {
        await updateMutation.mutateAsync({ id: editingStoreId, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      return true;
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('storesCrud.saveError')));
      return false;
    }
  };

  // ── Delete ──
  const deleteStore = (store: StoreType) => {
    Alert.alert(
      t('storesCrud.deleteTitle'),
      t('storesCrud.deleteMsg', { name: store.nom }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(store.id);
            } catch {
              Alert.alert(t('common.error'), t('storesCrud.deleteError'));
            }
          },
        },
      ],
    );
  };

  // ── Toggle active ──
  const toggleActive = async (store: StoreType) => {
    try {
      await updateMutation.mutateAsync({ id: store.id, payload: { isActive: !store.isActive } });
    } catch {
      Alert.alert(t('common.error'), t('storesCrud.toggleError'));
    }
  };

  return {
    stores,
    loading,
    refreshing,
    saving,
    loadStores,
    onRefresh,
    canCreateStore,
    alertMaxStores,
    saveStore,
    deleteStore,
    toggleActive,
  };
}
