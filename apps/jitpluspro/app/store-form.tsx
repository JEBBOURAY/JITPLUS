import { useLocalSearchParams } from 'expo-router';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import StoreFormScreen from '@/components/stores/StoreFormScreen';

/** `/store-form?mode=create` or `/store-form?storeId=<id>`. */
export default function StoreFormRoute() {
  const shouldWait = useRequireAuth();
  const { mode, storeId } = useLocalSearchParams<{ mode?: string; storeId?: string }>();
  if (shouldWait) return null;
  return <StoreFormScreen mode={mode === 'create' ? 'create' : 'edit'} storeId={storeId} />;
}
