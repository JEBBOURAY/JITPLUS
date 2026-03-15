/** Auto-format a raw digit string into DD/MM/YYYY */
export const formatDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/** Convert DD/MM/YYYY to ISO date string, returns undefined if invalid */
export const toIsoDate = (dmy: string): string | undefined => {
  const parts = dmy.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return undefined;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y || m > 12 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(date.getTime())) return undefined;
  if (date.getUTCDate() !== d || date.getUTCMonth() !== m - 1) return undefined;
  if (date.getTime() > Date.now()) return undefined;
  return date.toISOString();
};

/** Convert ISO date string to DD/MM/YYYY display format */
export const isoDtoDmy = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
