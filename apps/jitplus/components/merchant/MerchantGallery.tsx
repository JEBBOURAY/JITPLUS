import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { merchantStyles as styles } from './merchantStyles';
import { haptic } from '@/utils/haptics';
import { resolveImageUrl } from '@/utils/imageUrl';
import type { Merchant } from '@/types';

interface Props {
  merchant: Merchant;
  theme: { bg: string; bgCard: string; text: string };
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantGallery({ merchant, theme, t }: Props) {
  const gallery = merchant.gallery ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (gallery.length === 0) return null;
  const { width: screenW, height: screenH } = Dimensions.get('window');

  return (
    <>
      <View style={styles.galleryCard}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('merchant.galleryTitle')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.galleryScrollContent}
        >
          {gallery.map((url, idx) => (
            <Pressable
              key={`${url}-${idx}`}
              onPress={() => { haptic(); setOpenIdx(idx); }}
              style={styles.galleryThumbBtn}
            >
              <Image
                source={resolveImageUrl(url)}
                style={styles.galleryThumb}
                contentFit="cover"
                cachePolicy="disk"
                recyclingKey={url}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Modal
        visible={openIdx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenIdx(null)}
      >
        <View style={styles.galleryModal}>
          <Pressable style={styles.galleryClose} onPress={() => setOpenIdx(null)} hitSlop={12}>
            <X size={26} color="#fff" strokeWidth={2} />
          </Pressable>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={openIdx !== null ? { x: openIdx * screenW, y: 0 } : undefined}
          >
            {gallery.map((url, idx) => (
              <View key={`${url}-full-${idx}`} style={{ width: screenW, height: screenH, justifyContent: 'center', alignItems: 'center' }}>
                <Image
                  source={resolveImageUrl(url)}
                  style={{ width: screenW, height: screenH * 0.8 }}
                  contentFit="contain"
                  cachePolicy="disk"
                  recyclingKey={url}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export default React.memo(MerchantGallery);
