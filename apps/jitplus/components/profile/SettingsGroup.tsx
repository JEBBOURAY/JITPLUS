import { Children, Fragment, memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';

interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
}

/** Card that stacks rows with inset hairline separators (iOS-settings style). */
function SettingsGroup({ title, children }: SettingsGroupProps) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.wrap}>
      {!!title && (
        <Text style={[styles.title, { color: theme.textMuted, fontFamily: fonts.semibold }]} accessibilityRole="header">
          {title}
        </Text>
      )}
      <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export default memo(SettingsGroup);

const styles = StyleSheet.create({
  wrap: { marginBottom: hp(20) },
  title: {
    fontSize: FS.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: hp(8),
    marginHorizontal: wp(6),
    textAlign: 'left',
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Inset so the line starts after the icon tile (padding + tile + gap).
  separator: { height: StyleSheet.hairlineWidth, marginStart: wp(14) + ms(36) + wp(12) },
});
