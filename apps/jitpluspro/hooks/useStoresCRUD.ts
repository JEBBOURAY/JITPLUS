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

  const onRefresh = useGuardedCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.stores });
  }, [qc]);

  const canCreateStore = stores.length < MAX_STORES;

  const alertMaxStores = () => {
    Alert.alert(t('storesCrud.limitTitle'), t('storesCrud.limitMsg', { max: MAX_STORES }));
  };

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

  // No confirmation here: the caller drives its own confirmation UI.
  const deleteStoreDirect = async (store: StoreType): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(store.id);
      return true;
    } catch {
      Alert.alert(t('common.error'), t('storesCrud.deleteError'));
      return false;
    }
  };

  const toggleActive = async (store: StoreType): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync({ id: store.id, payload: { isActive: !store.isActive } });
      return true;
    } catch {
      Alert.alert(t('common.error'), t('storesCrud.toggleError'));
      return false;
    }
  };

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
