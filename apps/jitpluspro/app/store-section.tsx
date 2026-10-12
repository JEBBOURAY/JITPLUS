import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';
import { parseSection, type StoreSection } from '@/components/stores/brand';
import type { Merchant } from '@/types';
import IdentitySection from '@/components/stores/sections/IdentitySection';
import LocationsSection from '@/components/stores/sections/LocationsSection';
import ContactSection from '@/components/stores/sections/ContactSection';
import HoursSection from '@/components/stores/sections/HoursSection';
import ServicesSection from '@/components/stores/sections/ServicesSection';
import AppearanceSection from '@/components/stores/sections/AppearanceSection';

const SECTIONS: Record<StoreSection, React.ComponentType<{ merchant: Merchant }>> = {
  identity: IdentitySection,
  locations: LocationsSection,
  contact: ContactSection,
  hours: HoursSection,
  services: ServicesSection,
  appearance: AppearanceSection,
};

/** `/store-section?section=<StoreSection>` — one sub-page of the "Ma boutique" hub. */
export default function StoreSectionRoute() {
  const shouldWait = useRequireAuth();
  const { merchant, isTeamMember } = useAuth();
  const section = parseSection(useLocalSearchParams<{ section?: string }>().section);
  if (shouldWait || !merchant) return null;
  if (isTeamMember) return <OwnerOnlyNotice />;
  if (!section) return <Redirect href="/stores" />;
  const Section = SECTIONS[section];
  return <Section merchant={merchant} />;
}
