import { wordInitials } from '@/utils/initials';

/** Up to two uppercase initials from the merchant name, or "?" when unnamed. */
export function merchantInitials(nom: string | null | undefined): string {
  return wordInitials(nom);
}
