import { LegalNotice, LegalScreen, LegalSection } from '@/components/legal/LegalScreen';
import { useLanguage } from '@/contexts/LanguageContext';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function TermsScreen() {
  const { t } = useLanguage();

  return (
    <LegalScreen title={t('legal.termsHeader')} directional>
      <LegalNotice>{t('legal.lastUpdate')}</LegalNotice>

      <LegalSection
        title={t('legal.cguTitle')}
        body={t('legal.cguBody')}
        bullets={[t('legal.cguFree'), t('legal.cguNoValue'), t('legal.cguModify'), t('legal.cguLaw')]}
      />
      <LegalSection title={t('legal.cguAcceptanceTitle')} body={t('legal.cguAcceptanceBody')} />
      <LegalSection title={t('legal.cguEligibilityTitle')} body={t('legal.cguEligibilityBody')} />
      <LegalSection
        title={t('legal.cguRulesTitle')}
        bullets={[t('legal.cguRule1'), t('legal.cguRule2'), t('legal.cguRule3'), t('legal.cguRule4')]}
      />
      <LegalSection title={t('legal.cguSuspendTitle')} body={t('legal.cguSuspendBody')} />
      <LegalSection title={t('legal.cguLiabilityTitle')} body={t('legal.cguLiabilityBody')} />
      <LegalSection
        title={t('legal.wheelRulesTitle')}
        body={t('legal.wheelRulesIntro')}
        bullets={[
          t('legal.wheelRulesEarn'), t('legal.wheelRulesOdds'), t('legal.wheelRulesClaim'),
          t('legal.wheelRulesPrizes'), t('legal.wheelRulesFraud'), t('legal.wheelRulesDisclaimer'),
        ]}
      />
      <LegalSection title={t('legal.cguJurisdictionTitle')} body={t('legal.cguJurisdictionBody')} last />
    </LegalScreen>
  );
}
