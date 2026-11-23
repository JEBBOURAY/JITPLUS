// Pure form logic of the collection wizard (no React Native), unit-tested.
import {
  COLLECTION_LIMITS as L,
  type CollectionDto,
  type CollectionInput,
  type CollectionStatus,
} from '@jitplus/shared/src/collection';
import type { FormError } from '@/components/games/gameForm';

export const COLLECTION_STEPS = ['items', 'gift', 'rules', 'review'] as const;
export type CollectionStep = (typeof COLLECTION_STEPS)[number];

export const COUPON_DAYS_PRESETS = [15, 30, 60, 90] as const;

export interface ItemForm {
  /** Stable list key (not sent) */
  key: string;
  /** Saved product: sent back so what clients collected stays ticked */
  id?: string;
  /** Product of a running collection: it can be renamed, not removed */
  locked?: boolean;
  label: string;
  /** Optional photo, already uploaded */
  imageUrl: string | null;
}

export interface CollectionForm {
  name: string;
  items: ItemForm[];
  giftLabel: string;
  /** Optional photo of the gift, already uploaded */
  giftImageUrl: string | null;
  onePerVisit: boolean;
  repeatable: boolean;
  couponValidityDays: number;
  /** true = the gift is usable from the day after ("next visit") */
  giftNextDay: boolean;
  /** YYYY-MM-DD, '' = no end */
  endsOn: string;
}

/** "Next visit" is sent as a 12 h delay: long enough to rule out the same visit. */
export const NEXT_VISIT_DELAY_HOURS = 12;

let keySeq = 0;
export const newItem = (label = '', imageUrl: string | null = null, saved?: { id: string; locked: boolean }): ItemForm => ({
  key: `item-${++keySeq}`,
  label,
  imageUrl,
  ...(saved ? { id: saved.id, locked: saved.locked } : {}),
});

export function initialCollectionForm(): CollectionForm {
  return {
    name: '',
    items: [newItem(), newItem(), newItem()],
    giftLabel: '',
    giftImageUrl: null,
    onePerVisit: false,
    repeatable: true,
    couponValidityDays: L.DEFAULT_COUPON_DAYS,
    giftNextDay: false,
    endsOn: '',
  };
}

export function formFromCollection(c: CollectionDto, endsOn: string, name = c.name): CollectionForm {
  return {
    name,
    items: c.items.map((i) => newItem(i.label, i.imageUrl, { id: i.id, locked: c.status === 'ACTIVE' })),
    giftLabel: c.giftLabel,
    giftImageUrl: c.giftImageUrl,
    onePerVisit: c.onePerVisit,
    repeatable: c.repeatable,
    couponValidityDays: c.couponValidityDays,
    giftNextDay: c.giftDelayHours > 0,
    endsOn,
  };
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Products the merchant named, blank rows dropped. */
export function filledItems(form: Pick<CollectionForm, 'items'>): CollectionInput['items'] {
  return form.items
    .map((i) => ({ ...(i.id ? { id: i.id } : {}), label: clean(i.label), imageUrl: i.imageUrl }))
    .filter((i) => i.label);
}

export function formToInput(form: CollectionForm, defaultName: string): CollectionInput {
  return {
    name: clean(form.name) || defaultName,
    items: filledItems(form),
    giftLabel: clean(form.giftLabel),
    giftImageUrl: form.giftImageUrl,
    onePerVisit: form.onePerVisit,
    repeatable: form.repeatable,
    couponValidityDays: form.couponValidityDays,
    giftDelayHours: form.giftNextDay ? NEXT_VISIT_DELAY_HOURS : 0,
    endsOn: form.endsOn || null,
  };
}

/** Changes when anything the merchant would lose changes. */
export function formSignature(form: CollectionForm): string {
  return JSON.stringify({ ...form, items: form.items.map((i) => [i.label, i.imageUrl]) });
}

export function validateStep(form: CollectionForm, step: CollectionStep, today: string): FormError | null {
  if (step === 'items' || step === 'review') {
    // A product of a running collection cannot be emptied (that would remove it).
    if (form.items.some((i) => i.locked && !clean(i.label))) return { key: 'collection.error.lockedItemEmpty' };
    const labels = filledItems(form).map((i) => i.label);
    if (labels.length < L.MIN_ITEMS) return { key: 'collection.error.minItems', params: { min: L.MIN_ITEMS } };
    if (new Set(labels.map((l) => l.toLocaleLowerCase())).size !== labels.length) return { key: 'collection.error.duplicateItems' };
  }
  if (step === 'gift' || step === 'review') {
    if (!clean(form.giftLabel)) return { key: 'collection.error.giftRequired' };
  }
  if (step === 'rules' || step === 'review') {
    if (form.endsOn && form.endsOn < today) return { key: 'collection.error.endPast' };
  }
  return null;
}

type CollectionFormAction =
  | { type: 'SET'; patch: Partial<Omit<CollectionForm, 'items'>> }
  | { type: 'SET_ITEM'; key: string; patch: Partial<Pick<ItemForm, 'label' | 'imageUrl'>> }
  | { type: 'ADD_ITEM' }
  | { type: 'REMOVE_ITEM'; key: string }
  | { type: 'RESET'; form: CollectionForm };

export function collectionFormReducer(state: CollectionForm, action: CollectionFormAction): CollectionForm {
  switch (action.type) {
    case 'SET':
      return { ...state, ...action.patch };
    case 'SET_ITEM':
      return { ...state, items: state.items.map((i) => (i.key === action.key ? { ...i, ...action.patch } : i)) };
    case 'ADD_ITEM':
      return state.items.length >= L.MAX_ITEMS ? state : { ...state, items: [...state.items, newItem()] };
    case 'REMOVE_ITEM':
      if (state.items.length <= L.MIN_ITEMS || state.items.some((i) => i.key === action.key && i.locked)) return state;
      return { ...state, items: state.items.filter((i) => i.key !== action.key) };
    case 'RESET':
      return action.form;
  }
}

/** What the owner can do with a collection, by status. */
export function availableActions(status: CollectionStatus): ('activate' | 'edit' | 'push' | 'end' | 'delete')[] {
  if (status === 'DRAFT') return ['activate', 'edit', 'delete'];
  if (status === 'ACTIVE') return ['edit', 'push', 'end'];
  return [];
}
