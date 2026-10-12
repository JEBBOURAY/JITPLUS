import type { Client } from '@/types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface ProfileCompletion {
  percent: number;
  missingLabels: string[];
}

export function getProfileCompletion(client: Client | null, t: Translate): ProfileCompletion {
  // A phone number in a valid format is enough — OTP verification is not
  // required to consider the profile complete.
  const checklist: [boolean, string][] = [
    [!!client?.email, 'home.profileFieldEmail'],
    [!!client?.emailVerified, 'home.profileFieldEmailVerified'],
    [!!client?.telephone, 'home.profileFieldPhone'],
    [!!client?.dateNaissance, 'home.profileFieldBirthDate'],
  ];
  const missingLabels = checklist.filter(([done]) => !done).map(([, key]) => t(key));
  const percent = Math.round(((checklist.length - missingLabels.length) / checklist.length) * 100);
  return { percent, missingLabels };
}

export function getInitials(client: Client | null): string {
  if (!client) return '?';
  const initials = `${client.prenom?.trim().charAt(0) ?? ''}${client.nom?.trim().charAt(0) ?? ''}`;
  return initials ? initials.toUpperCase() : '?';
}
