import { forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { pluralKey } from '@jitplus/shared';
import { CoBrand, PText, readableBrand } from '@/components/plv/PlvPoster';
import type { useLanguage } from '@/contexts/LanguageContext';
import { font } from '@/constants/design';

interface StampCodeLabelProps {
  url: string;
  /** Position of the code in its batch, printed small to tell labels apart */
  n: number;
  stamps: number;
  merchantName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  t: ReturnType<typeof useLanguage>['t'];
  locale: string;
  isRTL: boolean;
}

/**
 * Printable label slipped into a parcel: JitPlus × merchant logos, the QR
 * code, its value and how the customer uses it. Plain white with fixed text
 * sizes (no OS font scaling) so the exported image prints cleanly.
 */
const StampCodeLabel = forwardRef<View, StampCodeLabelProps>(function StampCodeLabel(
  { url, n, stamps, merchantName, logoUrl, brandColor, t, locale, isRTL },
  ref,
) {
  const brand = readableBrand(brandColor);
  const textAlign = isRTL ? 'right' : 'left';
  const steps = [t('stampCodes.qr.step1'), t('stampCodes.qr.step2'), t('stampCodes.qr.step3')];

  return (
    <View ref={ref} collapsable={false} style={styles.label}>
      <CoBrand logoUrl={logoUrl} size={40} />
      {merchantName ? <PText style={styles.merchant} numberOfLines={1}>{merchantName}</PText> : null}

      <PText style={[styles.headline, { color: brand }]}>{t('stampCodes.qr.scanLine')}</PText>
      <View style={[styles.qrFrame, { borderColor: brand }]}>
        <QRCode value={url} size={180} backgroundColor="#FFFFFF" color="#0F172A" ecl="M" />
      </View>
      <PText style={styles.value}>
        {t(pluralKey('stampCodes.detail.value', stamps, locale), { count: stamps })}
      </PText>

      <View style={styles.how}>
        <PText style={[styles.howTitle, { textAlign }]}>{t('stampCodes.qr.howTitle')}</PText>
        {steps.map((step, i) => (
          <View key={i} style={[styles.step, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.stepNum, { backgroundColor: brand }]}>
              <PText style={styles.stepNumText}>{i + 1}</PText>
            </View>
            <PText style={[styles.stepText, { textAlign }]}>{step}</PText>
          </View>
        ))}
        <PText style={[styles.appHint, { textAlign }]}>{t('stampCodes.qr.appHint')}</PText>
      </View>

      <PText style={styles.footer}>
        {t('stampCodes.detail.codeNumber', { n })} · {t('stampCodes.qr.oneUse')} · JitPlus
      </PText>
    </View>
  );
});

export default StampCodeLabel;

const styles = StyleSheet.create({
  label: {
    width: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  merchant: { fontSize: 17, fontFamily: font.semibold, color: '#0F172A', maxWidth: 260, textAlign: 'center' },
  headline: { fontSize: 15, fontFamily: font.semibold, textAlign: 'center', marginTop: 4 },
  qrFrame: { padding: 8, borderRadius: 14, borderWidth: 2 },
  value: { fontSize: 13, fontFamily: font.semibold, color: '#475569', textAlign: 'center' },
  how: { alignSelf: 'stretch', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, gap: 6, marginTop: 4 },
  howTitle: { fontSize: 12, fontFamily: font.semibold, color: '#0F172A' },
  step: { alignItems: 'flex-start', gap: 8 },
  stepNum: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 10, fontFamily: font.semibold, color: '#FFFFFF' },
  stepText: { flex: 1, fontSize: 11, lineHeight: 15, fontFamily: font.regular, color: '#334155' },
  appHint: { fontSize: 10, lineHeight: 14, fontFamily: font.regular, color: '#64748B', marginTop: 2 },
  footer: { fontSize: 9, fontFamily: font.regular, color: '#94A3B8', marginTop: 2 },
});
