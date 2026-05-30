import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
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
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, User, MessageCircle, CheckCircle, Copy, ShoppingBag } from 'lucide-react-native';

import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getErrorMessage } from '@/utils/error';
import { normalizePhone } from '@/utils/normalizePhone';
import { COUNTRIES } from '@/constants/Countries';
import CountryPickerModal from '@/components/CountryPickerModal';
import { MAX_AMOUNT_DIGITS } from '@/constants/app';

const MAX_PHONE_LEN = 15;

type QuickAddResult = {
  transaction: { id: string; points: number; amount: number };
  claim: { url: string; expiresAt: string };
  client: { id: string; telephone: string; isAnonymous: boolean };
};

export default function QuickAddScreen() {
  useRequireAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();
  const merchant = useAuthStore((s) => s.merchant);
  const params = useLocalSearchParams<{ telephone?: string; localPhone?: string; countryCode?: string; prenom?: string }>();

  // ── Form state ──
  const [countryIndex, setCountryIndex] = useState<number>(() => {
    // Priority: countryCode passed by scan-qr (preserves user choice) > merchant default
    const preferredCode = params.countryCode ?? merchant?.countryCode ?? 'MA';
    const idx = COUNTRIES.findIndex((c) => c.code === preferredCode);
    return idx >= 0 ? idx : 0;
  });
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  // Phone state: prefer the raw `localPhone` digits the merchant typed on the
  // scan page (lossless). Fall back to the legacy `telephone` param by stripping
  // a best-guess dial code only when no localPhone is available.
  const [phone, setPhone] = useState<string>(() => {
    if (params.localPhone) return params.localPhone.replace(/[^\d]/g, '').slice(0, MAX_PHONE_LEN);
    if (params.telephone) {
      const t = params.telephone.replace(/^\+/, '');
      const dial = (params.countryCode
        ? COUNTRIES.find((c) => c.code === params.countryCode)?.dial
        : merchant?.countryCode
          ? COUNTRIES.find((c) => c.code === merchant.countryCode)?.dial
          : null) ?? '';
      const dialDigits = dial.replace(/[^\d]/g, '');
      return (dialDigits && t.startsWith(dialDigits) ? t.slice(dialDigits.length) : t).slice(0, MAX_PHONE_LEN);
    }
    return '';
  });
  const [prenom, setPrenom] = useState<string>(params.prenom ?? '');
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickAddResult | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  // Re-entrancy guards to prevent double WhatsApp intents and stacked copy alerts.
  const sharingRef = useRef(false);
  const copyingRef = useRef(false);

  const isStampsMode = merchant?.loyaltyType === 'STAMPS';
  const isPerVisit = isStampsMode && (merchant?.stampEarningMode || 'PER_VISIT') === 'PER_VISIT';
  const pointsRate = merchant?.pointsRate || 10;

  // ── Computed points/stamps preview ──
  const computedPoints = useMemo(() => {
    if (isPerVisit) return 1;
    const n = parseFloat(amount.replace(',', '.')) || 0;
    if (n <= 0 || !Number.isFinite(pointsRate) || pointsRate <= 0) return 0;
    return Math.floor(n / pointsRate);
  }, [amount, isPerVisit, pointsRate]);

  // ── Input handlers ──
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

  // ── Submit ──
  const canSubmit = phone.length >= 6 && (isPerVisit || computedPoints > 0) && !loading;

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
    try {
      const idempotencyKey = Crypto.randomUUID();
      const res = await api.post(
        '/merchant/clients/quick-add',
        {
          telephone: normalizedPhone,
          countryCode: country.code,
          prenom: prenom.trim() || undefined,
          type: 'EARN_POINTS',
          amount: isPerVisit ? Math.max(amountNum, 0) : amountNum,
          points: computedPoints,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      const data: QuickAddResult = res.data;
      setResult(data);
      // Let the success Modal finish its fade-in before launching the WhatsApp
      // intent — otherwise the simultaneous animation + native intent freezes
      // the UI on some Android devices.
      setTimeout(() => { void shareViaWhatsApp(data); }, 350);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        Alert.alert(t('common.error'), t('quickAdd.alreadyRegistered'));
      } else {
        Alert.alert(t('common.error'), getErrorMessage(err, t('common.error')));
      }
    } finally {
      setLoading(false);
    }
  }, [canSubmit, countryIndex, phone, amount, prenom, computedPoints, isPerVisit, t]);

  // ── WhatsApp share ──
  const buildWaMessage = useCallback(
    (data: QuickAddResult): string => {
      const unit = isStampsMode ? t('common.stamps') : t('common.points');
      const namePart = prenom.trim() ? t('quickAdd.waMessageHello', { name: prenom.trim() }) : '';
      return t('quickAdd.waMessage', {
        name: namePart,
        points: data.transaction.points,
        unit,
        merchant: merchant?.nom ?? 'JitPlus',
        url: data.claim.url,
      });
    },
    [isStampsMode, prenom, t, merchant?.nom],
  );

  const shareViaWhatsApp = useCallback(
    async (data: QuickAddResult) => {
      if (sharingRef.current) return; // dedupe double-tap / auto+manual collision
      sharingRef.current = true;
      const message = buildWaMessage(data);
      // wa.me opens WhatsApp on both Android & iOS (Universal Link). The phone
      // number must be digits only, country code included.
      const waPhone = data.client.telephone.replace(/[^\d]/g, '');
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
      try {
        const can = await Linking.canOpenURL(waUrl);
        if (!can) {
          setShowFallback(true);
          return;
        }
        await Linking.openURL(waUrl);
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

  // ── Render ──
  const country = COUNTRIES[countryIndex];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={handleDone} style={styles.headerBtn} accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('quickAdd.title')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t('quickAdd.subtitle')}</Text>

          {/* Phone */}
          <Text style={[styles.label, { color: theme.text }]}>{t('quickAdd.phoneLabel')}</Text>
          <View style={[styles.phoneRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.countryBtn, { borderRightColor: theme.border }]}
              onPress={() => setShowCountryPicker(true)}
              accessibilityRole="button"
            >
              <Text style={[styles.countryFlag]}>{country.flag}</Text>
              <Text style={[styles.countryDial, { color: theme.text }]}>{country.dial}</Text>
            </TouchableOpacity>
            <Phone size={18} color={theme.textMuted} style={{ marginLeft: 8 }} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="612345678"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              maxLength={MAX_PHONE_LEN}
              editable={!loading && !result}
            />
          </View>

          {/* Prenom */}
          <Text style={[styles.label, { color: theme.text }]}>{t('quickAdd.nameLabel')}</Text>
          <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <User size={18} color={theme.textMuted} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={prenom}
              onChangeText={setPrenom}
              placeholder={t('quickAdd.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              maxLength={100}
              editable={!loading && !result}
              autoCapitalize="words"
            />
          </View>

          {/* Amount */}
          {!isPerVisit && (
            <>
              <Text style={[styles.label, { color: theme.text }]}>{t('quickAdd.amountLabel')}</Text>
              <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ShoppingBag size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: 20, fontWeight: '600' }]}
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

          {/* Preview */}
          {computedPoints > 0 && (
            <View style={[styles.previewBox, { backgroundColor: theme.primaryBg }]}>
              <Text style={[styles.previewText, { color: theme.primary }]}>
                {isStampsMode
                  ? t('quickAdd.stampsPreview', { count: computedPoints })
                  : t('quickAdd.pointsPreview', { count: computedPoints })}
              </Text>
            </View>
          )}

          {/* Submit */}
          {!result && (
            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: canSubmit ? theme.primary : theme.border },
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MessageCircle size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>{t('quickAdd.submit')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country picker */}
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

      {/* Success modal (with manual fallback if WhatsApp not installed) */}
      <Modal visible={!!result} transparent animationType="fade" onRequestClose={handleDone}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <CheckCircle size={48} color={theme.primary} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {t('quickAdd.successTitle')}
            </Text>
            <Text style={[styles.modalBody, { color: theme.textMuted }]}>
              {showFallback ? t('quickAdd.waNotInstalled') : t('quickAdd.successBody')}
            </Text>
            <View style={styles.modalActions}>
              {result && (
                <TouchableOpacity
                  style={[styles.modalBtnSecondary, { borderColor: theme.border }]}
                  onPress={handleCopyLink}
                >
                  {copyConfirm ? (
                    <>
                      <CheckCircle size={16} color={theme.primary} />
                      <Text style={[styles.modalBtnSecondaryText, { color: theme.primary }]}>
                        {t('quickAdd.linkCopied')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Copy size={16} color={theme.text} />
                      <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>
                        {t('quickAdd.copyLink')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {result && showFallback && (
                <TouchableOpacity
                  style={[styles.modalBtnPrimary, { backgroundColor: theme.primary }]}
                  onPress={() => shareViaWhatsApp(result)}
                >
                  <MessageCircle size={16} color="#fff" />
                  <Text style={styles.modalBtnPrimaryText}>WhatsApp</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtnPrimary, { backgroundColor: theme.primary }]}
                onPress={handleDone}
              >
                <Text style={styles.modalBtnPrimaryText}>{t('quickAdd.done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 32 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 0,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    gap: 6,
  },
  countryFlag: { fontSize: 18 },
  countryDial: { fontSize: 14, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 10,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
  previewBox: {
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  previewText: { fontSize: 16, fontWeight: '700' },
  submitBtn: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
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
  modalTitle: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  modalBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20, justifyContent: 'center' },
  modalBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '700' },
  modalBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  modalBtnSecondaryText: { fontWeight: '600' },
});
