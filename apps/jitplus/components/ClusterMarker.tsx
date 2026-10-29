/**
 * ClusterMarker — simple square marker showing the exact clustered count.
 */
import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useLanguage } from '@/contexts/LanguageContext';

const VIOLET = '#7C3AED';
const SIZE = 34;

interface Props {
  count: number;
}

const ClusterMarker = memo(function ClusterMarker({ count }: Props) {
  const { t } = useLanguage();
  return (
    <View collapsable={false} style={styles.root} accessibilityLabel={t('discover.merchantCount', { count })} accessibilityRole="image">
      <View collapsable={false} style={styles.square}>
        <Text style={styles.countText}>{String(count)}</Text>
      </View>
    </View>
  );
});

export default ClusterMarker;

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: {
    width: SIZE,
    height: SIZE,
    borderRadius: 6,
    backgroundColor: VIOLET,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
});

