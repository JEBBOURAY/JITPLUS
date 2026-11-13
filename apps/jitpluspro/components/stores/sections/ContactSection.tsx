import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Share2, Phone, Mail, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { icon } from '@/constants/design';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile, useStores } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import type { Merchant, Store } from '@/types';
import {
  Panel, SaveBar, SectionScreen, useDiscardGuard, usePressGuard, useToast, fieldFill, haptic, ui,
} from '@/components/stores/StoreUi';
import { SocialLinksFields } from '@/components/stores/SocialLinksFields';
import { useSocialDraft } from '@/components/stores/useSocialDraft';

function StoreContactRow({ store, onPress }: { store: Store; onPress: (s: Store) => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  return (
    <TouchableOpacity
      onPress={() => onPress(store)}
      activeOpacity={0.75}
      style={[styles.storeRow, { flexDirection: dir.row, backgroundColor: fieldFill(theme) }]}
      accessibilityRole="button"
    >
      <View style={styles.flex}>
        <Text style={[ui.fieldLabel, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1}>{store.nom}</Text>
        <View style={[styles.storeMeta, { flexDirection: dir.row }]}>
          <Phone size={12} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text style={[ui.caption, styles.flex, { color: store.telephone ? theme.textSecondary : theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1}>
            {store.telephone || t('storesHub.notSet')}
          </Text>
        </View>
        <View style={[styles.storeMeta, { flexDirection: dir.row }]}>
          <Mail size={12} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text style={[ui.caption, styles.flex, { color: store.email ? theme.textSecondary : theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1}>
            {store.email || t('storesHub.notSet')}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={dir.flip} />
    </TouchableOpacity>
  );
}

/** Brand-wide social links, plus the per-location phone and email. */
export default function ContactSection({ merchant }: { merchant: Merchant }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { updateMerchant } = useAuthActions();
  const toast = useToast();
  const update = useUpdateMerchantProfile();
  const { data: stores = [] } = useStores();
  const social = useSocialDraft(merchant.socialLinks);
  useDiscardGuard(social.dirty, update.isPending);

  const guarded = usePressGuard();
  const openStore = useCallback((store: Store) => {
    guarded(() => router.push({ pathname: '/store-form', params: { storeId: store.id } }));
  }, [guarded, router]);

  const showToast = toast.show;
  const { invalid, toLinks, reset } = social;
  const save = useCallback(async () => {
    if (invalid.length > 0) {
      Alert.alert(t('common.error'), t('storesHub.socialInvalid'));
      return;
    }
    try {
      const updated = await update.mutateAsync({ socialLinks: toLinks() });
      updateMerchant(updated);
      reset(updated.socialLinks);
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [invalid.length, toLinks, reset, update, updateMerchant, showToast, t]);

  return (
    <SectionScreen
      title={t('storesHub.contactTitle')}
      caption={t('storesHub.contactCaption')}
      toast={toast.message}
      footer={<SaveBar dirty={social.dirty} saving={update.isPending} onSave={save} />}
    >
      <Panel Icon={Share2} title={t('storesHub.socialTitle')} caption={t('storesHub.socialCaption')}>
        <SocialLinksFields draft={social.draft} invalid={social.invalid} onChange={social.setField} />
      </Panel>

      <Panel Icon={Phone} title={t('storesHub.perStoreTitle')} caption={t('storesHub.perStoreCaption')}>
        <View style={styles.stores}>
          {stores.map((store) => <StoreContactRow key={store.id} store={store} onPress={openStore} />)}
        </View>
      </Panel>
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stores: { gap: 8 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  storeMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
