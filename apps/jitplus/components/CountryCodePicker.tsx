import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ListRenderItemInfo,
} from 'react-native';
import { X, Search } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { CountryCode, COUNTRY_CODES } from '@/utils/countryCodes';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  selected: CountryCode;
  onSelect: (c: CountryCode) => void;
  accentColor?: string;
}

export default function CountryCodePicker({ selected, onSelect, accentColor = palette.violet }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input to avoid re-filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q.toLowerCase()),
    );
  }, [debouncedSearch]);

  const handleSelect = useCallback((c: CountryCode) => {
    onSelect(c);
    setVisible(false);
    setSearch('');
  }, [onSelect]);

  const renderCountry = useCallback(({ item }: ListRenderItemInfo<CountryCode>) => {
    const isActive = item.code === selected.code;
    return (
      <TouchableOpacity
        style={[
          styles.row,
          isActive && { backgroundColor: `${accentColor}12` },
        ]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.rowFlag}>{item.flag}</Text>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: theme.text }]}>{item.name}</Text>
          <Text style={[styles.rowDial, { color: theme.inputPlaceholder }]}>{item.dial}</Text>
        </View>
        {isActive && (
          <View style={[styles.checkDot, { backgroundColor: accentColor }]} />
        )}
      </TouchableOpacity>
    );
  }, [selected.code, accentColor, theme, handleSelect]);

  return (
    <>
      {/* Trigger button */}
      <TouchableOpacity
        style={[styles.trigger, { borderColor: theme.inputBorder }]}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.flag}>{selected.flag}</Text>
        <Text style={[styles.dial, { color: theme.text }]}>{selected.dial}</Text>
        <Text style={[styles.chevron, { color: theme.inputPlaceholder }]}>▾</Text>
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={visible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.bgCard || '#fff' }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('countryPicker.title')}</Text>
              <TouchableOpacity onPress={() => { setVisible(false); setSearch(''); }} activeOpacity={0.7}>
                <X size={ms(22)} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={[styles.searchWrapper, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <Search size={ms(16)} color={theme.inputPlaceholder} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder={t('countryPicker.searchPlaceholder')}
                placeholderTextColor={theme.inputPlaceholder}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* List */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              getItemLayout={(_, index) => ({ length: 56, offset: 56 * index, index })}
              renderItem={renderCountry}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={10}
              removeClippedSubviews={true}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.inputPlaceholder }]}>{t('countryPicker.noResults')}</Text>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: wp(6),
    gap: wp(4),
  },
  flag: { fontSize: ms(18) },
  dial: { fontSize: fontSize.md, fontWeight: '600' },
  chevron: { fontSize: ms(12), marginLeft: wp(2) },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    maxHeight: '70%',
    borderTopLeftRadius: ms(20),
    borderTopRightRadius: ms(20),
    paddingTop: hp(16),
    paddingBottom: hp(24),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(20),
    marginBottom: hp(12),
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  // Search
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: wp(20),
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: wp(12),
    height: hp(44),
    marginBottom: hp(8),
    gap: wp(8),
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(20),
    paddingVertical: hp(12),
    gap: wp(12),
  },
  rowFlag: { fontSize: ms(22) },
  rowInfo: { flex: 1 },
  rowName: { fontSize: fontSize.md, fontWeight: '600' },
  rowDial: { fontSize: fontSize.xs, marginTop: hp(2) },
  checkDot: {
    width: ms(10),
    height: ms(10),
    borderRadius: ms(5),
  },

  emptyText: {
    textAlign: 'center',
    marginTop: hp(24),
    fontSize: fontSize.sm,
  },
});
