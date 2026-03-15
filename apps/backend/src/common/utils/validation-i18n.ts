import { ValidationError } from 'class-validator';

/* ── French translation for class-validator default messages ─── */
export function translateValidationMessage(msg: string): string {
  const rules: [RegExp, string | ((...m: string[]) => string)][] = [
    [/^(.+) should not be empty$/, (_, p) => `Le champ ${p} est requis`],
    [/^(.+) must be a string$/, (_, p) => `Le champ ${p} doit être du texte`],
    [/^(.+) must be a number.*$/, (_, p) => `Le champ ${p} doit être un nombre`],
    [/^(.+) must be a positive number$/, (_, p) => `Le champ ${p} doit être un nombre positif`],
    [/^(.+) must be an integer number$/, (_, p) => `Le champ ${p} doit être un nombre entier`],
    [
      /^(.+) must be longer than or equal to (\d+) characters$/,
      (_, p, n) => `Le champ ${p} doit contenir au moins ${n} caractères`,
    ],
    [
      /^(.+) must be shorter than or equal to (\d+) characters$/,
      (_, p, n) => `Le champ ${p} ne doit pas dépasser ${n} caractères`,
    ],
    [/^(.+) must be an email$/, () => 'Adresse email invalide'],
    [/^(.+) must be a valid enum value$/, (_, p) => `Valeur invalide pour le champ ${p}`],
    [/^(.+) must be a boolean value$/, (_, p) => `Le champ ${p} doit être vrai ou faux`],
    [/^(.+) must be a UUID$/, (_, p) => `Le champ ${p} est invalide`],
    [
      /^(.+) must not be less than (\d+)$/,
      (_, p, n) => `Le champ ${p} doit être au minimum ${n}`,
    ],
    [
      /^(.+) must not be greater than (\d+)$/,
      (_, p, n) => `Le champ ${p} doit être au maximum ${n}`,
    ],
    [/^property (.+) should not exist$/, (_, p) => `Le champ ${p} n'est pas autorisé`],
  ];

  for (const [re, replacer] of rules) {
    const match = msg.match(re);
    if (match) {
      return typeof replacer === 'function' ? replacer(...match) : replacer;
    }
  }
  return msg; // already French or unknown — pass through
}

export function flattenValidationErrors(errors: ValidationError[]): string[] {
  const messages: string[] = [];
  for (const err of errors) {
    if (err.constraints) {
      messages.push(
        ...Object.values(err.constraints).map(translateValidationMessage),
      );
    }
    if (err.children?.length) {
      messages.push(...flattenValidationErrors(err.children));
    }
  }
  return messages;
}
