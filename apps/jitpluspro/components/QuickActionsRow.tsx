import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTourTarget, type TourTargetKey } from '@/components/GuidedTour';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';

const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

/**
 * Row of store-management shortcuts spread evenly across the full width,
 * designed to sit on the dark Accueil header (translucent circles + white icons).
 *
 * Data-driven: pass a list of {@link QuickAction} items (icon, label,
 * destination route).
 */
export interface QuickAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** expo-router path pushed on tap. */
  route: string;
  /** Optional guided-tour target key so the tour can spotlight this item. */
  tourKey?: TourTargetKey;
}

interface Props {
  items: QuickAction[];
}

/** Single shortcut. Split out so each item can register its own tour target. */
const QuickActionItem = React.memo(function QuickActionItem({
  item,
  onPress,
}: {
  item: QuickAction;
  onPress: (item: QuickAction) => void;
}) {
  const tourRef = useTourTarget(item.tourKey);
  const { label, Icon } = item;
  return (
    <TouchableOpacity
      ref={tourRef}
      style={styles.item}
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={HIT_SLOP}
    >
      <View style={styles.circle}>
        <Icon size={icon.md} color="#fff" strokeWidth={icon.stroke} />
      </View>
      <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

function QuickActionsRow({ items }: Props) {
  const router = useRouter();
  const dir = useDir();

  const handlePress = useCallback(
    (item: QuickAction) => {
      router.push(item.route as never);
    },
    [router],
  );

  const content = React.useMemo(() => items.map((item) => (
    <QuickActionItem
      key={item.key}
      item={item}
      onPress={handlePress}
    />
  )), [handlePress, items]);

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
