import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import { useCreateStampCodeBatch, useStampCodeQuota } from '@/hooks/queries/stampCodes';
import { MAX_STAMP_CODES_PER_BATCH, MAX_STAMPS_PER_TX } from '@/constants/app';
import { computeStampsForAmount, DEFAULT_AMOUNT_PER_STAMP } from '@/utils/stamps';
import { getErrorDetails, getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { Button, Chip, ChipRow, FieldLabel, Input, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';

type ValueMode = 'stamps' | 'amount';

const toInt = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN);
const toAmount = (value: string) => {
  const n = Number(value.trim().replace(',', '.'));
  return value.trim() && Number.isFinite(n) ? n : NaN;
};

export default function CreateStampCodeBatchScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { symbol, money } = useMoney();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const quota = useStampCodeQuota(!shouldWait);
  const createMutation = useCreateStampCodeBatch();

  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [mode, setMode] = useState<ValueMode>(merchant?.stampEarningMode === 'PER_AMOUNT' ? 'amount' : 'stamps');
  const [stamps, setStamps] = useState('1');
  const [amount, setAmount] = useState('');

  const amountPerStamp = merchant?.amountPerStamp || DEFAULT_AMOUNT_PER_STAMP;
  const rule = money(amountPerStamp);
  const amountValue = toAmount(amount);
  const stampsFromAmount = useMemo(
    () => (Number.isFinite(amountValue) ? computeStampsForAmount(amountValue, amountPerStamp).stamps : 0),
    [amountValue, amountPerStamp],
  );
  const stampsPerCode = mode === 'stamps' ? toInt(stamps) : stampsFromAmount;
  const remaining = quota.data?.remaining ?? null;

  const validate = useCallback((): string | null => {
    if (!label.trim()) return t('stampCodes.create.invalidLabel');
    const qty = toInt(quantity);
    if (!(qty >= 1 && qty <= MAX_STAMP_CODES_PER_BATCH)) {
      return t('stampCodes.create.invalidQuantity', { max: MAX_STAMP_CODES_PER_BATCH });
    }
    if (mode === 'stamps') {
      const n = toInt(stamps);
      if (!(n >= 1 && n <= MAX_STAMPS_PER_TX)) return t('stampCodes.create.invalidStamps', { max: MAX_STAMPS_PER_TX });
    } else {
      if (!(amountValue > 0)) return t('stampCodes.create.invalidAmount');
      if (stampsFromAmount === 0) return t('stampCodes.create.previewTooLow', { rule });
    }
    return null;
  }, [label, quantity, mode, stamps, amountValue, stampsFromAmount, rule, t]);

  const showQuotaAlert = useCallback((left: number) => {
    Alert.alert(
      t('stampCodes.create.quotaTitle'),
      left > 0
        ? t('stampCodes.create.remaining', { count: left })
        : t('stampCodes.list.quotaReached', { limit: quota.data?.limit ?? 0 }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('stampCodes.list.upgrade'), onPress: () => router.push('/plan') },
      ],
    );
  }, [quota.data?.limit, router, t]);

  const submit = useCallback(async () => {
    if (createMutation.isPending) return;
    const error = validate();
    if (error) {
      Alert.alert(t('common.error'), error);
      return;
    }
    const qty = toInt(quantity);
    if (remaining != null && qty > remaining) {
      showQuotaAlert(remaining);
      return;
    }
    try {
      const batch = await createMutation.mutateAsync({
        label: label.trim(),
        quantity: qty,
        ...(mode === 'stamps' ? { stamps: toInt(stamps) } : { amount: amountValue }),
      });
      router.replace({ pathname: '/stamp-codes/[id]', params: { id: batch.batchId } });
    } catch (e) {
      const { code, meta } = getErrorDetails(e);
      if (code === 'STAMP_CODE_QUOTA') {
        showQuotaAlert(typeof meta?.remaining === 'number' ? meta.remaining : 0);
        return;
      }
      Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
    }
  }, [createMutation, validate, quantity, remaining, showQuotaAlert, label, mode, stamps, amountValue, router, t]);

  if (shouldWait) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('stampCodes.create.title')} onBack={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {isTeamMember && <Notice text={t('stampCodes.list.ownerOnly')} />}

          <Section>
            <FieldLabel text={t('stampCodes.create.label')} hint={t('stampCodes.create.labelHint')} />
            <Input value={label} onChangeText={setLabel} maxLength={80} returnKeyType="next" />

            <FieldLabel
              text={t('stampCodes.create.quantity')}
              hint={t('stampCodes.create.quantityHint', { max: MAX_STAMP_CODES_PER_BATCH })}
            />
            <Input value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={3} />
            {remaining != null && (
              <Text style={[styles.note, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t('stampCodes.create.remaining', { count: remaining })}
              </Text>
            )}
          </Section>

          <Section title={t('stampCodes.create.valueMode')}>
            <ChipRow>
              <Chip label={t('stampCodes.create.modeStamps')} selected={mode === 'stamps'} onPress={() => setMode('stamps')} />
              <Chip label={t('stampCodes.create.modeAmount')} selected={mode === 'amount'} onPress={() => setMode('amount')} />
            </ChipRow>

            {mode === 'stamps' ? (
              <>
                <FieldLabel text={t('stampCodes.create.stamps')} hint={t('stampCodes.create.stampsHint', { max: MAX_STAMPS_PER_TX })} />
                <Input value={stamps} onChangeText={setStamps} keyboardType="number-pad" maxLength={2} />
              </>
            ) : (
              <>
                <FieldLabel text={t('stampCodes.create.amount', { symbol })} hint={t('stampCodes.create.amountHint', { rule })} />
                <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={10} />
              </>
            )}

            {stampsPerCode > 0 ? (
              <Text style={[styles.preview, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t(pluralKey('stampCodes.create.preview', stampsPerCode, locale), { count: stampsPerCode })}
              </Text>
            ) : mode === 'amount' && amountValue > 0 ? (
              <Text style={[styles.preview, { color: theme.warning, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t('stampCodes.create.previewTooLow', { rule })}
              </Text>
            ) : null}
          </Section>

          <Button
            label={t('stampCodes.create.submit')}
            onPress={submit}
            loading={createMutation.isPending}
            disabled={isTeamMember}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  note: { fontSize: ms(12), fontFamily: font.regular },
  preview: { fontSize: ms(14), fontFamily: font.semibold, marginTop: 4 },
});
