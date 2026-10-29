import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/utils/error';
import type { CreateStorePayload, Store as StoreType } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGuardedCallback } from './useGuardedCallback';
import { useStores, useCreateStore, useUpdateStore, useDeleteStore, queryKeys } from './useQueryHooks';

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
  // mutateAsync is stable across renders, unlike the mutation result objects,
  // so the callbacks below keep their identity for memoized consumers.
  const { mutateAsync: createStore, isPending: creating } = useCreateStore();
  const { mutateAsync: updateStore, isPending: updating } = useUpdateStore();
  const { mutateAsync: deleteStore } = useDeleteStore();

  const saving = creating || updating;

  const onRefresh = useGuardedCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.stores });
  }, [qc]);

  const canCreateStore = stores.length < MAX_STORES;

  const alertMaxStores = useCallback(() => {
    Alert.alert(t('storesCrud.limitTitle'), t('storesCrud.limitMsg', { max: MAX_STORES }));
  }, [t]);

  const saveStore = useCallback(async (
    payload: CreateStorePayload,
    editingStoreId?: string,
  ): Promise<boolean> => {
    if (!payload.nom?.trim()) {
      Alert.alert(t('common.error'), t('storesCrud.nameRequired'));
      return false;
    }
    try {
      if (editingStoreId) {
        await updateStore({ id: editingStoreId, payload });
      } else {
        await createStore(payload);
      }
      return true;
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('storesCrud.saveError')));
      return false;
    }
  }, [createStore, updateStore, t]);

  // No confirmation here: the caller drives its own confirmation UI.
  const deleteStoreDirect = useCallback(async (store: StoreType): Promise<boolean> => {
    try {
      await deleteStore(store.id);
      return true;
    } catch {
      Alert.alert(t('common.error'), t('storesCrud.deleteError'));
      return false;
    }
  }, [deleteStore, t]);

  const toggleActive = useCallback(async (store: StoreType): Promise<boolean> => {
    try {
      await updateStore({ id: store.id, payload: { isActive: !store.isActive } });
      return true;
    } catch {
      Alert.alert(t('common.error'), t('storesCrud.toggleError'));
      return false;
    }
  }, [updateStore, t]);

  return {
    stores,
    loading,
    refreshing,
    saving,
    onRefresh,
    canCreateStore,
    alertMaxStores,
    saveStore,
    deleteStoreDirect,
    toggleActive,
  };
}
