import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import StorePreviewScreen from '@/components/store-preview/StorePreviewScreen';
import StoreFormScreen from '@/components/stores/StoreFormScreen';

export default function StorePreviewRoute() {
  const params = useLocalSearchParams<{ mode?: string | string[]; view?: string | string[]; storeId?: string | string[] }>();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const storeIdParam = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;

  const mode: 'create' | 'edit' = modeParam === 'create' ? 'create' : 'edit';
  const isPreviewOnly = viewParam === 'preview';

  if (!isPreviewOnly) {
    return <StoreFormScreen mode={mode} storeId={storeIdParam} initialView="edit" />;
  }

  return <StorePreviewScreen />;
}
