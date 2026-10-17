import React, { memo, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, FlatList, StyleSheet, useWindowDimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Images, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { resolveImageUrl } from '@/utils/imageUrl';
import { wp, hp, ms } from '@/utils/responsive';
import MerchantSection from './MerchantSection';

const THUMB_SIZE = wp(128);

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
  accent: string;
}

function MerchantGallery({ images, accent }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setOpenIndex(null), []);

  if (images.length === 0) return null;

  return (
    <>
      <MerchantSection
        title={t('merchant.galleryTitle')}
        icon={Images}
        accent={accent}
        right={<Text style={[styles.count, { color: theme.textMuted, fontFamily: fonts.semibold }]}>{images.length}</Text>}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {images.map((url, i) => (
            <Pressable
              key={`${url}-${i}`}
              onPress={() => { haptic(); setOpenIndex(i); }}
              style={({ pressed }) => [styles.thumb, { backgroundColor: theme.bgSkeleton, opacity: pressed ? 0.85 : 1 }]}
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
        </ScrollView>
      </MerchantSection>
      {openIndex !== null && <GalleryViewer images={images} initialIndex={openIndex} onClose={closeViewer} />}
    </>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: ms(13) },
  thumbs: { gap: wp(10) },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: ms(16), overflow: 'hidden' },
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
