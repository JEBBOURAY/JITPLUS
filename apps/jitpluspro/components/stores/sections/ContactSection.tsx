import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Share2, Phone, Mail, ChevronRight, Instagram, Music2, Facebook, Ghost, Youtube, MessageCircle, Globe,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { icon } from '@/constants/design';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile, useStores } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import type { Merchant, SocialLinks, Store } from '@/types';
import {
  Panel, SaveBar, SectionScreen, TextField, useDiscardGuard, usePressGuard, useToast, fieldFill, haptic, ui,
} from '@/components/stores/StoreUi';
import { SOCIAL_KEYS, normalizeSocial, isValidSocial, type SocialKey } from '@/components/stores/brand';

const NETWORK_UI: Record<SocialKey, { Icon: LucideIcon; color: string; label: string; placeholder: string; keyboard?: 'phone-pad' | 'url' }> = {
  whatsapp: { Icon: MessageCircle, color: '#25D366', label: 'WhatsApp', placeholder: '+212 6 12 34 56 78', keyboard: 'phone-pad' },
  instagram: { Icon: Instagram, color: '#E1306C', label: 'Instagram', placeholder: '@maboutique' },
  tiktok: { Icon: Music2, color: '#111827', label: 'TikTok', placeholder: '@maboutique' },
  facebook: { Icon: Facebook, color: '#1877F2', label: 'Facebook', placeholder: 'maboutique' },
  snapchat: { Icon: Ghost, color: '#C9A400', label: 'Snapchat', placeholder: 'maboutique' },
  youtube: { Icon: Youtube, color: '#FF0000', label: 'YouTube', placeholder: '@maboutique' },
  website: { Icon: Globe, color: '#7C3AED', label: '', placeholder: 'https://maboutique.ma', keyboard: 'url' },
};

type Draft = Record<SocialKey, string>;

function toDraft(links?: SocialLinks | null): Draft {
  return Object.fromEntries(SOCIAL_KEYS.map((k) => [k, links?.[k] ?? ''])) as Draft;
}

function normalizeDraft(draft: Draft): Draft {
  return Object.fromEntries(SOCIAL_KEYS.map((k) => [k, normalizeSocial(k, draft[k])])) as Draft;
}

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

  // Compared in normalized form so links saved by older app versions
  // (e.g. a website without https://) do not show up as unsaved changes.
  const saved = useMemo(() => normalizeDraft(toDraft(merchant.socialLinks)), [merchant.socialLinks]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(merchant.socialLinks));

  const normalized = useMemo(() => normalizeDraft(draft), [draft]);
  const invalid = useMemo(() => SOCIAL_KEYS.filter((k) => !isValidSocial(k, normalized[k])), [normalized]);
  const dirty = SOCIAL_KEYS.some((k) => normalized[k] !== saved[k]);
  useDiscardGuard(dirty, update.isPending);

  const setField = useCallback((key: SocialKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const guarded = usePressGuard();
  const openStore = useCallback((store: Store) => {
    guarded(() => router.push({ pathname: '/store-form', params: { storeId: store.id } }));
  }, [guarded, router]);

  const showToast = toast.show;
  const save = useCallback(async () => {
    if (invalid.length > 0) {
      Alert.alert(t('common.error'), t('storesHub.socialInvalid'));
      return;
    }
    const socialLinks: SocialLinks = {};
    for (const k of SOCIAL_KEYS) if (normalized[k]) socialLinks[k] = normalized[k];
    try {
      const updated = await update.mutateAsync({ socialLinks });
      updateMerchant(updated);
      setDraft(toDraft(updated.socialLinks));
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [invalid.length, normalized, update, updateMerchant, showToast, t]);

  return (
    <SectionScreen
      title={t('storesHub.contactTitle')}
      caption={t('storesHub.contactCaption')}
      toast={toast.message}
      footer={<SaveBar dirty={dirty} saving={update.isPending} onSave={save} />}
    >
      <Panel Icon={Share2} title={t('storesHub.socialTitle')} caption={t('storesHub.socialCaption')}>
        <View style={styles.fields}>
          {SOCIAL_KEYS.map((key) => {
            const { Icon, color, label, placeholder, keyboard } = NETWORK_UI[key];
            const showError = invalid.includes(key) && draft[key].trim().length > 0;
            return (
              <TextField
                key={key}
                label={key === 'website' ? t('stores.websiteLabel') : label}
                Icon={Icon}
                iconColor={draft[key].trim() ? color : undefined}
                value={draft[key]}
                onChangeText={(v) => setField(key, v)}
                placeholder={placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={keyboard ?? 'default'}
                maxLength={200}
                error={showError ? t(key === 'whatsapp' ? 'storesHub.whatsappInvalid' : key === 'website' ? 'stores.invalidWebsite' : 'storesHub.handleInvalid') : null}
              />
            );
          })}
        </View>
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
  fields: { gap: 14 },
  stores: { gap: 8 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  storeMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
