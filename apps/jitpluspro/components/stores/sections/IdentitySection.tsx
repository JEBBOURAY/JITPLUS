import { useCallback, useMemo, useState } from 'react';
import { toast as notify } from '@/components/ui/Toast';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/AppText';
import { Camera, Tags, AlignLeft } from 'lucide-react-native';
import { JitStore } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile, type MerchantProfilePayload } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { getCategoryLabel, CATEGORY_ICONS } from '@/constants/categories';
import type { Merchant, MerchantCategory } from '@/types';
import { PrimaryCategoryChips, SecondaryChips } from '@/components/stores/FicheControls';
import {
  Panel, CountPill, SaveBar, SectionScreen, TextField, useDiscardGuard, useToast, haptic, ui,
} from '@/components/stores/StoreUi';
import { brandColor, sameMembers } from '@/components/stores/brand';
import { BrandPhotosEditor } from '@/components/stores/BrandPhotosEditor';
import { AboutFields, aboutChanges } from '@/components/stores/AboutFields';

const NAME_MAX = 100;
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
  const update = useUpdateMerchantProfile();
  const accent = brandColor(merchant.themeColor);

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
    return { ...out, ...aboutChanges(merchant, tagline, description) };
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
      notify.error(t('storesHub.nameRequired'));
      return;
    }
    try {
      updateMerchant(await update.mutateAsync(changes));
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      notify.error(getErrorMessage(err));
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
        <BrandPhotosEditor merchant={merchant} />
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
        <AboutFields
          tagline={tagline}
          onChangeTagline={setTagline}
          description={description}
          onChangeDescription={setDescription}
          descriptionPlaceholder={t('stores.descPlaceholder')}
          descriptionHint={t('stores.ugcNotice')}
        />
      </Panel>
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { marginTop: 10 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12 },
  primaryLabel: { flex: 1, fontSize: 14, fontFamily: font.semibold },
  secondaryHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
});
