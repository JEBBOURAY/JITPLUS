import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Linking,
  Alert,
  Modal,
  Animated,
} from 'react-native';
import { Mail, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212755073325';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'contact@jitplus.com';

// Channel colours from the design system.
const EMAIL_COLOR = '#EA4335';
const WHATSAPP_COLOR = '#25D366';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Floating speed-dial for the "Support" tab. Rendered as a transparent overlay
 * (no navigation) with two contact actions — E-mail (top) and WhatsApp (bottom,
 * closest to the tab bar). Cascade fade/slide/scale in, dim backdrop, Android
 * back + outside-tap to dismiss.
 */
export default function SupportSpeedDial({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // Keep the Modal mounted during the close animation.
  const [mounted, setMounted] = useState(visible);

  const overlay = useRef(new Animated.Value(0)).current;
  // Index 0 = E-mail (top, appears first), 1 = WhatsApp (bottom, appears last).
  const items = useRef([new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlay, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.stagger(
          40,
          items.map((a) =>
            Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }),
          ),
        ),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlay, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.stagger(
          30,
          [...items].reverse().map((a) =>
            Animated.timing(a, { toValue: 0, duration: 120, useNativeDriver: true }),
          ),
        ),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const openWhatsApp = useCallback(async () => {
    onClose();
    // wa.me opens the app if installed, otherwise falls back to WhatsApp Web —
    // no extra package or canOpenURL manifest query needed.
    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t('account.contactSupportMsg'))}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('common.genericError'));
    }
  }, [onClose, t]);

  const openEmail = useCallback(async () => {
    onClose();
    const subject = encodeURIComponent('JitPlus Pro — Support');
    const body = encodeURIComponent(t('account.contactSupportMsg'));
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('common.genericError'));
    }
  }, [onClose, t]);

  const itemStyle = (a: Animated.Value) => ({
    opacity: a,
    transform: [
      { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
    ],
  });

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Dim backdrop — tap to dismiss */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: overlay }]} />
      </Pressable>

      {/* Speed-dial items — just above the floating tab bar, right-aligned */}
      <View
        pointerEvents="box-none"
        style={[styles.dial, { bottom: insets.bottom + 96 }]}
      >
        {/* E-mail (top) */}
        <Animated.View style={[styles.itemRow, itemStyle(items[0])]}>
          <View style={styles.pill}>
            <Text style={styles.pillText} maxFontSizeMultiplier={1.3}>
              {t('account.contactViaEmail')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: EMAIL_COLOR }]}
            onPress={openEmail}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('account.contactViaEmail')}
          >
            <Mail size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </Animated.View>

        {/* WhatsApp (bottom, closest to the bar) */}
        <Animated.View style={[styles.itemRow, itemStyle(items[1])]}>
          <View style={styles.pill}>
            <Text style={styles.pillText} maxFontSizeMultiplier={1.3}>
              {t('account.contactViaWhatsApp')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: WHATSAPP_COLOR }]}
            onPress={openWhatsApp}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('account.contactViaWhatsApp')}
          >
            <MessageCircle size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dial: {
    position: 'absolute',
    right: 20,
    alignItems: 'flex-end',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginBottom: 14,
  },
  pill: {
    backgroundColor: 'rgba(31,41,55,0.92)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  pillText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Lexend_600SemiBold',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
