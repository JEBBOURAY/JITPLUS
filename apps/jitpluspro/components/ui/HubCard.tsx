import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Image, type ImageSource } from 'expo-image';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';

interface HubCardProps {
  /** Illustration of the "Mes outils" family. */
  image: ImageSource | number;
  title: string;
  description: string;
  onPress: () => void;
  /** Read after the title and description by screen readers (e.g. "Pro"). */
  accessibilitySuffix?: string;
  /** Extra content under the description (a badge…). */
  children?: ReactNode;
}

/** One sub-page of a hub screen (Carte de fidélité, Jeux, Affiche): illustration, title, description. */
export function HubCard({ image, title, description, onPress, accessibilitySuffix, children }: HubCardProps) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: dir.row }]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={[title, description, accessibilitySuffix].filter(Boolean).join(', ')}
    >
      <Image source={image} style={styles.image} contentFit="contain" accessible={false} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
          {description}
        </Text>
        {children}
      </View>
      <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={dir.flip} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', padding: 14, gap: 14, borderRadius: 18, borderWidth: 1 },
  // The artwork carries its own violet disc and margin.
  image: { width: 76, height: 76, margin: -4 },
  content: { flex: 1, gap: 6 },
  title: { fontSize: 16, fontFamily: font.semibold, letterSpacing: -0.2 },
  description: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
});
