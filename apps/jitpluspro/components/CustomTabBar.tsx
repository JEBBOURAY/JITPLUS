import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { History, Users, QrCode, Megaphone, Store } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

// ── Tab configuration ─────────────────────────────────────
const ICONS: Record<string, LucideIcon> = {
  activity:  History,
  index:     Users,
  scan:      QrCode,
  messages:  Megaphone,
  account:   Store,
};

const TAB_KEYS: Record<string, string> = {
  activity: 'tabs.activity',
  index:    'tabs.clients',
  scan:     'tabs.scan',
  messages: 'tabs.messages',
  account:  'tabs.account',
};

export default React.memo(function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.wrapper}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 120}
        tint={theme.mode === 'dark' ? 'dark' : 'light'}
        style={styles.blurContainer}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.bgTabBar,
              borderTopColor: theme.bgTabBarBorder,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          {state.routes.map((route, index) => {
            // Skip routes not in our config
            if (!ICONS[route.name]) return null;

            const isFocused = state.index === index;
            const IconComponent = ICONS[route.name];
            const label = t(TAB_KEYS[route.name] ?? route.name);
            const isScan = route.name === 'scan';

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            // ── Center Scan hero button ──
            if (isScan) {
              return (
                <TouchableOpacity
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={label}
                  onPress={onPress}
                  activeOpacity={0.7}
                  style={styles.tab}
                >
                  <LinearGradient
                    colors={isFocused
                      ? [palette.violet, palette.violetDark]
                      : [`${palette.violet}20`, `${palette.violetDark}20`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.scanCenter}
                  >
                    <IconComponent
                      size={24}
                      color={isFocused ? '#fff' : palette.violet}
                      strokeWidth={1.5}
                    />
                  </LinearGradient>
                  <Text
                    style={[
                      styles.label,
                      { color: isFocused ? palette.violet : theme.textMuted,
                        fontWeight: isFocused ? '700' : '500' },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            }

            // ── Normal tab ──
            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={label}
                onPress={onPress}
                activeOpacity={0.7}
                style={styles.tab}
              >
                {isFocused && (
                  <View style={[styles.indicator, { backgroundColor: palette.violet }]} />
                )}
                <View
                  style={[
                    styles.iconContainer,
                    isFocused && { backgroundColor: `${palette.violet}15` },
                  ]}
                >
                  <IconComponent
                    size={21}
                    color={isFocused ? palette.violet : theme.textMuted}
                    strokeWidth={1.5}
                  />
                </View>
                <Text
                  style={[
                    styles.label,
                    { color: isFocused ? palette.violet : theme.textMuted,
                      fontWeight: isFocused ? '700' : '500' },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  blurContainer: {
    overflow: 'hidden',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  container: {
    flexDirection: 'row',
    paddingTop: 10,
    borderTopWidth: 0.5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconContainer: {
    width: 46,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.3,
    fontFamily: 'Lexend_500Medium',
  },
  indicator: {
    position: 'absolute',
    top: -10,
    width: 24,
    height: 3,
    borderRadius: 2,
  },
    scanCenter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12,
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
});
