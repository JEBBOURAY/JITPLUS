import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, ActivityIndicator, Platform, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import type { Merchant } from '@/types';

/* ── Logo Edit Bottom Sheet ── */

interface LogoModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  merchant: Merchant | null;
  uploadIsPending: boolean;
  onPickPhoto: () => void;
  onDelete: () => void;
}

export function LogoEditModal({
  visible, onClose, theme, t, merchant, uploadIsPending, onPickPhoto, onDelete,
}: LogoModalProps) {
  const insets = useSafeAreaInsets();
  // iOS refuses to present the image picker while a RN Modal is still dismissing.
  // We flag the intent, close the modal, then launch the picker from onDismiss
  // (fires only after the native dismissal completes).
  const pendingPickRef = useRef(false);
  const handlePickPress = () => {
    if (Platform.OS === 'ios') {
      pendingPickRef.current = true;
      onClose();
    } else {
      onClose();
      InteractionManager.runAfterInteractions(() => onPickPhoto());
    }
  };
  const handleDismiss = () => {
    if (pendingPickRef.current) {
      pendingPickRef.current = false;
      onPickPhoto();
    }
  };
  const initials = merchant?.nom
    ? merchant.nom.split(' ').map((w: string) => w.charAt(0)).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose} onDismiss={handleDismiss}>
      <Pressable style={styles.bottomSheetOverlay} onPress={onClose}>
        <Pressable
          style={[styles.logoModalSheet, { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom + hp(16), hp(36)) }]}
          onPress={() => {}}
        >
          <View style={[styles.sheetHandle, { backgroundColor: `${palette.charbon}20` }]} />

          <View style={styles.logoModalPreviewRow}>
            <LinearGradient
              colors={['#A78BFA', '#7C3AED', '#1F2937']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoModalRing}
            >
              {uploadIsPending ? (
                <View style={[styles.logoModalInner, { backgroundColor: theme.bgCard }]}>
                  <ActivityIndicator size="large" color={palette.violet} />
                </View>
              ) : merchant?.logoUrl ? (
                <MerchantLogo logoUrl={merchant.logoUrl} style={styles.logoModalInner} />
              ) : (
                <LinearGradient
                  colors={[palette.charbon, palette.violet]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoModalInner}
                >
                  <Text style={styles.logoModalInitials}>{initials}</Text>
                </LinearGradient>
              )}
            </LinearGradient>
          </View>

          <Text style={[styles.logoModalTitle, { color: theme.text }]}>{t('account.profilePhoto')}</Text>
          <Text style={[styles.logoModalSubtitle, { color: theme.textMuted }]}>
            {merchant?.logoUrl ? t('account.profilePhotoEditHint') : t('account.profilePhotoAddHint')}
          </Text>

          <TouchableOpacity
            style={styles.logoModalBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            onPress={handlePickPress}
          >
            <LinearGradient
              colors={['#7C3AED', '#5B21B6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoModalBtnGradient}
            >
              <Camera size={ms(18)} color="#fff" strokeWidth={2} />
              <Text style={styles.logoModalBtnText}>
                {merchant?.logoUrl ? t('account.changeProfilePhoto') : t('account.addProfilePhoto')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {!!merchant?.logoUrl && (
            <TouchableOpacity
              style={[styles.logoModalOutlineBtn, { borderColor: '#EF444435' }]}
              activeOpacity={0.8}
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={t('account.deleteProfilePhoto')}
            >
              <Trash2 size={ms(16)} color="#EF4444" strokeWidth={1.5} />
              <Text style={[styles.logoModalOutlineBtnText, { color: '#EF4444' }]}>{t('account.deleteProfilePhoto')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.logoModalOutlineBtn, { borderColor: theme.borderLight }]}
            activeOpacity={0.7}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={[styles.logoModalOutlineBtnText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Cover Edit Bottom Sheet ── */

export function CoverEditModal({
  visible, onClose, theme, t, merchant, uploadIsPending, onPickPhoto, onDelete,
}: LogoModalProps) {
  const insets = useSafeAreaInsets();
  // Same iOS constraint as the logo modal: defer picker launch to onDismiss.
  const pendingPickRef = useRef(false);
  const handlePickPress = () => {
    if (Platform.OS === 'ios') {
      pendingPickRef.current = true;
      onClose();
    } else {
      onClose();
      InteractionManager.runAfterInteractions(() => onPickPhoto());
    }
  };
  const handleDismiss = () => {
    if (pendingPickRef.current) {
      pendingPickRef.current = false;
      onPickPhoto();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose} onDismiss={handleDismiss}>
      <Pressable style={styles.bottomSheetOverlay} onPress={onClose}>
        <Pressable
          style={[styles.logoModalSheet, { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom + hp(16), hp(36)) }]}
          onPress={() => {}}
        >
          <View style={[styles.sheetHandle, { backgroundColor: `${palette.charbon}20` }]} />

          <Text style={[styles.logoModalTitle, { color: theme.text, marginTop: hp(16) }]}>{t('account.coverPhoto')}</Text>
          <Text style={[styles.logoModalSubtitle, { color: theme.textMuted }]}>
            {merchant?.coverUrl ? t('account.coverPhotoEditHint') : t('account.coverPhotoAddHint')}
          </Text>

          <TouchableOpacity
            style={styles.logoModalBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            onPress={handlePickPress}
          >
            <LinearGradient
              colors={['#7C3AED', '#5B21B6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoModalBtnGradient}
            >
              <Camera size={ms(18)} color="#fff" strokeWidth={2} />
              <Text style={styles.logoModalBtnText}>
                {merchant?.coverUrl ? t('account.changeCoverPhoto') : t('account.addCoverPhoto')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {!!merchant?.coverUrl && (
            <TouchableOpacity
              style={[styles.logoModalOutlineBtn, { borderColor: '#EF444435' }]}
              activeOpacity={0.8}
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={t('account.deleteCoverPhoto')}
            >
              <Trash2 size={ms(16)} color="#EF4444" strokeWidth={1.5} />
              <Text style={[styles.logoModalOutlineBtnText, { color: '#EF4444' }]}>{t('account.deleteCoverPhoto')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.logoModalOutlineBtn, { borderColor: theme.borderLight }]}
            activeOpacity={0.7}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={[styles.logoModalOutlineBtnText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Logo bottom sheet
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  logoModalSheet: {
    borderTopLeftRadius: ms(24),
    borderTopRightRadius: ms(24),
    paddingTop: hp(14),
    paddingHorizontal: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  sheetHandle: {
    width: ms(40),
    height: ms(4),
    borderRadius: ms(2),
    marginBottom: hp(20),
  },
  logoModalPreviewRow: { marginBottom: hp(16) },
  logoModalRing: {
    width: ms(100),
    height: ms(100),
    borderRadius: ms(50),
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoModalInner: {
    width: ms(94),
    height: ms(94),
    borderRadius: ms(47),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoModalInitials: {
    fontSize: ms(32),
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  logoModalTitle: {
    fontSize: FS.lg,
    fontWeight: '700',
    marginBottom: hp(6),
  },
  logoModalSubtitle: {
    fontSize: FS.sm,
    textAlign: 'center',
    marginBottom: hp(24),
    lineHeight: FS.sm * 1.5,
  },
  logoModalBtn: {
    width: '100%',
    borderRadius: ms(14),
    overflow: 'hidden',
    marginBottom: hp(10),
  },
  logoModalBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    paddingVertical: hp(15),
  },
  logoModalBtnText: {
    color: '#fff',
    fontSize: FS.md,
    fontWeight: '700',
  },
  logoModalOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    width: '100%',
    paddingVertical: hp(14),
    borderRadius: ms(14),
    borderWidth: 1,
    marginBottom: hp(10),
  },
  logoModalOutlineBtnText: {
    fontSize: FS.md,
    fontWeight: '600',
  },
});
