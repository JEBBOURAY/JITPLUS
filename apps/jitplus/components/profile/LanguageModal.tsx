import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { Globe, Check } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { profileStyles as styles } from './profileStyles';
import { api } from '@/services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const LANGUAGES = ['fr', 'en', 'ar'] as const;
const FLAGS = { fr: '🇫🇷', en: '🇬🇧', ar: '🇲🇦' } as const;

export default function LanguageModal({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <View style={[styles.langModalCard, { backgroundColor: theme.bgCard }]} accessibilityRole="summary" accessibilityLabel={t('profile.language')} accessibilityViewIsModal={true}>
          <View style={[styles.modalIconCircle, { backgroundColor: `${palette.gold}12` }]}>
            <Globe size={ms(28)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{t('profile.language')}</Text>
          <Text style={[styles.langModalDesc, { color: theme.textMuted }]}>
            {t('profile.languageDesc')}
          </Text>

          {LANGUAGES.map((lang) => {
            const selected = locale === lang;
            return (
              <Pressable
                key={lang}
                onPress={async () => {
                  if (lang !== locale) {
                    await setLocale(lang);
                    api.updateProfile({ language: lang }).catch(() => {});
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
                <Text style={styles.langFlag}>{FLAGS[lang]}</Text>
                <Text style={[styles.langOptionText, { color: selected ? theme.primary : theme.text }]}>
                  {t(`languages.${lang}`)}
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
