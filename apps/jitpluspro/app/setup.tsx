import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import SetupWizard from '@/components/setup/SetupWizard';
import { parseSetupStep } from '@/components/setup/setupSteps';

/**
 * `/setup` or `/setup?step=<SetupStepId>` — page-by-page configuration of the
 * business, opened after sign-up and from the Accueil checklist. Owner only:
 * team members cannot edit the brand or the loyalty rules.
 */
export default function SetupRoute() {
  const shouldWait = useRequireAuth();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { step } = useLocalSearchParams<{ step?: string }>();
  if (shouldWait || !merchant) return null;
  if (isTeamMember) return <Redirect href="/(tabs)" />;
  return <SetupWizard merchant={merchant} initialStep={parseSetupStep(step)} />;
}
