import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Check } from 'lucide-react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import { CURRENCY_LIST, type Currency, type CurrencyCode } from '@/config/currency';
import BottomSheet from '@/components/ui/BottomSheet';
import { fieldFill } from './surface';

interface Props {
  theme: ThemeColors;
  t: (key: string, params?: Record<string, unknown>) => string;
  value: Currency;
  visible: boolean;
  onSelect: (code: CurrencyCode) => void;
  onClose: () => void;
}

/**
 * Bottom sheet listing the currencies (amount per stamp, wheel, coupons…).
 * Open to every plan; the parent saves the choice as soon as it is picked.
 */
function CurrencyPicker({ theme, t, value, visible, onSelect, onClose }: Props) {
  const { row, textAlign } = useDir();
  const fill = fieldFill(theme);

  const pick = useCallback((code: CurrencyCode) => {
    onClose();
    if (code !== value.code) onSelect(code);
  }, [value.code, onSelect, onClose]);

  const renderItem = useCallback(({ item }: { item: Currency }) => {
    const active = item.code === value.code;
    return (
      <TouchableOpacity
        style={[styles.item, { flexDirection: row, backgroundColor: active ? theme.primaryBg : 'transparent' }]}
        onPress={() => pick(item.code)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${item.name} (${item.code})`}
      >
        <View style={[styles.symbol, { backgroundColor: active ? theme.primary : fill }]}>
          <Text style={[styles.symbolText, { color: active ? '#fff' : theme.text }]} maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit>
            {item.symbol}
          </Text>
        </View>
        <View style={styles.itemBody}>
          <Text style={[styles.itemTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
            {item.name} · {item.code}
          </Text>
          <Text style={[styles.itemSub, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3} numberOfLines={2}>
            {item.countries}
          </Text>
        </View>
        {active && <Check size={18} color={theme.primary} strokeWidth={iconTokens.stroke} />}
      </TouchableOpacity>
    );
  }, [value.code, theme, fill, row, textAlign, pick]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      scrollable
      style={styles.sheet}
      header={(
        <>
          <Text style={[styles.title, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            {t('settingsPage.currencySheetTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t('settingsPage.currencySheetSubtitle')}
          </Text>
        </>
      )}
    >
      <FlatList
        data={CURRENCY_LIST}
        keyExtractor={(c) => c.code}
        renderItem={renderItem}
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </BottomSheet>
  );
}

export default React.memo(CurrencyPicker);

const styles = StyleSheet.create({
  sheet: { maxHeight: '82%' },
  title: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, lineHeight: 18, fontFamily: font.regular, marginTop: 4, marginBottom: 12 },
  list: { flexGrow: 0 },

  item: { alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12 },
  symbol: { width: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  symbolText: { fontSize: 13, fontFamily: font.semibold },
  itemBody: { flex: 1, gap: 1 },
  itemTitle: { fontSize: 14, fontFamily: font.medium },
  itemSub: { fontSize: 12, lineHeight: 16, fontFamily: font.regular },
});
