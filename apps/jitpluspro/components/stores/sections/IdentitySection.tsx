import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, ImagePlus, Tags, Quote, AlignLeft } from 'lucide-react-native';
import { JitStore } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile, type MerchantProfilePayload } from '@/hooks/useQueryHooks';
import { useMerchantMedia } from '@/hooks/useMerchantMedia';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { resolveImageUrl } from '@/utils/imageUrl';
import { getErrorMessage } from '@/utils/error';
import { getCategoryLabel, CATEGORY_ICONS } from '@/constants/categories';
import type { Merchant, MerchantCategory } from '@/types';
import { PrimaryCategoryChips, SecondaryChips } from '@/components/stores/FicheControls';
import {
  Panel, ProPill, CountPill, SaveBar, SectionScreen, TextField, useDiscardGuard, useToast, haptic, ui,
} from '@/components/stores/StoreUi';
import { brandColor, sameMembers } from '@/components/stores/brand';

const NAME_MAX = 100;
const TAGLINE_MAX = 120;
const DESCRIPTION_MAX = 1000;
const SECONDARY_MAX = 3;

function initialSecondary(m: Merchant): MerchantCategory[] {
  return (m.secondaryCategories ?? []).filter((c) => c !== m.categorie);
}

/** Brand name, photos, categories, tagline and description. */
export default function IdentitySection({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const { updateMerchant } = useAuthActions();
  const toast = useToast();
  const media = useMerchantMedia();
  const update = useUpdateMerchantProfile();
  const accent = brandColor(merchant.themeColor);
  const { isPremium } = usePlanStatus(merchant);

  const [nom, setNom] = useState(merchant.nom);
  const [categorie, setCategorie] = useState<MerchantCategory>(merchant.categorie);
  const [secondary, setSecondary] = useState<MerchantCategory[]>(() => initialSecondary(merchant));
  const [tagline, setTagline] = useState(merchant.tagline ?? '');
  const [description, setDescription] = useState(merchant.description ?? '');
  const [pickingPrimary, setPickingPrimary] = useState(false);

  const changes = useMemo<MerchantProfilePayload>(() => {
    const out: MerchantProfilePayload = {};
    if (nom.trim() !== merchant.nom) out.nom = nom.trim();
    if (categorie !== merchant.categorie) out.categorie = categorie;
    if (!sameMembers(secondary, initialSecondary(merchant))) out.secondaryCategories = secondary;
    if (tagline.trim() !== (merchant.tagline ?? '').trim()) out.tagline = tagline.trim() || null;
    if (description.trim() !== (merchant.description ?? '').trim()) out.description = description.trim();
    return out;
  }, [nom, categorie, secondary, tagline, description, merchant]);
  const dirty = Object.keys(changes).length > 0;
  useDiscardGuard(dirty, update.isPending);

  const selectPrimary = useCallback((cat: MerchantCategory) => {
    haptic();
    setCategorie(cat);
    setSecondary((prev) => prev.filter((c) => c !== cat));
    setPickingPrimary(false);
  }, []);

  const toggleSecondary = useCallback((cat: MerchantCategory) => {
    haptic();
    setSecondary((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      return prev.length >= SECONDARY_MAX ? prev : [...prev, cat];
    });
  }, []);

  const showToast = toast.show;
  const save = useCallback(async () => {
    if (changes.nom !== undefined && !changes.nom) {
      Alert.alert(t('common.error'), t('storesHub.nameRequired'));
      return;
    }
    try {
      updateMerchant(await update.mutateAsync(changes));
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [changes, update, updateMerchant, showToast, t]);

  const CategoryIcon = CATEGORY_ICONS[categorie] ?? JitStore;

  return (
    <SectionScreen
      title={t('storesHub.identityTitle')}
      caption={t('storesHub.identityCaption')}
      toast={toast.message}
      footer={<SaveBar dirty={dirty} saving={update.isPending} onSave={save} />}
    >
      <Panel Icon={Camera} title={t('storesHub.photosTitle')} caption={t('storesHub.photosCaption')}>
        <View>
          <TouchableOpacity
            onPress={media.openCover}
            activeOpacity={0.85}
            style={[styles.cover, { alignItems: dir.alignEnd }]}
            accessibilityRole="button"
            accessibilityLabel={t('storesHub.editCover')}
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
            <Text style={[ui.fieldLabel, { color: theme.text }]}>{t('storesHub.logoLabel')}</Text>
            {isPremium ? null : <ProPill />}
          </View>
        </View>
      </Panel>

      <Panel Icon={JitStore} title={t('storesHub.nameTitle')}>
        <TextField
          label={t('storesHub.nameLabel')}
          value={nom}
          onChangeText={setNom}
          maxLength={NAME_MAX}
          placeholder={t('storesHub.namePlaceholder')}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="organizationName"
          returnKeyType="done"
        />
      </Panel>

      <Panel
        Icon={Tags}
        title={t('storesHub.categoriesTitle')}
        caption={t('storePreview.secondaryCategoriesHint', { max: SECONDARY_MAX })}
      >
        <Text style={[ui.fieldLabel, { color: theme.text, textAlign: dir.textAlign }]}>{t('storesHub.primaryCategory')}</Text>
        {pickingPrimary ? (
          <View style={styles.block}>
            <PrimaryCategoryChips selected={categorie} accent={accent} onSelect={selectPrimary} />
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setPickingPrimary(true)}
            activeOpacity={0.8}
            style={[styles.primaryRow, { flexDirection: dir.row, backgroundColor: `${accent}12` }]}
            accessibilityRole="button"
            accessibilityHint={t('storesHub.changeCategory')}
          >
            <CategoryIcon size={18} color={accent} strokeWidth={icon.stroke} />
            <Text style={[styles.primaryLabel, { color: accent, textAlign: dir.textAlign }]} numberOfLines={1}>{getCategoryLabel(categorie)}</Text>
            <Text style={[ui.caption, { color: theme.textSecondary }]}>{t('storesHub.changeCategory')}</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.secondaryHeader, { flexDirection: dir.row }]}>
          <Text style={[ui.fieldLabel, styles.flex, { color: theme.text, textAlign: dir.textAlign }]}>{t('storePreview.secondaryCategoriesTitle')}</Text>
          <CountPill value={`${secondary.length}/${SECONDARY_MAX}`} />
        </View>
        <SecondaryChips primaryCategory={categorie} selected={secondary} max={SECONDARY_MAX} accent={accent} onToggle={toggleSecondary} />
      </Panel>

      <Panel Icon={AlignLeft} title={t('storesHub.descriptionTitle')} caption={t('storesHub.descriptionCaption')}>
        <View style={styles.fields}>
          <TextField
            label={t('storePreview.taglineTitle')}
            Icon={Quote}
            value={tagline}
            onChangeText={setTagline}
            maxLength={TAGLINE_MAX}
            placeholder={t('storePreview.taglinePlaceholder')}
            counter
            hint={t('storePreview.taglineHint')}
          />
          <TextField
            label={t('storesHub.descriptionLabel')}
            value={description}
            onChangeText={setDescription}
            maxLength={DESCRIPTION_MAX}
            placeholder={t('stores.descPlaceholder')}
            multiline
            counter
            hint={t('stores.ugcNotice')}
          />
        </View>
      </Panel>

      {media.modals}
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fields: { gap: 16 },
  block: { marginTop: 10 },
  cover: { height: 132, borderRadius: 16, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'flex-end', padding: 10 },
  coverAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.6)' },
  coverActionText: { color: '#fff', fontSize: 12, fontFamily: font.semibold },
  logoRing: { position: 'absolute', bottom: -34, width: 76, height: 76, borderRadius: 38, padding: 3 },
  logoRingLtr: { left: 14 },
  logoRingRtl: { right: 14 },
  logo: { width: '100%', height: '100%', borderRadius: 35 },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  logoBusy: { ...StyleSheet.absoluteFill, margin: 3, borderRadius: 35, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center' },
  logoMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 28 },
  logoMetaLtr: { marginLeft: 102 },
  logoMetaRtl: { marginRight: 102 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12 },
  primaryLabel: { flex: 1, fontSize: 14, fontFamily: font.semibold },
  secondaryHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
});
