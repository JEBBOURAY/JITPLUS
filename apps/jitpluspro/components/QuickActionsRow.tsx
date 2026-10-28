import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { useRouter } from 'expo-router';
import { palette } from '@/contexts/ThemeContext';
import { useTourTarget, type TourTargetKey } from '@/components/GuidedTour';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';

/**
 * Row of store-management shortcuts spread evenly across the full width,
 * designed to sit on the dark Accueil header (translucent circles + white icons).
 *
 * Data-driven: pass a list of {@link QuickAction} items (icon, label, optional
 * premium lock marker, destination route). Premium items still navigate on tap — the
 * locked/upsell state is handled by the destination screen, not here — unless
 * the item provides its own `onPress` (e.g. to show an upsell modal first).
 */
export interface QuickAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** expo-router path pushed on tap. */
  route: string;
  /** Custom tap handler; replaces the default `route` navigation when set. */
  onPress?: () => void;
  /** Shows a small lock marker; does NOT block navigation. */
  premium?: boolean;
  /** Screen-reader label. Falls back to `label`. */
  accessibilityLabel?: string;
  /** Optional guided-tour target key so the tour can spotlight this item. */
  tourKey?: TourTargetKey;
}

interface Props {
  items: QuickAction[];
  /**
   * Color of the header behind the row, used behind the premium lock marker so
   * it detaches from the circle. Defaults to the deep brand violet.
   */
  headerColor?: string;
}

/** Single shortcut. Split out so each item can register its own tour target. */
const QuickActionItem = React.memo(function QuickActionItem({
  item,
  headerColor,
  onPress,
}: {
  item: QuickAction;
  headerColor: string;
  onPress: (item: QuickAction) => void;
}) {
  const tourRef = useTourTarget(item.tourKey);
  const { isRTL } = useDir();
  const { label, Icon, premium, accessibilityLabel } = item;
  return (
    <TouchableOpacity
      ref={tourRef}
      style={styles.item}
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <View style={styles.circle}>
        <Icon size={icon.md} color="#fff" strokeWidth={icon.stroke} />
        {premium && (
          <View
            style={[styles.lockMarker, isRTL ? { left: -3 } : { right: -3 }, { borderColor: headerColor }]}
            importantForAccessibility="no"
          >
            <JitLock size={10} color={headerColor} strokeWidth={icon.strokeSmall} />
          </View>
        )}
      </View>
      <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

function QuickActionsRow({ items, headerColor = palette.violetDeep }: Props) {
  const router = useRouter();
  const dir = useDir();

  const handlePress = useCallback(
    (item: QuickAction) => {
      if (item.onPress) {
        item.onPress();
        return;
      }
      router.push(item.route as never);
    },
    [router],
  );

  const content = React.useMemo(() => items.map((item) => (
    <QuickActionItem
      key={item.key}
      item={item}
      headerColor={headerColor}
      onPress={handlePress}
    />
  )), [headerColor, handlePress, items]);

  return <View style={[styles.row, { flexDirection: dir.row }]}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    marginTop: 18,
    gap: 8,
    alignItems: 'flex-start',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    // ≥44px touch target: circle (48) + label region comfortably exceeds it.
    paddingVertical: 2,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockMarker: {
    position: 'absolute',
    top: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.gold,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 15,
    fontFamily: font.medium,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});

export default React.memo(QuickActionsRow);
