import { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import { resolveImageUrl } from '@/utils/imageUrl';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import MerchantLogo from '@/components/MerchantLogo';
import {
  SCRATCH_CARD_DESIGNS,
  SCRATCH_LIMITS,
  describeCouponConditions,
  rewardDisplay,
  type ScratchRewardInput,
} from '@jitplus/shared/src/scratch';
import { Chip, ChipRow, FieldLabel, Input, Notice, Section } from './ScratchUI';
import { ScratchPreview } from './ScratchPreview';
import { formatYmd } from './DateField';
import { moroccoWallTimeToIso, moroccoYmdOf, type CampaignForm } from './campaignForm';
import { HelpText } from '@/components/games/GameWizard';

export type PreviewSide = 'before' | 'after';

/** Which side of the card the preview shows, and which reward is revealed. */
export interface ScratchPreviewChoice {
  side: PreviewSide;
  rewardKey: string | null;
}

/**
 * "Look" step of the scratch wizard: card design, preview of both sides with the
 * coupon conditions, the campaign name and message, and the push the clients get.
 */
export function ScratchLookStep({ form, rewardInputs, set, preview, onPreviewChange }: {
  form: CampaignForm;
  /** `form.rewards` as sent to the API, same order */
  rewardInputs: ScratchRewardInput[];
  set: (patch: Partial<CampaignForm>) => void;
  preview: ScratchPreviewChoice;
  onPreviewChange: (preview: ScratchPreviewChoice) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { money } = useMoney();
  const { row, textAlign } = useDir();
  const { width } = useWindowDimensions();
  const merchant = useAuthStore((s) => s.merchant);
  const merchantName = merchant?.nom ?? '';
  const logoUrl = merchant?.logoUrl ? resolveImageUrl(merchant.logoUrl) : null;
  const message = form.message.trim();
  const campaignName = form.name.trim();

  const previewIndex = Math.max(0, form.rewards.findIndex((r) => r.key === preview.rewardKey));
  const previewInput = rewardInputs[previewIndex];
  const previewDisplay = useMemo(() => (previewInput ? rewardDisplay(previewInput, t, money) : null), [previewInput, t, money]);
  const previewConditions = useMemo(() => {
    if (!previewInput) return [];
    const lines = describeCouponConditions(
      {
        conditions: {
          minPurchaseAmount: previewInput.minPurchaseAmount,
          allowedWeekdays: previewInput.allowedWeekdays,
          allowedFromMin: previewInput.allowedFromMin,
          allowedToMin: previewInput.allowedToMin,
        },
        expiresAt: moroccoWallTimeToIso(form.couponExpiresOn, '23:59'),
      },
      t,
      (iso) => formatYmd(moroccoYmdOf(new Date(iso)), locale, false),
      money,
    );
    if (previewInput.minDelayHours === 24 || previewInput.minDelayHours === 48) {
      lines.unshift(t(`scratch.wizard.previewDelay${previewInput.minDelayHours}`));
    }
    return lines;
  }, [previewInput, form.couponExpiresOn, t, locale, money]);

  return (
    <>
      <Section title={t('scratch.wizard.previewCard')}>
        <View style={[styles.designRow, { flexDirection: row }]}>
          {SCRATCH_CARD_DESIGNS.map((d) => {
            const selected = d.id === form.designId;
            return (
              <TouchableOpacity
                key={d.id}
                onPress={() => set({ designId: d.id })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t(d.nameKey)}
                style={[styles.designSwatch, { borderColor: selected ? theme.primary : 'transparent' }]}
              >
                <LinearGradient colors={[d.gradient[0], d.gradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.designInner}>
                  <View style={[styles.designDot, { backgroundColor: d.gradient[1] }]} />
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
        <ChipRow>
          <Chip
            label={t('scratch.wizard.previewBefore')}
            selected={preview.side === 'before'}
            onPress={() => onPreviewChange({ ...preview, side: 'before' })}
          />
          <Chip
            label={t('scratch.wizard.previewAfter')}
            selected={preview.side === 'after'}
            onPress={() => onPreviewChange({ ...preview, side: 'after' })}
          />
        </ChipRow>
        {preview.side === 'after' && form.rewards.length > 1 && (
          <ChipRow>
            {rewardInputs.map((input, i) => (
              <Chip
                key={form.rewards[i].key}
                label={rewardDisplay(input, t, money).headline || t('scratch.wizard.rewardN', { n: i + 1 })}
                selected={previewIndex === i}
                onPress={() => onPreviewChange({ ...preview, rewardKey: form.rewards[i].key })}
              />
            ))}
          </ChipRow>
        )}

        <ScratchPreview
          designId={form.designId}
          width={Math.min(width - 96, 360)}
          merchantName={merchantName}
          logoUrl={logoUrl}
          side={preview.side}
          rewardText={previewDisplay?.headline}
          rewardDetail={previewDisplay?.detail}
          footer={campaignName || t('scratch.card.offeredBy', { merchant: merchantName })}
          message={message}
          expiresLabel={t('scratch.card.expiresOn', { date: formatYmd(form.cardExpiresOn, locale, false) })}
        />
        {preview.side === 'after' && (
          <View style={[styles.conditionsBox, { backgroundColor: theme.bgInput, borderColor: theme.borderLight }]}>
            <Text style={[styles.conditionsTitle, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
              {t('scratch.wizard.previewConditions')}
            </Text>
            {previewConditions.map((line, i) => (
              <Text key={i} style={[styles.conditionLine, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
                • {line}
              </Text>
            ))}
          </View>
        )}
        {!merchant?.logoUrl && <Notice tone="warning" text={t('scratch.wizard.previewNoLogo')} />}
      </Section>

      <Section title={t('scratch.wizard.nameTitle')}>
        <FieldLabel text={t('scratch.wizard.name')} hint={t('scratch.wizard.nameHint')} />
        <Input
          value={form.name}
          onChangeText={(name) => set({ name })}
          placeholder={t('scratch.wizard.namePlaceholder')}
          maxLength={SCRATCH_LIMITS.NAME_MAX}
          accessibilityLabel={t('scratch.wizard.name')}
        />
        <FieldLabel text={t('scratch.wizard.message')} hint={t('scratch.wizard.messageHint')} />
        <Input
          value={form.message}
          onChangeText={(msg) => set({ message: msg })}
          placeholder={t('scratch.wizard.messagePlaceholder')}
          maxLength={SCRATCH_LIMITS.MESSAGE_MAX}
          multiline
          accessibilityLabel={t('scratch.wizard.message')}
        />
      </Section>

      <Section title={t('scratch.wizard.previewPush')}>
        <View style={[styles.push, { backgroundColor: theme.bgElevated, borderColor: theme.borderLight, flexDirection: row }]}>
          <MerchantLogo logoUrl={merchant?.logoUrl} style={styles.pushLogo} />
          <View style={styles.flex}>
            <Text style={[styles.pushApp, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.2}>
              {t('scratch.wizard.previewPushApp')}
            </Text>
            <Text style={[styles.pushTitle, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {t('scratch.wizard.pushTitle', { merchant: merchantName })}
            </Text>
            <Text style={[styles.pushBody, { color: theme.textSecondary, textAlign }]} numberOfLines={3} maxFontSizeMultiplier={1.3}>
              {message ? t('scratch.wizard.pushBody', { message }) : t('scratch.wizard.pushBodyDefault')}
            </Text>
          </View>
        </View>
        <HelpText text={t('scratch.wizard.previewPushHint')} />
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  designRow: { flexWrap: 'wrap', gap: 10 },
  designSwatch: { width: 56, borderWidth: 2, borderRadius: 12, padding: 3 },
  designInner: { width: '100%', height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  designDot: { width: 16, height: 16, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  push: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, alignItems: 'flex-start' },
  pushLogo: { width: 38, height: 38, borderRadius: 8 },
  pushApp: { fontSize: ms(11), fontFamily: font.medium, marginBottom: 2 },
  pushTitle: { fontSize: ms(14), fontFamily: font.semibold, lineHeight: ms(19) },
  pushBody: { fontSize: ms(13), fontFamily: font.regular, lineHeight: ms(18), marginTop: 2 },
  conditionsBox: { alignSelf: 'stretch', borderRadius: 12, borderWidth: 1, padding: 12, gap: 3 },
  conditionsTitle: { fontSize: ms(12), fontFamily: font.semibold, marginBottom: 2 },
  conditionLine: { fontSize: ms(13), fontFamily: font.regular, lineHeight: ms(18) },
});
