import { useCallback, useState } from 'react';
import { useGuardedCallback } from './useGuardedCallback';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/utils/error';
import { Store as StoreType } from '@/types';
import { useStores, useCreateStore, useUpdateStore, useDeleteStore, queryKeys } from './useQueryHooks';

export const MAX_STORES = 10;

/**
 * Shared hook for Store CRUD operations.
 * Backed by React Query for caching, deduplication, and stale-while-revalidate.
 * Form state is intentionally kept in each consumer.
 */
export function useStoresCRUD({ silentLoadError = false }: { silentLoadError?: boolean } = {}) {
  const qc = useQueryClient();
  const { data: stores = [], isLoading: loading, isRefetching } = useStores();
  const createMutation = useCreateStore();
  const updateMutation = useUpdateStore();
  const deleteMutation = useDeleteStore();

  const [refreshing, setRefreshing] = useState(false);

  const saving = createMutation.isPending || updateMutation.isPending;

  // ── Refresh ──
  const loadStores = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.stores });
  }, [qc]);

  const onRefresh = useGuardedCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: queryKeys.stores });
    setRefreshing(false);
  }, [qc]);

  // ── Can create? ──
  const canCreateStore = stores.length < MAX_STORES;

  const alertMaxStores = () => {
    Alert.alert('Limite atteinte', `Vous ne pouvez pas dépasser ${MAX_STORES} magasins.`);
  };

  // ── Save (create or update) ──
  const saveStore = async (
    payload: Record<string, any>,
    editingStoreId?: string,
  ): Promise<boolean> => {
    if (!payload.nom?.trim()) {
      Alert.alert('Erreur', 'Le nom du magasin est obligatoire.');
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
      Alert.alert('Erreur', getErrorMessage(err, 'Erreur lors de la sauvegarde.'));
      return false;
    }
  };

  // ── Delete ──
  const deleteStore = (store: StoreType) => {
    Alert.alert(
      'Supprimer ce magasin ?',
      `"${store.nom}" sera définitivement supprimé.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(store.id);
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer le magasin.');
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
      Alert.alert('Erreur', 'Impossible de modifier le statut.');
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
