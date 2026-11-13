import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PremiumLockContent } from '@/components/PremiumLockCard';
import { font, icon } from '@/constants/design';
import { radius } from '@/utils/responsive';

interface PremiumLockModalProps {
  visible: boolean;
  onClose: () => void;
  titleKey: string;
  descKey: string;
}

export default function PremiumLockModal({ visible, onClose, titleKey, descKey }: PremiumLockModalProps) {
  const { t, isRTL } = useLanguage();
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
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="summary"
          accessibilityViewIsModal={true}
        >
          <TouchableOpacity
            style={[styles.closeBtn, isRTL ? { left: 16 } : { right: 16 }]}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <X size={icon.md} color={palette.charbonUltraLight} strokeWidth={icon.stroke} />
          </TouchableOpacity>

          <PremiumLockContent
            title={t(titleKey)}
            description={t(descKey)}
            ctaLabel={t('messages.discoverPremium')}
            onPress={handleUpgrade}
            ctaSize="lg"
            tone="sheet"
          />

          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
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
  sheet: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: palette.premiumBorder,
    backgroundColor: palette.premiumBg,
    overflow: 'hidden',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    alignItems: 'stretch',
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    padding: 4,
    zIndex: 1,
  },
  cancelBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  cancelText: {
    fontSize: 14,
    color: palette.charbonSoft,
    fontFamily: font.medium,
  },
});
