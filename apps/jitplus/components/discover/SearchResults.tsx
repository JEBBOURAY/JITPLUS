import { memo } from 'react';
import { View, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { MapPin, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import MerchantLogo from '@/components/MerchantLogo';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Merchant } from '@/types';
import { pointKey, pointName } from '@/utils/merchantPoint';
import { ms, fontSize as FS } from '@/utils/responsive';

const ResultRow = memo(function ResultRow({ merchant, onPress }: {
  merchant: Merchant;
  onPress: (merchant: Merchant) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const sub = [
    merchant.categorie ? t(`categories.${merchant.categorie}`, { defaultValue: merchant.categorie }) : null,
    merchant.ville,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => onPress(merchant)}
      style={({ pressed }) => [styles.item, { borderBottomColor: theme.border }, pressed && { backgroundColor: `${palette.violet}08` }]}
      accessibilityRole="button"
    >
      <View style={[styles.logoWrap, { backgroundColor: `${palette.violet}10` }]}>
        <MerchantLogo logoUrl={merchant.logoUrl} style={styles.logo} merchantName={merchant.nomBoutique} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{pointName(merchant)}</Text>
        {!!sub && <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={1}>{sub}</Text>}
      </View>
      <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={2} />
    </Pressable>
  );
});

/**
 * Dropdown under the search bar: the first matches, a "see all" entry when
 * there are more, or a no-result line.
 */
export const SearchResults = memo(function SearchResults({ query, results, totalCount, onSelect, onSeeAll }: {
  query: string;
  results: Merchant[];
  totalCount: number;
  onSelect: (merchant: Merchant) => void;
  onSeeAll: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();

  if (totalCount === 0) {
    return (
      <View style={[styles.dropdown, styles.emptyDropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <MapPin size={ms(20)} color={theme.textMuted} strokeWidth={2} />
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('discover.noResultsFor', { query })}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.dropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scroll}>
        {results.map((m) => <ResultRow key={pointKey(m)} merchant={m} onPress={onSelect} />)}
        {totalCount > results.length && (
          <Pressable
            onPress={onSeeAll}
            style={({ pressed }) => [styles.seeAll, pressed && { backgroundColor: `${palette.violet}08` }]}
            accessibilityRole="button"
          >
            <Text style={styles.seeAllText}>{t('discover.seeAllResults', { count: totalCount })}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  dropdown: {
    marginTop: ms(6), borderRadius: ms(16), borderWidth: 1, overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12 }, android: { elevation: 6 } }),
  },
  scroll: { maxHeight: ms(340) },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: ms(12), paddingHorizontal: ms(14), borderBottomWidth: StyleSheet.hairlineWidth, gap: ms(10) },
  logoWrap: { width: ms(36), height: ms(36), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logo: { width: ms(36), height: ms(36), borderRadius: ms(10) },
  info: { flex: 1 },
  name: { fontSize: FS.md, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  sub: { fontSize: FS.xs, marginTop: ms(2), fontFamily: 'Lexend_400Regular' },
  seeAll: { paddingVertical: ms(12), alignItems: 'center' },
  seeAllText: { fontSize: FS.sm, fontWeight: '700', color: palette.violet, fontFamily: 'Lexend_600SemiBold' },
  emptyDropdown: { alignItems: 'center', justifyContent: 'center', paddingVertical: ms(20), gap: ms(8) },
  emptyText: { fontSize: FS.sm, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
});
