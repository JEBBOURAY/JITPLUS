import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, ImagePlus } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { useMerchantMedia } from '@/hooks/useMerchantMedia';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { resolveImageUrl } from '@/utils/imageUrl';
import { Panel, ProPill } from '@/components/stores/StoreUi';
import { brandColor } from '@/components/stores/brand';
import { DonePill } from '@/components/setup/SetupUi';
import type { StepProps } from '@/components/setup/stepProps';

/** Logo and cover photo. Uploads apply immediately, so there is nothing to save on "Continuer". */
export function BrandStep({ merchant }: Pick<StepProps, 'merchant'>) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const media = useMerchantMedia();
  const { isPremium } = usePlanStatus(merchant);
  const accent = brandColor(merchant.themeColor);

  return (
    <>
      <Panel Icon={Camera} title={t('storesHub.photosTitle')} caption={t('setup.brand.caption')}>
        <View>
          <TouchableOpacity
            onPress={media.openCover}
            activeOpacity={0.85}
            style={[styles.cover, { alignItems: dir.alignEnd }]}
            accessibilityRole="button"
            accessibilityLabel={merchant.coverUrl ? t('storesHub.editCover') : t('storesHub.addCover')}
          >
            {merchant.coverUrl ? (
              <ExpoImage source={resolveImageUrl(merchant.coverUrl)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <LinearGradient colors={[`${accent}55`, `${accent}14`]} style={StyleSheet.absoluteFill} />
            )}
            <View style={[styles.coverAction, { flexDirection: dir.row }]}>
              {media.coverUploading ? <ActivityIndicator size="small" color="#fff" /> : <ImagePlus size={14} color="#fff" strokeWidth={icon.strokeSmall} />}
              <Text style={styles.coverActionText} numberOfLines={1}>
                {merchant.coverUrl ? t('storesHub.editCover') : t('storesHub.addCover')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={media.openLogo}
            activeOpacity={0.85}
            style={[styles.logoRing, dir.isRTL ? styles.logoRingRtl : styles.logoRingLtr, { backgroundColor: theme.bgCard }]}
            accessibilityRole="button"
            accessibilityLabel={t('storesHub.editLogo')}
          >
            {merchant.logoUrl ? (
              <ExpoImage source={resolveImageUrl(merchant.logoUrl)} style={styles.logo} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.logo, styles.logoEmpty, { backgroundColor: `${accent}1A` }]}>
                <Camera size={22} color={accent} strokeWidth={icon.stroke} />
              </View>
            )}
            {media.logoUploading ? (
              <View style={styles.logoBusy}><ActivityIndicator size="small" color="#fff" /></View>
            ) : null}
          </TouchableOpacity>
          <View style={[styles.logoMeta, dir.isRTL ? styles.logoMetaRtl : styles.logoMetaLtr, { flexDirection: dir.row }]}>
            <Text style={[styles.label, { color: theme.text }]}>{t('storesHub.logoLabel')}</Text>
            {isPremium ? null : <ProPill />}
          </View>
        </View>

        <View style={[styles.status, { flexDirection: dir.row }]}>
          <DonePill done={!!merchant.logoUrl} doneLabel={t('setup.brand.logoDone')} todoLabel={t('setup.brand.logoTodo')} />
          <DonePill done={!!merchant.coverUrl} doneLabel={t('setup.brand.coverDone')} todoLabel={t('setup.brand.coverTodo')} />
        </View>
      </Panel>
      {media.modals}
    </>
  );
}

const styles = StyleSheet.create({
  cover: { height: 132, borderRadius: 16, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'flex-end', padding: 10 },
  coverAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.6)' },
  coverActionText: { color: '#fff', fontSize: 12, fontFamily: font.semibold },
  logoRing: { position: 'absolute', bottom: -34, width: 76, height: 76, borderRadius: 38, padding: 3 },
  logoRingLtr: { left: 14 },
  logoRingRtl: { right: 14 },
  logo: { width: '100%', height: '100%', borderRadius: 35 },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  logoBusy: { ...StyleSheet.absoluteFill, margin: 3, borderRadius: 35, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center' },
  logoMeta: { alignItems: 'center', gap: 8, marginTop: 10, minHeight: 28 },
  logoMetaLtr: { marginLeft: 102 },
  logoMetaRtl: { marginRight: 102 },
  label: { fontSize: 13, fontFamily: font.semibold },
  status: { gap: 8, marginTop: 14, flexWrap: 'wrap' },
});
