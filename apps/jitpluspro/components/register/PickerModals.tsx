import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import { getCategoryOptions } from '@/constants/categories';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import type { MerchantCategory } from '@/types';
import { font, icon } from '@/constants/design';
import { hp, ms, radius } from '@/utils/responsive';
import { formStyles } from './formStyles';

/** Centered sheet over a dimmed backdrop; tapping outside closes it. */
function PickerSheet({ visible, title, onClose, children }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={formStyles.pickerOverlay} onPress={onClose}>
        {/* Swallows taps so they do not reach the backdrop. */}
        <Pressable style={[formStyles.pickerSheet, { backgroundColor: theme.bgCard }]} onPress={() => {}}>
          <Text style={[formStyles.pickerTitle, { color: theme.text, textAlign: dir.textAlign }]}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PickerRow({ selected, onPress, leading, label }: {
  selected: boolean;
  onPress: () => void;
  leading: ReactNode;
  label: string;
}) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[formStyles.pickerRow, { flexDirection: dir.row }, selected && { backgroundColor: `${palette.violet}10` }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {leading}
      <Text style={[formStyles.pickerRowText, { color: theme.text, textAlign: dir.textAlign }]}>{label}</Text>
      {selected ? <Check size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} /> : null}
    </TouchableOpacity>
  );
}

export function CategoryPickerModal({ visible, selected, onPick, onClose }: {
  visible: boolean;
  selected: MerchantCategory | '';
  onPick: (value: MerchantCategory) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <PickerSheet visible={visible} title={t('register.categoryLabel')} onClose={onClose}>
      <ScrollView style={styles.scroll}>
        {getCategoryOptions().map((option) => (
          <PickerRow
            key={option.value}
            selected={selected === option.value}
            onPress={() => onPick(option.value)}
            leading={<MerchantCategoryIcon category={option.value} size={ms(20)} />}
            label={option.label}
          />
        ))}
      </ScrollView>
      <TouchableOpacity
        onPress={onClose}
        style={[styles.closeBtn, { backgroundColor: theme.bgElevated }]}
        accessibilityRole="button"
      >
        <Text style={[styles.closeText, { color: theme.textMuted }]}>{t('common.close')}</Text>
      </TouchableOpacity>
    </PickerSheet>
  );
}

export function LanguagePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, locale, setLocale } = useLanguage();
  return (
    <PickerSheet visible={visible} title={t('register.languageLabel')} onClose={onClose}>
      {LANGUAGES.map(({ code, flag, nativeLabel }) => (
        <PickerRow
          key={code}
          selected={locale === code}
          onPress={() => {
            onClose();
            if (locale !== code) void setLocale(code);
          }}
          leading={<Text style={styles.flag}>{flag}</Text>}
          label={nativeLabel}
        />
      ))}
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: hp(360) },
  closeBtn: { marginTop: hp(12), alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radius.md },
  closeText: { fontFamily: font.semibold },
  flag: { fontSize: ms(18) },
});
