import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { JitGift } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { font } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

interface StampGridProps {
  /** Current number of collected stamps */
  current: number;
  /** Total stamps needed for a reward */
  total: number;
  /** Circle diameter in px (default: 38) */
  size?: number;
}

export default React.memo(function StampGrid({
  current,
  total,
  size = 38,
}: StampGridProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const clamped = Math.min(current, total);
  // Past this many circles the grid stops being readable: show a bar instead.
  const asBar = total > MAX_CIRCLES;
  const displayTotal = asBar ? 0 : total;

  // Memoize stamp array to avoid re-allocation on every render
  const stamps = useMemo(
    () => Array.from({ length: displayTotal }, (_, i) => i),
    [displayTotal],
  );

  return (
    <View style={styles.container}>
      {asBar ? (
        <View style={[styles.track, { backgroundColor: theme.border, alignItems: dir.alignStart }]}>
          <View style={[styles.fill, { backgroundColor: theme.primary, width: `${total > 0 ? (clamped / total) * 100 : 0}%` }]} />
        </View>
      ) : (
      <View style={[styles.grid, { flexDirection: dir.row }]}>
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
                <JitGift size={size * 0.4} color={theme.primary} strokeWidth={1.5} />
              ) : null}
            </View>
          );
        })}
      </View>
      )}

      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {t('stampGrid.count', { current, total })}
        {clamped >= total && `  ${t('stampGrid.rewardReady')}`}
      </Text>
    </View>
  );
});

const MAX_CIRCLES = 30;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  grid: {
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  track: { alignSelf: 'stretch', height: 12, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 999 },
  circle: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    marginTop: 14,
    fontFamily: font.semibold,
  },
});
