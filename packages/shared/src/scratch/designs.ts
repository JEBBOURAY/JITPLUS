// ── Scratch card designs — the backend stores only the design id ─────────────

export interface ScratchCardDesign {
  id: string;
  /** i18n key of the design name shown in the wizard */
  nameKey: string;
  /** Background of the card (revealed side) */
  gradient: readonly [string, string];
  /** Colours of the layer the client scratches off */
  cover: readonly [string, string];
  accent: string;
  text: string;
  /** Decorative glyph repeated on the cover */
  motif: string;
}

export const SCRATCH_CARD_DESIGNS: readonly ScratchCardDesign[] = [
  { id: 'violet', nameKey: 'scratch.design.violet', gradient: ['#7C3AED', '#4C1D95'], cover: ['#C4B5FD', '#A78BFA'], accent: '#FCD34D', text: '#FFFFFF', motif: '✦' },
  { id: 'gold', nameKey: 'scratch.design.gold', gradient: ['#F59E0B', '#B45309'], cover: ['#E5E7EB', '#9CA3AF'], accent: '#FFFFFF', text: '#FFFFFF', motif: '★' },
  { id: 'emerald', nameKey: 'scratch.design.emerald', gradient: ['#10B981', '#065F46'], cover: ['#D1FAE5', '#6EE7B7'], accent: '#FDE68A', text: '#FFFFFF', motif: '◆' },
  { id: 'ramadan', nameKey: 'scratch.design.ramadan', gradient: ['#1E3A8A', '#0F172A'], cover: ['#FDE68A', '#F59E0B'], accent: '#FCD34D', text: '#FFFFFF', motif: '☾' },
  { id: 'eid', nameKey: 'scratch.design.eid', gradient: ['#DB2777', '#7C3AED'], cover: ['#FBCFE8', '#F9A8D4'], accent: '#FFFFFF', text: '#FFFFFF', motif: '✿' },
  { id: 'charcoal', nameKey: 'scratch.design.charcoal', gradient: ['#1F2937', '#111827'], cover: ['#D1D5DB', '#9CA3AF'], accent: '#A78BFA', text: '#FFFFFF', motif: '●' },
] as const;

export const DEFAULT_SCRATCH_DESIGN_ID = 'violet';

export function getScratchDesign(id?: string | null): ScratchCardDesign {
  return SCRATCH_CARD_DESIGNS.find((d) => d.id === id) ?? SCRATCH_CARD_DESIGNS[0];
}
