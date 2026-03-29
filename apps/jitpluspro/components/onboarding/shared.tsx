import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { palette } from '@/contexts/ThemeContext';
import type { useTheme } from '@/contexts/ThemeContext';

// ── Shared types ──────────────────────────────────────────────────
export type ThemeProp = ReturnType<typeof useTheme>;

// ── Animated step wrapper ─────────────────────────────────────────
export function StepSlide({
  children,
  visible,
  direction,
}: {
  children: React.ReactNode;
  visible: boolean;
  direction: 'enter' | 'exit';
}) {
  const { width: SCREEN_W } = useWindowDimensions();
  const anim = useRef(new Animated.Value(visible ? 0 : SCREEN_W)).current;

  React.useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 0 : direction === 'exit' ? -SCREEN_W : SCREEN_W,
      useNativeDriver: true,
      tension: 80,
      friction: 14,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { transform: [{ translateX: anim }] }]}
    >
      {children}
    </Animated.View>
  );
}

// ── Progress dots ─────────────────────────────────────────────────
export function ProgressDots({
  current,
  total,
  theme,
}: {
  current: number;
  total: number;
  theme: ThemeProp;
}) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor:
                i < current
                  ? palette.violet
                  : i === current
                  ? palette.violet
                  : theme.borderLight,
              width: i === current ? 24 : 8,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ── Feature row (welcome step) ────────────────────────────────────
export function FeatureRow({
  icon,
  title,
  desc,
  theme,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  theme: ThemeProp;
}) {
  return (
    <View style={[styles.featureRow, { borderColor: theme.borderLight, backgroundColor: theme.bgCard }]}>
      <View style={[styles.featureIcon, { backgroundColor: '#6B7280' + '15' }]}>
        {icon}
      </View>
      <View style={styles.featureText}>
        <Text style={[styles.featureTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.featureDesc, { color: theme.textMuted }]}>{desc}</Text>
      </View>
    </View>
  );
}

// ── Checklist item (scan step) ────────────────────────────────────
export function CheckItem({
  num,
  text,
  theme,
}: {
  num: number;
  text: string;
  theme: ThemeProp;
}) {
  return (
    <View style={styles.checkItemRow}>
      <View style={[styles.checkNum, { backgroundColor: '#6B7280' + '20' }]}>
        <Text style={[styles.checkNumText, { color: '#6B7280' }]}>{num}</Text>
      </View>
      <Text style={[styles.checkText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

// ── Stat badge (done step) ────────────────────────────────────────
export function StatBadge({
  icon,
  label,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  theme: ThemeProp;
}) {
  return (
    <View style={[styles.statBadge, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      <View style={[styles.statIcon, { backgroundColor: palette.violet + '15' }]}>{icon}</View>
      <Text style={[styles.statLabel, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

// ── Shared styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureTitle: {
    fontSize: 14,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 18,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  checkNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkNumText: {
    fontSize: 13,
    fontFamily: 'Lexend_700Bold',
  },
  checkText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 20,
  },
  statBadge: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minWidth: 90,
    gap: 6,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Lexend_500Medium',
    textAlign: 'center',
  },
});
