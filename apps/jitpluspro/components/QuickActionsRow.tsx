import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { palette } from '@/contexts/ThemeContext';
import { pokeInteraction } from '@/utils/interaction';
import { useTourTarget, type TourTargetKey } from '@/components/GuidedTour';

/**
 * Horizontally-scrollable row of store-management shortcuts, designed to sit on
 * the brand-gradient Accueil header (translucent circles + white icons).
 *
 * Data-driven: pass a list of {@link QuickAction} items (icon, label, optional
 * premium badge, destination route). Premium items still navigate on tap — the
 * locked/upsell state is handled by the destination screen, not here.
 */
export interface QuickAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** expo-router path pushed on tap. */
  route: string;
  /** Shows a gold Premium dot; does NOT block navigation. */
  premium?: boolean;
  /** Screen-reader label. Falls back to `label`. */
  accessibilityLabel?: string;
  /** Optional guided-tour target key so the tour can spotlight this item. */
  tourKey?: TourTargetKey;
}

interface Props {
  items: QuickAction[];
  /**
   * Color of the header behind the row — used as the ring around the gold
   * Premium dot so it reads on the gradient. Defaults to the deep brand violet.
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
  onPress: (route: string) => void;
}) {
  const tourRef = useTourTarget(item.tourKey);
  const { label, Icon, premium, accessibilityLabel } = item;
  return (
    <TouchableOpacity
      ref={tourRef}
      style={styles.item}
      activeOpacity={0.75}
      onPress={() => onPress(item.route)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <View style={styles.circle}>
        <Icon size={21} color="#fff" strokeWidth={1.9} />
        {premium && (
          <View
            style={[styles.premiumDot, { borderColor: headerColor }]}
            importantForAccessibility="no"
          />
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

  const handlePress = useCallback(
    (route: string) => {
      pokeInteraction();
      router.push(route as never);
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

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Keep the horizontal pan gesture confined to this row so it never fights
      // the screen's vertical scroll.
      directionalLockEnabled
      contentContainerStyle={styles.content}
      style={styles.row}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 18,
    marginHorizontal: -18, // bleed to the header edges so items can scroll off-screen
  },
  content: {
    paddingHorizontal: 18,
    gap: 10,
    // Horizontal ScrollViews are mirrored natively by RN in RTL, so the row
    // and its scroll direction flip automatically in Arabic.
    alignItems: 'flex-start',
  },
  item: {
    width: 64,
    flexGrow: 0,
    flexShrink: 0,
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
  premiumDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: palette.gold,
    borderWidth: 1.5,
  },
  label: {
    marginTop: 6,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default React.memo(QuickActionsRow);
