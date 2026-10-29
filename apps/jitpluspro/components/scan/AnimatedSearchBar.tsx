import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowRight, ChevronDown, Search, X } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { COUNTRIES } from '@/constants/Countries';
import { font, icon } from '@/constants/design';

// Sits on top of the live camera preview, so it uses a dark glass surface in both themes.
const GLASS_BG = 'rgba(26,23,38,0.7)';
const GLASS_BG_FOCUSED = 'rgba(26,23,38,0.85)';
const GLASS_BORDER = 'rgba(139,92,246,0.25)';
const ACCENT = '#7C3AED';
const ACCENT_LIGHT = '#A78BFA';
const ON_GLASS = '#FFFFFF';
const ON_GLASS_MUTED = 'rgba(255,255,255,0.6)';
const ON_GLASS_PLACEHOLDER = 'rgba(255,255,255,0.45)';
const CHIP_BG = 'rgba(139,92,246,0.22)';
const CHIP_FG = '#C4B5FD';

interface Props {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  onBlur: () => void;
  isFocused: boolean;
  isSearching: boolean;
  insetTop: number;
  countryIndex: number;
  onToggleCountry: () => void;
}

export const AnimatedSearchBar = React.memo(function AnimatedSearchBar({
  value,
  onChangeText,
  onSubmit,
  onFocus,
  onBlur,
  isFocused,
  isSearching,
  insetTop,
  countryIndex,
  onToggleCountry,
}: Props) {
  const { t } = useLanguage();
  const dir = useDir();
  const [barScale] = useState(() => new Animated.Value(1));
  const country = COUNTRIES[countryIndex];

  const animatedBar = useMemo(() => ({ transform: [{ scale: barScale }] }), [barScale]);

  const handleFocus = () => {
    Animated.spring(barScale, { toValue: 1.02, useNativeDriver: true, speed: 25, bounciness: 4 }).start();
    onFocus();
  };

  const handleBlur = () => {
    Animated.spring(barScale, { toValue: 1, useNativeDriver: true, speed: 25, bounciness: 4 }).start();
    onBlur();
  };

  return (
    <Animated.View style={[styles.searchContainer, { top: insetTop + 12 }, animatedBar]}>
      <View
        style={[
          styles.searchBar,
          { flexDirection: dir.row },
          isFocused && styles.searchBarFocused,
        ]}
      >
        <Search size={18} color={ON_GLASS_MUTED} strokeWidth={icon.stroke} />
        <TouchableOpacity
          style={[styles.prefixContainer, { flexDirection: dir.row }]}
          onPress={onToggleCountry}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.selectCountry')}
        >
          <Text style={styles.prefixText} maxFontSizeMultiplier={1.3}>{country.flag} {country.dial}</Text>
          <ChevronDown size={12} color={CHIP_FG} strokeWidth={icon.strokeSmall} />
        </TouchableOpacity>
        <TextInput
          style={[styles.searchInput, { textAlign: dir.textAlign }]}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={t('scan.phonePlaceholder')}
          placeholderTextColor={ON_GLASS_PLACEHOLDER}
          keyboardType="phone-pad"
          returnKeyType="search"
          selectionColor={ACCENT_LIGHT}
          autoCorrect={false}
          maxFontSizeMultiplier={1.3}
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('scan.clearSearch')}
          >
            <X size={18} color={ON_GLASS_MUTED} strokeWidth={icon.stroke} />
          </TouchableOpacity>
        )}
        {value.length >= 6 && (
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={onSubmit}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('scan.searchSubmit')}
            accessibilityState={{ busy: isSearching }}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color={ON_GLASS} />
            ) : (
              <ArrowRight size={18} color={ON_GLASS} strokeWidth={icon.stroke} style={dir.flip} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  searchContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: GLASS_BG,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1F2937',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  searchBarFocused: {
    borderColor: ACCENT_LIGHT,
    backgroundColor: GLASS_BG_FOCUSED,
  },
  prefixContainer: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: CHIP_BG,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  prefixText: {
    color: CHIP_FG,
    fontSize: 14,
    fontFamily: font.semibold,
  },
  searchInput: {
    flex: 1,
    color: ON_GLASS,
    fontSize: 15,
    paddingVertical: 0,
    fontFamily: font.medium,
  },
  submitBtn: {
    backgroundColor: ACCENT,
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
});
