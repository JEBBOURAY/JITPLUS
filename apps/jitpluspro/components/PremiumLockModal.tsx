import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Info, Sparkles, X, Crown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface PremiumLockModalProps {
  visible: boolean;
  onClose: () => void;
  titleKey: string;
  descKey: string;
}

export default function PremiumLockModal({ visible, onClose, titleKey, descKey }: PremiumLockModalProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const handleUpgrade = () => {
    onClose();
    router.push('/plan');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
        <Pressable style={styles.sheetOuter} onPress={(e) => e.stopPropagation()} accessibilityRole="summary" accessibilityViewIsModal={true}>
          {/* Sheet */}
          <LinearGradient
            colors={['#120826', palette.premiumBg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.sheet, { borderColor: palette.premiumBorder }]}
          >
            {/* Close button */}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7} hitSlop={10}>
              <X size={18} color={palette.charbonUltraLight} strokeWidth={2} />
            </TouchableOpacity>

            {/* Crown icon */}
            <View style={styles.iconWrap}>
              <LinearGradient
                colors={[palette.violetDark, palette.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <Crown size={30} color={palette.gold} strokeWidth={1.8} />
              </LinearGradient>
            </View>

            {/* PRO badge */}
            <View style={styles.proBadge}>
              <Sparkles size={10} color={palette.gold} strokeWidth={2} />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{t(titleKey)}</Text>

            {/* Description */}
            <Text style={[styles.desc, { color: palette.charbonUltraLight }]}>{t(descKey)}</Text>

            {/* Info CTA */}
            <TouchableOpacity onPress={handleUpgrade} activeOpacity={0.85} style={styles.ctaWrap}>
              <LinearGradient
                colors={[palette.violetDark, palette.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <Info size={16} color={palette.gold} strokeWidth={2} />
                <Text style={styles.ctaText}>{t('messages.discoverPremium')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: palette.charbonSoft }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetOuter: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  sheet: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 18,
    padding: 4,
  },
  iconWrap: {
    marginBottom: 4,
  },
  iconBg: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.premiumBadgeBg,
    borderWidth: 1,
    borderColor: palette.premiumBadgeBorder,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: palette.violetLight,
    letterSpacing: 1.2,
    fontFamily: 'Lexend_700Bold',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginTop: 2,
    fontFamily: 'Lexend_700Bold',
  },
  desc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  ctaWrap: {
    width: '100%',
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
  },
});
