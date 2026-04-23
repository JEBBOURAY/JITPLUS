import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import React, { useCallback } from 'react';
import { BlurView } from 'expo-blur';
import { haptic } from '@/utils/haptics';
import { CreditCard, Compass, User, Bell, QrCode } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { ms, hp } from '@/utils/responsive';
import { useUnreadNotificationCount } from '@/hooks/useQueryHooks';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const ICONS: Record<string, LucideIcon> = {
  index: CreditCard,
  discover: Compass,
  qr: QrCode,
  notifications: Bell,
  profile: User,
};

const LABEL_KEYS: Record<string, string> = {
  index: 'tabs.cards',
  discover: 'tabs.discover',
  qr: 'tabs.qr',
  notifications: 'tabs.notifs',
  profile: 'tabs.profile',
};

const QR_GRADIENT_ACTIVE = [palette.violet, palette.violetDark] as const;
const QR_GRADIENT_INACTIVE = [`${palette.violet}20`, `${palette.violetDark}20`] as const;
const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 1 } as const;
const FOCUSED_ICON_BG = { backgroundColor: `${palette.violet}15` } as const;

export default React.memo(function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { client } = useAuth();
  const { data: unreadData } = useUnreadNotificationCount(!!client);
  const unreadCount = unreadData?.unreadCount ?? 0;
  const insets = useSafeAreaInsets();

  const handleTabPress = useCallback((route: typeof state.routes[number], index: number) => {
    haptic();
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (state.index !== index && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }, [state.index, navigation]);

  return (
    <View style={styles.wrapper}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 120}
        tint="light"
        style={styles.blurContainer}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.bgTabBar,
              borderTopColor: theme.bgTabBarBorder,
              paddingBottom: Math.max(insets.bottom, hp(14)),
            },
          ]}
        >
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const IconComponent = ICONS[route.name] || CreditCard;
            const label = LABEL_KEYS[route.name] ? t(LABEL_KEYS[route.name]) : route.name;
            const isQR = route.name === 'qr';

            const onPress = () => handleTabPress(route, index);

            // Center QR button with gradient
            if (isQR) {
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
                    colors={isFocused ? QR_GRADIENT_ACTIVE : QR_GRADIENT_INACTIVE}
                    start={GRADIENT_START}
                    end={GRADIENT_END}
                    style={styles.qrCenter}
                  >
                    <IconComponent
                      size={ms(24)}
                      color={isFocused ? '#fff' : palette.violet}
                      strokeWidth={1.5}
                    />
                  </LinearGradient>
                  <Text
                    style={[
                      styles.label,
                      {
                        color: isFocused ? palette.violet : theme.textMuted,
                        fontWeight: isFocused ? '700' : '500',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            }

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
                <View
                  style={[
                    styles.iconContainer,
                    isFocused && FOCUSED_ICON_BG,
                  ]}
                >
                  <IconComponent
                    size={ms(21)}
                    color={isFocused ? palette.violet : theme.textMuted}
                    strokeWidth={1.5}
                  />
                  {route.name === 'notifications' && unreadCount > 0 && (
                    <View style={styles.badge} accessibilityLabel={`${unreadCount} ${unreadCount > 1 ? 'notifications' : 'notification'}`}>
                      <Text style={styles.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.label,
                    {
                      color: isFocused ? palette.violet : theme.textMuted,
                      fontWeight: isFocused ? '700' : '500',
                    },
                  ]}
                >
                  {label}
                </Text>
                {isFocused && (
                  <View style={[styles.indicator, { backgroundColor: palette.violet }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
})

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  blurContainer: {
    overflow: 'hidden',
    borderTopLeftRadius: ms(24),
    borderTopRightRadius: ms(24),
  },
  container: {
    flexDirection: 'row',
    paddingTop: hp(10),
    borderTopWidth: 0.5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: hp(3),
  },
  iconContainer: {
    width: ms(46),
    height: ms(34),
    borderRadius: ms(17),
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: ms(10),
    letterSpacing: 0.3,
  },
  indicator: {
    position: 'absolute',
    top: -hp(10),
    width: ms(24),
    height: ms(3),
    borderRadius: ms(2),
  },
  qrCenter: {
    width: ms(48),
    height: ms(48),
    borderRadius: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -hp(12),
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  badge: {
    position: 'absolute',
    top: -ms(4),
    right: ms(2),
    minWidth: ms(18),
    height: ms(18),
    borderRadius: ms(9),
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ms(4),
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: ms(9),
    fontWeight: '700',
    lineHeight: ms(13),
  },
});
