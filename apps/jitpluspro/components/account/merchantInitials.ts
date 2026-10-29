/** Up to two uppercase initials from the merchant name, or "?" when unnamed. */
export function merchantInitials(nom: string | null | undefined): string {
  return nom
    ? nom.split(' ').map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase()
    : '?';
}
