// Public surface of the profile feature — only what app/ screens consume.
// Internal building blocks (SettingsRow, ToggleSwitch, modals…) are imported
// directly by sibling components, not re-exported here.
export { default as ProfileHeader } from './ProfileHeader';
export { default as ProfileCompletionCard } from './ProfileCompletionCard';
export { default as ReferralBanner } from './ReferralBanner';
export { default as PreferencesSection } from './PreferencesSection';
export { default as SecuritySection } from './SecuritySection';
export { default as SupportSection } from './SupportSection';
export { default as AccountActions } from './AccountActions';
export { default as OtpVerificationModal } from './OtpVerificationModal';
export { default as ProfileTextField, FieldLabel } from './ProfileTextField';
export { default as VerificationBadge } from './VerificationBadge';
