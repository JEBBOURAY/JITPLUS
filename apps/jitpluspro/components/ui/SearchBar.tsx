import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Search, X, type LucideIcon } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { SEARCH_DEBOUNCE_MS } from '@/constants/app';
import { font, icon as iconTokens } from '@/constants/design';
import { radius } from '@/utils/responsive';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

export interface SearchBarAction {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  /** Number of filters it holds: shown as a small badge when above 0. */
  badge?: number;
}

/**
 * Search field of a list screen. It owns the typed text so keystrokes re-render
 * only this bar; the screen gets the trimmed term once typing pauses (or right
 * away when cleared). `action` adds a square button at the end (filters, sort).
 */
export const SearchBar = React.memo(function SearchBar({
  placeholder,
  clearLabel,
  searching,
  onSearch,
  action,
  resetKey,
}: {
  placeholder: string;
  clearLabel: string;
  searching: boolean;
  onSearch: (term: string) => void;
  action?: SearchBarAction;
  /** Changing it empties the field (e.g. "Clear the filters"). */
  resetKey?: number;
}) {
  const theme = useTheme();
  const dir = useDir();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    if (resetKey) setText('');
  }, [resetKey]);

  useEffect(() => {
    const term = text.trim();
    if (!term) {
      onSearch('');
      return;
    }
    const timer = setTimeout(() => onSearch(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, onSearch]);

  const clear = useCallback(() => {
    setText('');
    inputRef.current?.blur();
  }, []);

  const badge = action?.badge ?? 0;

  return (
    <View style={[styles.container, { flexDirection: dir.row }]}>
      <View style={[styles.bar, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: dir.row }]}>
        {searching ? (
          <ActivityIndicator size="small" color={theme.primary} style={styles.searchIcon} />
        ) : (
          <Search size={16} color={palette.charbon} strokeWidth={iconTokens.stroke} style={styles.searchIcon} />
        )}
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={placeholder}
          maxFontSizeMultiplier={1.6}
        />
        {text.length > 0 && (
          <TouchableOpacity
            onPress={clear}
            hitSlop={HIT_SLOP}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
          >
            <X size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
          </TouchableOpacity>
        )}
      </View>
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.7}
          style={[
            styles.actionBtn,
            badge > 0
              ? { backgroundColor: theme.primaryBg, borderColor: theme.primary }
              : { backgroundColor: theme.bgCard, borderColor: theme.border },
          ]}
          accessibilityRole="button"
          accessibilityLabel={badge > 0 ? `${action.label}, ${badge}` : action.label}
        >
          <action.Icon size={iconTokens.md} color={badge > 0 ? theme.primary : theme.text} strokeWidth={iconTokens.stroke} />
          {badge > 0 ? (
            <View style={[styles.badge, dir.isRTL ? styles.badgeStart : styles.badgeEnd, { backgroundColor: theme.primary, borderColor: theme.bg }]}>
              <Text style={[styles.badgeText, { color: theme.textInverse }]} maxFontSizeMultiplier={1.2}>
                {badge}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 8, alignItems: 'stretch' },
  bar: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    borderWidth: 1,
  },
  searchIcon: { width: 18 },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 0 : 8,
    fontFamily: font.medium,
  },
  clearBtn: {
    minWidth: 44,
    minHeight: 44,
    marginVertical: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    width: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEnd: { right: -6 },
  badgeStart: { left: -6 },
  badgeText: { fontSize: 11, fontFamily: font.semibold },
});
