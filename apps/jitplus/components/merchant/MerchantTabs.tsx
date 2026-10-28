import { memo } from 'react';
import { ScrollView, Pressable, View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import type { FicheTab } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms } from '@/utils/responsive';

export const TAB_BAR_HEIGHT = ms(48);

const LABEL_KEYS: Record<FicheTab, string> = {
  overview: 'merchant.tabOverview',
  loyalty: 'merchant.tabLoyalty',
  deals: 'deals.merchant.title',
  info: 'merchant.tabInfo',
  photos: 'merchant.tabPhotos',
};

interface Props {
  tabs: FicheTab[];
  active: FicheTab;
  onChange: (tab: FicheTab) => void;
}

/** Tab row of the merchant page; scrolls sideways only when the labels do not fit. */
function MerchantTabs({ tabs, active, onChange }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab === active;
        return (
          <Pressable
            key={tab}
            onPress={() => { if (!selected) { haptic(); onChange(tab); } }}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              style={[styles.label, { color: selected ? theme.text : theme.textMuted, fontFamily: selected ? fonts.semibold : fonts.medium }]}
              numberOfLines={1}
            >
              {t(LABEL_KEYS[tab])}
            </Text>
            <View style={[styles.indicator, selected && { backgroundColor: theme.text }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: wp(4) },
  tab: { flexGrow: 1, height: TAB_BAR_HEIGHT, paddingHorizontal: wp(12), alignItems: 'center', justifyContent: 'flex-end' },
  label: { fontSize: ms(14), marginBottom: hp(12) },
  indicator: { alignSelf: 'stretch', height: 2 },
});

export default memo(MerchantTabs);
