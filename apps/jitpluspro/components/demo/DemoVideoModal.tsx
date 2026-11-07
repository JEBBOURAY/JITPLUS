import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RotateCcw, X } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { font, icon as iconTokens } from '@/constants/design';
import { demoVideoUrl, type DemoId } from '@/constants/demoVideos';

interface Props {
  id: DemoId;
  visible: boolean;
  onClose: () => void;
}

/** Vertical 9:16 clip, contained in the screen. */
const ASPECT = 9 / 16;

/**
 * Mounted only while the modal is open, so the player is created on open and
 * released (playback stopped) on close. `key` remounts it for a retry.
 */
function DemoPlayer({ url, onRetry }: { url: string; onRetry: () => void }) {
  const { t } = useLanguage();
  const { width, height } = useWindowDimensions();
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // Belt-and-braces: release() on unmount already stops it, pause first so no audio leaks during the slide-out.
  useEffect(() => () => {
    try { player.pause(); } catch { /* already released */ }
  }, [player]);

  const videoWidth = Math.min(width, height * ASPECT);

  return (
    <View style={styles.stage}>
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture={false}
        style={{ width: videoWidth, height: videoWidth / ASPECT, maxHeight: height }}
      />
      {status === 'loading' || status === 'idle' ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" accessibilityLabel={t('common.loading')} />
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={styles.overlay}>
          <Text style={styles.errorText} maxFontSizeMultiplier={1.4} accessibilityLiveRegion="polite">
            {t('demo.error')}
          </Text>
          <TouchableOpacity
            onPress={onRetry}
            style={styles.retryBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('demo.retry')}
          >
            <RotateCcw size={iconTokens.sm} color="#0F172A" strokeWidth={iconTokens.strokeSmall} />
            <Text style={styles.retryText} maxFontSizeMultiplier={1.3}>{t('demo.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export function DemoVideoModal({ id, visible, onClose }: Props) {
  if (!visible) return null;
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait']}>
      <StatusBar barStyle="light-content" />
      <DemoScreen id={id} onClose={onClose} />
    </Modal>
  );
}

function DemoScreen({ id, onClose }: Omit<Props, 'visible'>) {
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const [attempt, setAttempt] = useState(0);

  return (
    <View style={styles.root}>
      <DemoPlayer key={attempt} url={demoVideoUrl(id, locale)} onRetry={() => setAttempt((n) => n + 1)} />
      <TouchableOpacity
        onPress={onClose}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[styles.closeBtn, { top: insets.top + 12 }, { right: insets.right + 16 }]}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <X size={iconTokens.md} color="#FFFFFF" strokeWidth={iconTokens.strokeSmall} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  errorText: { color: '#FFFFFF', fontFamily: font.medium, fontSize: 15, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  retryText: { color: '#0F172A', fontFamily: font.semibold, fontSize: 14 },
  closeBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
