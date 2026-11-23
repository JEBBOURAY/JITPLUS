/** Mail domains most used by JitPlus clients; a near miss is usually a typo. */
const COMMON_DOMAINS = [
  'gmail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'yahoo.com', 'yahoo.fr',
  'icloud.com', 'live.com', 'live.fr', 'menara.ma',
];

/** Edit distance, capped: anything above `max` is reported as max + 1. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * "ali@gmial.com" → "ali@gmail.com". Returns null when the domain is already a
 * known one or nothing is close enough (at most 2 typed characters off).
 */
export function suggestEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return null;
  const domain = trimmed.slice(at + 1);
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;

  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of COMMON_DOMAINS) {
    const d = distance(domain, candidate, 2);
    if (d < bestDistance) { best = candidate; bestDistance = d; }
  }
  return best ? `${trimmed.slice(0, at)}@${best}` : null;
}
