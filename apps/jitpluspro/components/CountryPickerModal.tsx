import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { Search, X, ArrowLeft, Check } from 'lucide-react-native';
import { COUNTRIES } from '@/constants/Countries';
import { useLanguage } from '@/contexts/LanguageContext';

interface CountryPickerModalProps {
  visible: boolean;
  selectedCode: string;
  onSelect: (index: number) => void;
  onClose: () => void;
  topInset: number;
}

export default function CountryPickerModal({
  visible,
  selectedCode,
  onSelect,
  onClose,
  topInset,
}: CountryPickerModalProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [search]);

  const renderCountry = useCallback(({ item }: { item: (typeof COUNTRIES)[number] }) => {
    const isSelected = item.code === selectedCode;
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => {
          onSelect(COUNTRIES.findIndex((c) => c.code === item.code));
          setSearch('');
        }}
        activeOpacity={0.6}
      >
        <Text style={styles.flag}>{item.flag}</Text>
        <View style={styles.flex1}>
          <Text style={styles.name}>{item.name}</Text>
        </View>
        <Text style={styles.dial}>{item.dial}</Text>
        {isSelected && <Check size={18} color="#A78BFA" style={styles.check} />}
      </TouchableOpacity>
    );
  }, [selectedCode, onSelect]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconPad}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('common.selectCountry')}</Text>
          <View style={styles.spacer} />
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Search size={16} color="rgba(255,255,255,0.5)" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('common.searchCountry')}
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={16} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews
          renderItem={renderCountry}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{t('common.noCountryFound')}</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1025' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#fff' },
  iconPad: { padding: 4 },
  spacer: { width: 32 },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowSelected: { backgroundColor: 'rgba(139,92,246,0.15)' },
  flag: { fontSize: 24, marginRight: 12 },
  name: { fontSize: 15, fontWeight: '500', color: '#fff' },
  dial: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  flex1: { flex: 1 },
  check: { marginLeft: 8 },
  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});
