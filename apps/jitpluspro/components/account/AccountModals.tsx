import { useRef, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { Camera, Trash2 } from 'lucide-react-native';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { ActionButton } from '@/components/ui/ActionButton';
import BottomSheet from '@/components/ui/BottomSheet';
import { hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import type { Merchant } from '@/types';
import { merchantInitials } from './merchantInitials';

interface MediaModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  merchant: Merchant | null;
  uploadIsPending: boolean;
  onPickPhoto: () => void;
  onDelete: () => void;
}

/**
 * iOS refuses to present the image picker while a RN Modal is still dismissing.
 * We flag the intent, close the sheet, then launch the picker from onDismiss
 * (fires only after the slide-out and the native dismissal complete).
 */
function useDeferredPick(onClose: () => void, onPickPhoto: () => void) {
  const pendingPickRef = useRef(false);
  const handlePickPress = () => {
    if (Platform.OS === 'ios') {
      pendingPickRef.current = true;
      onClose();
    } else {
      onClose();
      requestIdleCallback(() => onPickPhoto());
    }
  };
  const handleDismiss = () => {
    if (pendingPickRef.current) {
      pendingPickRef.current = false;
      onPickPhoto();
    }
  };
  return { handlePickPress, handleDismiss };
}

/** Bottom sheet shared by the logo and cover editors: pick, delete, cancel. */
function MediaEditSheet({
  visible, onClose, theme, onPickPhoto, onDelete,
  preview, title, hint, pickLabel, deleteLabel, cancelLabel,
}: Pick<MediaModalProps, 'visible' | 'onClose' | 'theme' | 'onPickPhoto' | 'onDelete'> & {
  /** Optional preview shown above the title. */
  preview?: ReactNode;
  title: string;
  hint: string;
  pickLabel: string;
  /** Omitted when there is no photo to delete. */
  deleteLabel?: string;
  cancelLabel: string;
}) {
  const { handlePickPress, handleDismiss } = useDeferredPick(onClose, onPickPhoto);

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismiss={handleDismiss} style={styles.sheet}>
      {preview}

      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>

      <ActionButton
        label={pickLabel}
        icon={Camera}
        size="lg"
        onPress={handlePickPress}
        style={styles.pickBtn}
      />

      {deleteLabel ? (
        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: `${theme.danger}35` }]}
          activeOpacity={0.8}
          onPress={onDelete}
          accessibilityRole="button"
        >
          <Trash2 size={ms(16)} color={theme.danger} strokeWidth={icon.stroke} />
          <Text style={[styles.outlineBtnText, { color: theme.danger }]}>{deleteLabel}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.outlineBtn, { borderColor: theme.borderLight }]}
        activeOpacity={0.7}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Text style={[styles.outlineBtnText, { color: theme.textMuted }]}>{cancelLabel}</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

export function LogoEditModal({ t, merchant, uploadIsPending, ...sheet }: MediaModalProps) {
  const { theme } = sheet;
  const hasLogo = !!merchant?.logoUrl;

  return (
    <MediaEditSheet
      {...sheet}
      title={t('account.profilePhoto')}
      hint={hasLogo ? t('account.profilePhotoEditHint') : t('account.profilePhotoAddHint')}
      pickLabel={hasLogo ? t('account.changeProfilePhoto') : t('account.addProfilePhoto')}
      deleteLabel={hasLogo ? t('account.deleteProfilePhoto') : undefined}
      cancelLabel={t('common.cancel')}
      preview={
        <View style={[styles.logoRing, { backgroundColor: palette.violet }]}>
          {uploadIsPending ? (
            <View style={[styles.logoInner, { backgroundColor: theme.bgCard }]}>
              <ActivityIndicator size="large" color={palette.violet} />
            </View>
          ) : merchant?.logoUrl ? (
            <MerchantLogo logoUrl={merchant.logoUrl} style={styles.logoInner} />
          ) : (
            <View style={[styles.logoInner, { backgroundColor: palette.violetDark }]}>
              <Text style={styles.logoInitials}>{merchantInitials(merchant?.nom)}</Text>
            </View>
          )}
        </View>
      }
    />
  );
}

export function CoverEditModal({ t, merchant, ...sheet }: Omit<MediaModalProps, 'uploadIsPending'>) {
  const hasCover = !!merchant?.coverUrl;

  return (
    <MediaEditSheet
      {...sheet}
      title={t('account.coverPhoto')}
      hint={hasCover ? t('account.coverPhotoEditHint') : t('account.coverPhotoAddHint')}
      pickLabel={hasCover ? t('account.changeCoverPhoto') : t('account.addCoverPhoto')}
      deleteLabel={hasCover ? t('account.deleteCoverPhoto') : undefined}
      cancelLabel={t('common.cancel')}
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: ms(24),
    alignItems: 'center',
  },
  logoRing: {
    width: ms(100),
    height: ms(100),
    borderRadius: ms(50),
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(16),
  },
  logoInner: {
    width: ms(94),
    height: ms(94),
    borderRadius: ms(47),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitials: {
    fontSize: ms(32),
    color: '#fff',
    fontFamily: font.semibold,
  },
  title: {
    fontSize: FS.lg,
    fontFamily: font.semibold,
    marginBottom: hp(6),
  },
  hint: {
    fontSize: FS.sm,
    fontFamily: font.regular,
    textAlign: 'center',
    marginBottom: hp(24),
    lineHeight: FS.sm * 1.5,
  },
  pickBtn: {
    width: '100%',
    marginBottom: hp(10),
    borderWidth: 0,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    width: '100%',
    paddingVertical: hp(14),
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: hp(10),
  },
  outlineBtnText: {
    fontSize: FS.md,
    fontFamily: font.semibold,
  },
});
