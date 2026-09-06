import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';

// Place the poster image at this path — see components/WelcomePosterModal.tsx usage.
const posterImage = require('@/assets/images/welcome-poster.png');

/**
 * One-time ecosystem poster shown on the Accueil screen after login.
 * Dismissing it (X or "Compris") persists locally — it never reappears on this device.
 */
export default function WelcomePosterModal() {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.WELCOME_POSTER_DISMISSED)
      .then((v) => { if (active) setDismissed(v === 'true'); })
      .catch(() => { if (active) setDismissed(false); });
    return () => { active = false; };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(ASYNC_STORAGE_KEYS.WELCOME_POSTER_DISMISSED, 'true').catch(() => {});
  }, []);

  if (dismissed !== false) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          onPress={dismiss}
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <X size={22} color="#fff" strokeWidth={2} />
        </TouchableOpacity>

        <View style={[styles.imageWrap, { paddingTop: insets.top + 56, paddingBottom: 8 }]}>
          <Image source={posterImage} style={styles.poster} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>

        <TouchableOpacity
          onPress={dismiss}
          style={[styles.gotItBtn, { backgroundColor: theme.primary, marginBottom: insets.bottom + 16 }]}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.gotItText}>{t('common.gotIt')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,10,30,0.94)',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    flex: 1,
    paddingHorizontal: 16,
  },
  poster: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gotItBtn: {
    marginHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  gotItText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
});
