import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gift, Check } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface StampGridProps {
  /** Current number of collected stamps */
  current: number;
  /** Total stamps needed for a reward */
  total: number;
  /** Circle diameter in px (default: 38) */
  size?: number;
  /** Show the label below (default: true) */
  showLabel?: boolean;
}

export default React.memo(function StampGrid({
  current,
  total,
  size = 38,
  showLabel = true,
}: StampGridProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const clamped = Math.min(current, total);
  const displayTotal = Math.min(total, 30); // cap for very large grids

  // Memoize stamp array to avoid re-allocation on every render
  const stamps = useMemo(
    () => Array.from({ length: displayTotal }, (_, i) => i),
    [displayTotal],
  );

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {stamps.map((i) => {
          const filled = i < clamped;
          const isLast = i === displayTotal - 1;

          return (
            <View
              key={i}
              style={[
                styles.circle,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderColor: filled ? theme.primary : theme.border,
                  backgroundColor: filled ? theme.primary : 'transparent',
                },
              ]}
            >
              {filled ? (
                <Check size={size * 0.45} color="#fff" strokeWidth={1.5} />
              ) : isLast ? (
                <Gift size={size * 0.4} color={theme.primary} strokeWidth={1.5} />
              ) : null}
            </View>
          );
        })}
      </View>

      {showLabel && (
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {t('stampGrid.count', { current: clamped, total })}
          {clamped >= total && `  ${t('stampGrid.rewardReady')}`}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  circle: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
  },
});
