import { memo, useCallback, useState } from 'react';
import {
  View, Pressable, Modal, FlatList, StyleSheet, useWindowDimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Text } from '@/components/AppText';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { resolveImageUrl } from '@/utils/imageUrl';
import { wp, hp, ms } from '@/utils/responsive';
import FicheSection from './FicheSection';

const COLUMNS = 3;
const GRID_GAP = wp(4);
/** Page side padding, on both sides. */
const GRID_INSET = wp(16) * 2;

interface ViewerProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

function GalleryViewer({ images, initialIndex, onClose }: ViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const [index, setIndex] = useState(initialIndex);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }, [width]);

  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
    [width],
  );

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewer}>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onMomentumEnd}
          keyExtractor={(url, i) => `${url}-${i}`}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          renderItem={({ item }) => (
            <View style={{ width, height, justifyContent: 'center' }}>
              <Image
                source={resolveImageUrl(item)}
                style={{ width, height: height * 0.78 }}
                contentFit="contain"
                cachePolicy="memory-disk"
                recyclingKey={item}
                transition={150}
              />
            </View>
          )}
        />
        <View style={[styles.viewerTop, { top: insets.top + hp(8) }]} pointerEvents="box-none">
          <View style={styles.counter}>
            <Text style={[styles.counterText, { fontFamily: fonts.semibold }]}>{`${index + 1} / ${images.length}`}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.close} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={ms(22)} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface Props {
  images: string[];
}

/** Photos tab: a grid of thumbnails opening a full-screen viewer. */
function MerchantGallery({ images }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setOpenIndex(null), []);

  if (images.length === 0) return null;
  const size = Math.floor((width - GRID_INSET - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <>
      <FicheSection title={`${t('merchant.galleryTitle')} (${images.length})`}>
        <View style={styles.grid}>
          {images.map((url, i) => (
            <Pressable
              key={`${url}-${i}`}
              onPress={() => { haptic(); setOpenIndex(i); }}
              style={({ pressed }) => [styles.thumb, { width: size, height: size, backgroundColor: theme.bgSkeleton, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${t('merchant.galleryTitle')} ${i + 1}/${images.length}`}
            >
              <Image
                source={resolveImageUrl(url)}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={url}
                transition={150}
              />
            </Pressable>
          ))}
        </View>
      </FicheSection>
      {openIndex !== null && <GalleryViewer images={images} initialIndex={openIndex} onClose={closeViewer} />}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  thumb: { borderRadius: ms(4), overflow: 'hidden' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  viewerTop: {
    position: 'absolute', left: wp(16), right: wp(16),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  counter: { paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  counterText: { color: '#fff', fontSize: ms(13) },
  close: {
    width: ms(40), height: ms(40), borderRadius: ms(20),
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
});

export default memo(MerchantGallery);
