import { useCallback, useMemo, useState } from 'react';
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
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { radius } from '@/utils/responsive';

type Country = (typeof COUNTRIES)[number];

const ROW_HEIGHT = 52;
const keyExtractor = (item: Country) => item.code;
const getItemLayout = (_: unknown, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index });

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
  const dir = useDir();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [search]);

  const renderCountry = useCallback(({ item }: { item: Country }) => {
    const isSelected = item.code === selectedCode;
    return (
      <TouchableOpacity
        style={[
          styles.row,
          { flexDirection: dir.row },
          isSelected && styles.rowSelected,
        ]}
        onPress={() => {
          onSelect(COUNTRIES.findIndex((c) => c.code === item.code));
          setSearch('');
        }}
        activeOpacity={0.6}
      >
        <Text style={[styles.flag, dir.isRTL ? styles.gapStart : styles.gapEnd]}>{item.flag}</Text>
        <View style={styles.flex1}>
          <Text style={[styles.name, { textAlign: dir.textAlign }]}>{item.name}</Text>
        </View>
        <Text style={styles.dial}>{item.dial}</Text>
        {isSelected && (
          <Check
            size={18}
            color="#A78BFA"
            strokeWidth={icon.stroke}
            style={dir.isRTL ? styles.checkRtl : styles.check}
          />
        )}
      </TouchableOpacity>
    );
  }, [selectedCode, onSelect, dir]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.iconPad}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={icon.lg} color="#fff" strokeWidth={icon.stroke} style={dir.flip} />
          </TouchableOpacity>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t('common.selectCountry')}</Text>
          <View style={styles.spacer} />
        </View>
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { flexDirection: dir.row }]}>
            <Search size={icon.sm} color="rgba(255,255,255,0.5)" strokeWidth={icon.stroke} />
            <TextInput
              style={[styles.searchInput, { textAlign: dir.textAlign }]}
              placeholder={t('common.searchCountry')}
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={icon.sm} color="rgba(255,255,255,0.5)" strokeWidth={icon.stroke} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          keyboardShouldPersistTaps="handled"
          getItemLayout={getItemLayout}
          maxToRenderPerBatch={15}
          windowSize={7}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  title: { flex: 1, fontSize: 18, color: '#fff', fontFamily: font.bold },
  iconPad: { padding: 4 },
  spacer: { width: 32 },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: '#fff', fontFamily: font.regular },
  row: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowSelected: { backgroundColor: 'rgba(139,92,246,0.15)' },
  flag: { fontSize: 24 },
  gapEnd: { marginRight: 12 },
  gapStart: { marginLeft: 12 },
  name: { fontSize: 15, color: '#fff', fontFamily: font.medium },
  dial: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: font.semibold },
  flex1: { flex: 1 },
  check: { marginLeft: 8 },
  checkRtl: { marginRight: 8 },
  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: font.regular },
});
