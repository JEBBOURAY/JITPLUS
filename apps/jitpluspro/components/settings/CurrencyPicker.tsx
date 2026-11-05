import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { Banknote, Check, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon as iconTokens } from '@/constants/design';
import { CURRENCY_LIST, type Currency, type CurrencyCode } from '@/config/currency';
import { fieldFill } from './surface';

interface Props {
  theme: ThemeColors;
  t: (key: string, params?: Record<string, unknown>) => string;
  value: Currency;
  saving: boolean;
  onSelect: (code: CurrencyCode) => void;
}

/**
 * Devise des montants (achat par tampon, roue, coupons…). Ouvert à tous les
 * plans et enregistré dès la sélection, comme les cadeaux.
 */
function CurrencyPicker({ theme, t, value, saving, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const { row, textAlign, flip } = useDir();
  const insets = useSafeAreaInsets();
  const fill = fieldFill(theme);

  const pick = useCallback((code: CurrencyCode) => {
    setOpen(false);
    if (code !== value.code) onSelect(code);
  }, [value.code, onSelect]);

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
    <>
      <TouchableOpacity
        style={[styles.trigger, { flexDirection: row, backgroundColor: fill }]}
        onPress={() => setOpen(true)}
        disabled={saving}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('settingsPage.currencyLabel')}
        accessibilityValue={{ text: `${value.name} (${value.code})` }}
      >
        <Banknote size={18} color={theme.primary} strokeWidth={iconTokens.stroke} />
        <View style={styles.itemBody}>
          <Text style={[styles.fieldLabel, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('settingsPage.currencyLabel')}
          </Text>
          <Text style={[styles.itemSub, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {value.name} · {value.symbol}
          </Text>
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <ChevronRight size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} style={flip} />
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View
            style={[styles.sheet, { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom + 12, 24) }]}
            accessibilityViewIsModal
          >
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <Text style={[styles.title, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('settingsPage.currencySheetTitle')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t('settingsPage.currencySheetSubtitle')}
            </Text>
            <FlatList
              data={CURRENCY_LIST}
              keyExtractor={(c) => c.code}
              renderItem={renderItem}
              style={styles.list}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

export default React.memo(CurrencyPicker);

const styles = StyleSheet.create({
  trigger: { alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  fieldLabel: { fontSize: 14, fontFamily: font.medium },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: '82%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 14 },
  title: { fontSize: 18, fontFamily: font.bold, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, lineHeight: 18, fontFamily: font.regular, marginTop: 4, marginBottom: 12 },
  list: { flexGrow: 0 },

  item: { alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12 },
  symbol: { width: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  symbolText: { fontSize: 13, fontFamily: font.semibold },
  itemBody: { flex: 1, gap: 1 },
  itemTitle: { fontSize: 14, fontFamily: font.medium },
  itemSub: { fontSize: 12, lineHeight: 16, fontFamily: font.regular },
});
