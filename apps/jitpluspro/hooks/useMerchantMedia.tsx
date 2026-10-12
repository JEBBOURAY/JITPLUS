import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useAuthState, useAuthActions } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getErrorMessage } from '@/utils/error';
import {
  useUploadMerchantLogo,
  useDeleteMerchantLogo,
  useUploadMerchantCover,
  useDeleteMerchantCover,
} from '@/hooks/useQueryHooks';
import PremiumLockModal from '@/components/PremiumLockModal';
import { LogoEditModal, CoverEditModal } from '@/components/account/AccountModals';

/**
 * Logo and cover photo editing (pick, upload, delete) with their bottom
 * sheets. Render `modals` once in the screen that uses the hook.
 */
export function useMerchantMedia() {
  const { merchant, isTeamMember } = useAuthState();
  const { updateMerchant } = useAuthActions();
  const theme = useTheme();
  const { t } = useLanguage();
  const uploadLogo = useUploadMerchantLogo();
  const deleteLogo = useDeleteMerchantLogo();
  const uploadCover = useUploadMerchantCover();
  const deleteCover = useDeleteMerchantCover();
  const [sheet, setSheet] = useState<'logo' | 'cover' | 'logoLocked' | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  const isPremium = merchant?.plan === 'PREMIUM';
  const merchantName = merchant?.nom;

  const pickLogo = useCallback(async () => {
    if (uploadLogo.isPending) return;
    try {
      // Lazy-loaded: the native module is only needed once the user edits a photo.
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const { url } = await uploadLogo.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType, merchantName });
      updateMerchant({ logoUrl: url });
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('account.logoUploadError')));
    }
  }, [uploadLogo, merchantName, updateMerchant, t]);

  const pickCover = useCallback(async () => {
    if (uploadCover.isPending) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      // No pre-flight permission request: the system picker does not need
      // library access (same as pickLogo and the gallery picker).
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const { url } = await uploadCover.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        merchantName,
        fileSize: asset.fileSize,
      });
      updateMerchant({ coverUrl: url });
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('account.coverUploadError')));
    }
  }, [uploadCover, merchantName, updateMerchant, t]);

  const removeLogo = useCallback(() => {
    setSheet(null);
    Alert.alert(t('account.logoDeleteConfirmTitle'), t('account.logoDeleteConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteProfilePhoto'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLogo.mutateAsync();
            updateMerchant({ logoUrl: undefined });
          } catch (err) {
            Alert.alert(t('common.error'), getErrorMessage(err, t('account.logoDeleteError')));
          }
        },
      },
    ]);
  }, [deleteLogo, updateMerchant, t]);

  const removeCover = useCallback(() => {
    setSheet(null);
    Alert.alert(t('account.coverDeleteConfirmTitle'), t('account.coverDeleteConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteCoverPhoto'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCover.mutateAsync();
            updateMerchant({ coverUrl: undefined });
          } catch (err) {
            Alert.alert(t('common.error'), getErrorMessage(err, t('account.coverDeleteError')));
          }
        },
      },
    ]);
  }, [deleteCover, updateMerchant, t]);

  const openLogo = useCallback(() => {
    if (isTeamMember) {
      Alert.alert(t('account.logoOwnerOnly'), t('account.logoOwnerOnlyMsg'));
      return;
    }
    setSheet(isPremium ? 'logo' : 'logoLocked');
  }, [isPremium, isTeamMember, t]);

  const openCover = useCallback(() => {
    if (isTeamMember) {
      Alert.alert(t('account.logoOwnerOnly'), t('account.logoOwnerOnlyMsg'));
      return;
    }
    setSheet('cover');
  }, [isTeamMember, t]);

  const modals = (
    <>
      <LogoEditModal
        visible={sheet === 'logo'}
        onClose={closeSheet}
        theme={theme}
        t={t}
        merchant={merchant}
        uploadIsPending={uploadLogo.isPending}
        onPickPhoto={pickLogo}
        onDelete={removeLogo}
      />
      <CoverEditModal
        visible={sheet === 'cover'}
        onClose={closeSheet}
        theme={theme}
        t={t}
        merchant={merchant}
        uploadIsPending={uploadCover.isPending}
        onPickPhoto={pickCover}
        onDelete={removeCover}
      />
      <PremiumLockModal
        visible={sheet === 'logoLocked'}
        onClose={closeSheet}
        titleKey="account.logoProTitle"
        descKey="account.logoProMsg"
      />
    </>
  );

  return {
    openLogo,
    openCover,
    logoUploading: uploadLogo.isPending,
    coverUploading: uploadCover.isPending,
    modals,
  };
}
