import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';

export interface Tool {
  key: string;
  label: string;
  hint: string;
  /** Illustration shown above the label (bundled PNG, transparent background). */
  image: ImageSource | number;
  /** expo-router path pushed on tap. */
  route?: string;
  /** Runs instead of a navigation, e.g. to open a sheet. */
  onPress?: () => void;
  /** Something is left to do: the hint turns red and a dot marks the card. */
  alert?: boolean;
  /** Steps done out of a total: drawn as a ring with the count on the card. */
  progress?: { done: number; total: number };
}

interface Props {
  title: string;
  tools: Tool[];
}

const COLUMNS = 2;

function toRows(items: Tool[]): Tool[][] {
  const rows: Tool[][] = [];
  for (let i = 0; i < items.length; i += COLUMNS) rows.push(items.slice(i, i + COLUMNS));
  return rows;
}

const RING_SIZE = 44;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Ring filled to done/total with the count inside; a green check once complete. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const theme = useTheme();
  const complete = done >= total;
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  const color = complete ? theme.success : theme.primary;
  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={theme.border}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${RING_LENGTH} ${RING_LENGTH}`}
          strokeDashoffset={RING_LENGTH * (1 - ratio)}
          fill="none"
        />
      </Svg>
      {complete ? (
        <Check size={20} color={color} strokeWidth={icon.strokeSmall} />
      ) : (
        <Text style={[styles.ringText, { color: theme.text }]} allowFontScaling={false}>
          {done}/{total}
        </Text>
      )}
    </View>
  );
}

const ToolCard = React.memo(function ToolCard({
  tool,
  onPress,
}: {
  tool: Tool;
  onPress: (tool: Tool) => void;
}) {
  const theme = useTheme();
  const dir = useDir();
  const { label, hint, image, alert, progress } = tool;
  // Steps are left: the hint stands out in the brand colour.
  const pending = !!progress && progress.done < progress.total;
  const hintColor = alert ? theme.danger : pending ? theme.primary : theme.textMuted;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.bgCard, borderColor: theme.border },
        { alignItems: dir.alignStart },
      ]}
      activeOpacity={0.75}
      onPress={() => onPress(tool)}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${hint}`}
    >
      <Image source={image} style={styles.image} contentFit="contain" accessible={false} />
      <View style={styles.text}>
        <Text
          style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]}
          numberOfLines={1}
          // Longer names shrink slightly on narrow phones instead of being cut.
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
        <Text
          style={[styles.hint, pending && styles.hintPending, { color: hintColor, textAlign: dir.textAlign }]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
        >
          {hint}
        </Text>
      </View>
      {progress && (
        <View
          style={[styles.ringWrap, dir.isRTL ? { left: 12 } : { right: 12 }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <ProgressRing done={progress.done} total={progress.total} />
        </View>
      )}
      {alert && (
        <View
          style={[styles.dot, { backgroundColor: theme.danger }, dir.isRTL ? { left: 12 } : { right: 12 }]}
          importantForAccessibility="no"
        />
      )}
    </TouchableOpacity>
  );
});

/**
 * "Mes outils" on Accueil: every merchant tool as a card, two per row. All
 * cards share one size and carry a one-line explanation under the label.
 */
function ToolsGrid({ title, tools }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const dir = useDir();

  const handlePress = useCallback(
    (tool: Tool) => {
      if (tool.onPress) tool.onPress();
      else if (tool.route) router.push(tool.route as never);
    },
    [router],
  );

  return (
    <View>
      <Text
        style={[styles.title, { color: theme.text, textAlign: dir.textAlign }]}
        accessibilityRole="header"
        maxFontSizeMultiplier={1.4}
      >
        {title}
      </Text>
      <View style={styles.rows}>
        {toRows(tools).map((row) => (
          <View key={row[0].key} style={[styles.row, { flexDirection: dir.row }]}>
            {row.map((tool) => (
              <ToolCard key={tool.key} tool={tool} onPress={handlePress} />
            ))}
            {row.length < COLUMNS && <View style={styles.filler} />}
          </View>
        ))}
      </View>
    </View>
  );
}

export default React.memo(ToolsGrid);

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: font.semibold,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  rows: { gap: 12 },
  row: { gap: 12, alignItems: 'stretch' },
  filler: { flex: 1 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  // The artwork carries its own violet disc and margin, so it sits flush in the corner.
  image: { width: 72, height: 72, margin: -4 },
  text: { alignSelf: 'stretch', marginTop: 8 },
  label: {
    fontSize: 16,
    fontFamily: font.semibold,
    letterSpacing: -0.2,
  },
  hint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    // Two lines are always reserved so every card has the same height.
    minHeight: 32,
    fontFamily: font.regular,
  },
  hintPending: { fontFamily: font.semibold },
  ringWrap: { position: 'absolute', top: 12 },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  // Starts the arc at 12 o'clock.
  ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  ringText: { fontSize: 12, fontFamily: font.semibold, letterSpacing: -0.2 },
  dot: {
    position: 'absolute',
    top: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
