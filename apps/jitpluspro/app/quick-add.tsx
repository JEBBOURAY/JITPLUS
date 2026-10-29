import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
  Keyboard,
  ToastAndroid,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { randomUUID } from '@/utils/crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, User, MessageCircle, CheckCircle, Check, Copy, ShoppingBag } from 'lucide-react-native';

import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { getErrorMessage } from '@/utils/error';
import { logPerf } from '@jitplus/shared/src/devLogger';
import { normalizePhone } from '@/utils/normalizePhone';
import { COUNTRIES } from '@/constants/Countries';
import CountryPickerModal from '@/components/CountryPickerModal';
import { MAX_AMOUNT_DIGITS, MAX_STAMPS_PER_TX } from '@/constants/app';
import { computeStampsForAmount } from '@/utils/stamps';

const MAX_PHONE_LEN = 15;

type QuickAddResult = {
  transaction: { id: string; stamps: number; amount: number };
  claim: { url: string; expiresAt: string };
  client: { id: string; telephone: string; isAnonymous: boolean };
};

export default function QuickAddScreen() {
  useRequireAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const merchant = useAuthStore((s) => s.merchant);
  const params = useLocalSearchParams<{ localPhone?: string; countryCode?: string; prenom?: string }>();

  const [countryIndex, setCountryIndex] = useState<number>(() => {
    // Priority: countryCode passed by scan-qr (preserves user choice) > merchant default
    const preferredCode = params.countryCode ?? merchant?.countryCode ?? 'MA';
    const idx = COUNTRIES.findIndex((c) => c.code === preferredCode);
    return idx >= 0 ? idx : 0;
  });
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phone, setPhone] = useState<string>(() =>
    (params.localPhone ?? '').replace(/[^\d]/g, '').slice(0, MAX_PHONE_LEN),
  );
  const [prenom, setPrenom] = useState<string>(params.prenom ?? '');
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickAddResult | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  // Re-entrancy guards to prevent double WhatsApp intents and stacked copy alerts.
  const sharingRef = useRef(false);
  const copyingRef = useRef(false);
  // Pre-warmed `canOpenURL('https://wa.me/...')` result. On Android the OS only
  // checks the URL scheme/host, not the path, so the result is constant per
  // install. Caching it removes ~50-200ms from the share critical path.
  const canOpenWaRef = useRef<boolean | null>(null);
  // Holds the Quick-Add result whose WhatsApp share is pending the Modal fade-in.
  // Used by the Modal `onShow` callback to fire `shareViaWhatsApp` exactly when
  // the animation completes, replacing the previous arbitrary 350ms setTimeout.
  const pendingShareRef = useRef<QuickAddResult | null>(null);
  // Reused across retries of the same form so a retry after a lost response
  // cannot credit the client twice; dropped when the form changes or succeeds.
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [phone, amount, prenom, countryIndex]);

  useEffect(() => {
    // Pre-warm canOpenURL so the share critical path doesn't pay its cost.
    Linking.canOpenURL('https://wa.me/00000000')
      .then((can) => { canOpenWaRef.current = can; })
      .catch(() => { canOpenWaRef.current = false; });
  }, []);

  const isPerVisit = (merchant?.stampEarningMode || 'PER_VISIT') === 'PER_VISIT';
  const amountPerStamp = merchant?.amountPerStamp;

  const { stamps: computedStamps, capped: stampsCapped } = useMemo(() => {
    if (isPerVisit) return { stamps: 1, capped: false };
    return computeStampsForAmount(parseFloat(amount.replace(',', '.')) || 0, amountPerStamp);
  }, [amount, isPerVisit, amountPerStamp]);

  const handleAmountChange = useCallback((text: string) => {
    if (text.trim().startsWith('-')) return;
    const cleaned = text.replace(/[^0-9.,]/g, '').replace(',', '.');
    const parts = cleaned.split('.');
    let formatted = parts[0] || '';
    if (parts.length > 1) formatted += '.' + (parts[1]?.slice(0, 2) || '');
    if (formatted.length <= MAX_AMOUNT_DIGITS) setAmount(formatted);
  }, []);

  const handlePhoneChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^\d]/g, '').slice(0, MAX_PHONE_LEN);
    setPhone(cleaned);
  }, []);

  const canSubmit = phone.length >= 6 && (isPerVisit || computedStamps > 0) && !loading;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    // Dismiss keyboard first — keeping it open while a Modal animates in and a
    // Linking.openURL fires causes jank/freeze on low-end Android.
    Keyboard.dismiss();
    const country = COUNTRIES[countryIndex];
    const normalizedPhone = normalizePhone(phone, country.dial);
    if (!normalizedPhone || normalizedPhone.length > MAX_PHONE_LEN + 4) {
      Alert.alert(t('common.error'), t('quickAdd.phoneInvalid'));
      return;
    }
    const amountNum = parseFloat(amount.replace(',', '.')) || 0;
    if (!isPerVisit && amountNum <= 0) {
      Alert.alert(t('common.error'), t('quickAdd.amountInvalid'));
      return;
    }

    setLoading(true);
    const tSubmit = Date.now();
    logPerf('QuickAdd', 'submit:start');
    try {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = randomUUID();
      const idempotencyKey = idempotencyKeyRef.current;
      const tApi = Date.now();
      const res = await api.post(
        '/merchant/clients/quick-add',
        {
          telephone: normalizedPhone,
          countryCode: country.code,
          prenom: prenom.trim() || undefined,
          type: 'EARN_STAMPS',
          amount: isPerVisit ? Math.max(amountNum, 0) : amountNum,
          stamps: computedStamps,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      logPerf('QuickAdd', `submit:api-done ${Date.now() - tApi}ms`);
      const data: QuickAddResult = res.data;
      idempotencyKeyRef.current = null;
      // Defer share until Modal `onShow` fires (end of fade-in animation).
      // This replaces a 350ms setTimeout that used to add fixed latency.
      pendingShareRef.current = data;
      setResult(data);
      logPerf('QuickAdd', `submit:modal-set ${Date.now() - tSubmit}ms`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status;
      if (status === 409) {
        Alert.alert(t('common.error'), t('quickAdd.alreadyRegistered'));
      } else {
        Alert.alert(t('common.error'), getErrorMessage(err, t('common.error')));
      }
    } finally {
      setLoading(false);
    }
  }, [canSubmit, countryIndex, phone, amount, prenom, computedStamps, isPerVisit, t]);

  const buildWaMessage = useCallback(
    (data: QuickAddResult): string => {
      const namePart = prenom.trim() ? t('quickAdd.waMessageHello', { name: prenom.trim() }) : '';
      return t('quickAdd.waMessage', {
        name: namePart,
        stamps: data.transaction.stamps,
        unit: t('common.stamps'),
        merchant: merchant?.nom ?? 'JitPlus',
        url: data.claim.url,
      });
    },
    [prenom, t, merchant?.nom],
  );

  const shareViaWhatsApp = useCallback(
    async (data: QuickAddResult) => {
      if (sharingRef.current) return; // dedupe double-tap / auto+manual collision
      sharingRef.current = true;
      const tShare = Date.now();
      logPerf('QuickAdd', 'share:start');
      const message = buildWaMessage(data);
      // wa.me opens WhatsApp on both Android & iOS (Universal Link). The phone
      // number must be digits only, country code included.
      const waPhone = data.client.telephone.replace(/[^\d]/g, '');
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
      try {
        let can = canOpenWaRef.current;
        if (can === null) {
          const tCan = Date.now();
          can = await Linking.canOpenURL(waUrl);
          canOpenWaRef.current = can;
          logPerf('QuickAdd', `share:canOpenURL ${Date.now() - tCan}ms can=${can}`);
        } else {
          logPerf('QuickAdd', `share:canOpenURL cached=${can}`);
        }
        if (!can) {
          setShowFallback(true);
          return;
        }
        const tOpen = Date.now();
        await Linking.openURL(waUrl);
        logPerf('QuickAdd', `share:openURL ${Date.now() - tOpen}ms total=${Date.now() - tShare}ms`);
      } catch {
        setShowFallback(true);
      } finally {
        // Release after a beat so a rapid second tap is still deduped.
        setTimeout(() => { sharingRef.current = false; }, 1200);
      }
    },
    [buildWaMessage],
  );

  const handleCopyLink = useCallback(async () => {
    if (!result || copyingRef.current) return;
    copyingRef.current = true;
    try {
      await Clipboard.setStringAsync(result.claim.url);
      if (Platform.OS === 'android') {
        ToastAndroid.show(t('quickAdd.linkCopied'), ToastAndroid.SHORT);
      } else {
        // Inline transient confirmation instead of stacking Alert dialogs.
        setCopyConfirm(true);
        setTimeout(() => setCopyConfirm(false), 1500);
      }
    } finally {
      setTimeout(() => { copyingRef.current = false; }, 400);
    }
  }, [result, t]);

  const handleDone = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const country = COUNTRIES[countryIndex];
  const labelStyle = [styles.label, { color: theme.text, textAlign: dir.textAlign }];
  const inputStyle = [styles.input, { color: theme.text, textAlign: dir.textAlign }];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.header, { flexDirection: dir.row, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={handleDone}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={24} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('quickAdd.title')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.subtitle, { color: theme.textMuted, textAlign: dir.textAlign }]}>{t('quickAdd.subtitle')}</Text>

          <Text style={labelStyle}>{t('quickAdd.phoneLabel')}</Text>
          <View style={[styles.phoneRow, { flexDirection: dir.row, backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.countryBtn,
                { flexDirection: dir.row, borderColor: theme.border },
                dir.isRTL ? styles.countryBtnRtl : styles.countryBtnLtr,
              ]}
              onPress={() => setShowCountryPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={t('common.selectCountry')}
            >
              <Text style={styles.countryFlag}>{country.flag}</Text>
              <Text style={[styles.countryDial, { color: theme.text }]}>{country.dial}</Text>
            </TouchableOpacity>
            <Phone size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={dir.isRTL ? styles.phoneIconRtl : styles.phoneIconLtr} />
            <TextInput
              style={inputStyle}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="612345678"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              maxLength={MAX_PHONE_LEN}
              editable={!loading && !result}
            />
          </View>

          <Text style={labelStyle}>{t('quickAdd.nameLabel')}</Text>
          <View style={[styles.row, { flexDirection: dir.row, backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <User size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
            <TextInput
              style={inputStyle}
              value={prenom}
              onChangeText={setPrenom}
              placeholder={t('quickAdd.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              maxLength={100}
              editable={!loading && !result}
              autoCapitalize="words"
            />
          </View>

          {!isPerVisit && (
            <>
              <Text style={labelStyle}>{t('quickAdd.amountLabel')}</Text>
              <View style={[styles.row, { flexDirection: dir.row, backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                <ShoppingBag size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
                <TextInput
                  style={[inputStyle, styles.amountInput]}
                  value={amount}
                  onChangeText={handleAmountChange}
                  placeholder={t('quickAdd.amountPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  editable={!loading && !result}
                />
              </View>
            </>
          )}

          {computedStamps > 0 && (
            <View style={[styles.previewBox, { backgroundColor: theme.primaryBg }]}>
              <Text style={[styles.previewText, { color: theme.primary }]}>
                {t(computedStamps === 1 ? 'quickAdd.stampsPreview_one' : 'quickAdd.stampsPreview_other', { count: computedStamps })}
              </Text>
              {stampsCapped && (
                <Text style={[styles.previewCapText, { color: theme.primary }]}>
                  {t('transaction.maxStampsPerTxHint', { max: MAX_STAMPS_PER_TX })}
                </Text>
              )}
            </View>
          )}

          {!result && (
            <ActionButton
              label={t('quickAdd.submit')}
              icon={MessageCircle}
              size="lg"
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={loading}
              style={[styles.submitBtn, !canSubmit && { backgroundColor: theme.border, borderColor: theme.border }]}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <CountryPickerModal
        visible={showCountryPicker}
        selectedCode={country.code}
        onSelect={(idx) => {
          setCountryIndex(idx);
          setShowCountryPicker(false);
        }}
        onClose={() => setShowCountryPicker(false)}
        topInset={insets.top}
      />

      <Modal
        visible={!!result}
        transparent
        animationType="fade"
        onRequestClose={handleDone}
        onShow={() => {
          const pending = pendingShareRef.current;
          if (pending) {
            pendingShareRef.current = null;
            void shareViaWhatsApp(pending);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
            <CheckCircle size={48} color={theme.primary} strokeWidth={icon.stroke} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {t('quickAdd.successTitle')}
            </Text>
            <Text style={[styles.modalBody, { color: theme.textMuted }]}>
              {showFallback ? t('quickAdd.waNotInstalled') : t('quickAdd.successBody')}
            </Text>
            <View style={[styles.modalActions, { flexDirection: dir.row }]}>
              {result && (
                <ActionButton
                  variant="secondary"
                  label={copyConfirm ? t('quickAdd.linkCopied') : t('quickAdd.copyLink')}
                  icon={copyConfirm ? Check : Copy}
                  iconColor={copyConfirm ? theme.primary : undefined}
                  labelStyle={copyConfirm ? { color: theme.primary } : undefined}
                  onPress={handleCopyLink}
                />
              )}
              {result && showFallback && (
                <ActionButton
                  label="WhatsApp"
                  icon={MessageCircle}
                  onPress={() => shareViaWhatsApp(result)}
                />
              )}
              <ActionButton label={t('quickAdd.done')} onPress={handleDone} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: font.semibold },
  scroll: { padding: 16, paddingBottom: 32 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20, fontFamily: font.regular },
  label: { fontSize: 13, fontFamily: font.semibold, marginTop: 16, marginBottom: 8 },
  phoneRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 0,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  countryBtn: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  countryBtnLtr: { borderRightWidth: StyleSheet.hairlineWidth },
  countryBtnRtl: { borderLeftWidth: StyleSheet.hairlineWidth },
  phoneIconLtr: { marginLeft: 8 },
  phoneIconRtl: { marginRight: 8 },
  countryFlag: { fontSize: 18 },
  countryDial: { fontSize: 14, fontFamily: font.semibold },
  row: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 10,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12, fontFamily: font.regular },
  amountInput: { fontSize: 20, fontFamily: font.semibold },
  previewBox: {
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  previewText: { fontSize: 16, fontFamily: font.bold },
  previewCapText: { fontSize: 12, marginTop: 4, textAlign: 'center', fontFamily: font.regular },
  submitBtn: { marginTop: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 20, fontFamily: font.bold, marginTop: 12, textAlign: 'center' },
  modalBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, fontFamily: font.regular },
  modalActions: { flexWrap: 'wrap', gap: 10, marginTop: 20, justifyContent: 'center' },
});
