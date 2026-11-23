import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gift } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { resolveImageUrl } from '@/utils/imageUrl';
import { ms, radius } from '@/utils/responsive';

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
        <Gift size={ms(20)} color={theme.textSecondary} strokeWidth={1.75} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: ms(48), height: ms(48), borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});

export default memo(RewardThumb);
