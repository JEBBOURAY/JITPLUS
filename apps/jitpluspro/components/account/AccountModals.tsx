import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Camera, Trash2, Globe, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { LANGUAGES, type AppLocale } from '@/contexts/LanguageContext';
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
  const initials = merchant?.nom
    ? merchant.nom.split(' ').map((w: string) => w.charAt(0)).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.bottomSheetOverlay} onPress={onClose}>
        <Pressable style={[styles.logoModalSheet, { backgroundColor: theme.bgCard }]} onPress={() => {}}>
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
            onPress={() => {
              onClose();
              setTimeout(onPickPhoto, 350);
            }}
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
            >
              <Trash2 size={ms(16)} color="#EF4444" strokeWidth={1.5} />
              <Text style={[styles.logoModalOutlineBtnText, { color: '#EF4444' }]}>{t('account.deleteProfilePhoto')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.logoModalOutlineBtn, { borderColor: theme.borderLight }]}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Text style={[styles.logoModalOutlineBtnText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Language Selector Modal ── */

interface LanguageModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
  setLocale: (locale: AppLocale) => Promise<void>;
}

export function LanguageModal({
  visible, onClose, theme, t, locale, setLocale,
}: LanguageModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.langModalCard, { backgroundColor: theme.bgCard }]}>
          <View style={[styles.modalIconCircle, { backgroundColor: `${palette.charbon}12` }]}>
            <Globe size={ms(28)} color={palette.charbon} strokeWidth={1.5} />
          </View>
          <Text style={[styles.langModalTitle, { color: theme.text }]}>{t('account.chooseLanguage')}</Text>
          <Text style={[styles.langModalDesc, { color: theme.textMuted }]}>
            {t('account.chooseLanguageDesc')}
          </Text>

          {LANGUAGES.map((lang) => {
            const selected = locale === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={async () => {
                  if (lang.code !== locale) {
                    await setLocale(lang.code);
                    if (lang.code === 'ar' || locale === 'ar') {
                      Alert.alert(t('account.language'), t('account.restartDirectionHint'), [{ text: 'OK' }]);
                    }
                  }
                  onClose();
                }}
                android_ripple={{ color: `${palette.violet}10` }}
                style={({ pressed }) => [
                  styles.langOption,
                  { borderColor: selected ? theme.primary : theme.borderLight },
                  selected && { backgroundColor: `${theme.primary}08` },
                  pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[styles.langOptionText, { color: selected ? theme.primary : theme.text }]}>
                  {lang.label}
                </Text>
                {selected && (
                  <View style={[styles.langCheck, { backgroundColor: theme.primary }]}>
                    <Check size={ms(12)} color="#fff" strokeWidth={3} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
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
    paddingBottom: hp(36),
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

  // Language modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: ms(24),
  },
  modalIconCircle: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(12),
  },
  langModalCard: {
    width: '100%',
    borderRadius: ms(20),
    padding: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  langModalTitle: { fontSize: ms(18), fontWeight: '700', marginBottom: hp(8) },
  langModalDesc: { fontSize: ms(13), textAlign: 'center', marginBottom: hp(16) },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: ms(14),
    borderRadius: ms(14),
    borderWidth: 1.5,
    marginBottom: hp(10),
    gap: ms(12),
  },
  langFlag: { fontSize: ms(22) },
  langOptionText: { flex: 1, fontSize: FS.md, fontWeight: '600' },
  langCheck: {
    width: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
