import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gift } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { resolveImageUrl } from '@/utils/imageUrl';
import { ms } from '@/utils/responsive';

/** Reward picture, or a neutral gift icon. */
function RewardThumb({ imageUrl }: { imageUrl?: string | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: theme.bgInput }]}>
      {imageUrl ? (
        <Image
          source={resolveImageUrl(imageUrl)}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={imageUrl}
        />
      ) : (
        <Gift size={ms(20)} color={theme.textSecondary} strokeWidth={1.8} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: ms(44), height: ms(44), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});

export default memo(RewardThumb);
