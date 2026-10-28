import { useCallback } from 'react';
import { TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTourTarget } from '@/components/GuidedTour';
import WhatsAppLogo from '@/components/WhatsAppLogo';

const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212755073325';
const WHATSAPP_COLOR = '#25D366';

/** Round WhatsApp button that opens a support chat. */
export default function WhatsAppSupportFab() {
  const { t } = useLanguage();
  const tourRef = useTourTarget('support');

  const openWhatsApp = useCallback(async () => {
    // wa.me opens the app if installed, otherwise falls back to WhatsApp Web —
    // no extra package or canOpenURL manifest query needed.
    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t('account.contactSupportMsg'))}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('common.genericError'));
    }
  }, [t]);

  return (
    <TouchableOpacity
      ref={tourRef}
      style={styles.fab}
      onPress={openWhatsApp}
      activeOpacity={0.85}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={t('account.contactViaWhatsApp')}
    >
      <WhatsAppLogo size={28} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: WHATSAPP_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});
