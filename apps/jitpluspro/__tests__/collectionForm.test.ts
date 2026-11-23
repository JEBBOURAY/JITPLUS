import { COLLECTION_LIMITS } from '@jitplus/shared/src/collection';
import {
  NEXT_VISIT_DELAY_HOURS,
  availableActions,
  collectionFormReducer,
  filledItems,
  formFromCollection,
  formSignature,
  formToInput,
  initialCollectionForm,
  newItem,
  validateStep,
  type CollectionForm,
} from '@/components/collection/collectionForm';

const TODAY = '2026-11-21';
const form = (patch: Partial<CollectionForm> = {}): CollectionForm => ({
  ...initialCollectionForm(),
  items: [newItem('Espresso'), newItem(' Mojito '), newItem('')],
  giftLabel: ' Un café glacé ',
  ...patch,
});

describe('collection form', () => {
  it('starts with three empty products and the recommended rules', () => {
    const f = initialCollectionForm();
    expect(f.items).toHaveLength(3);
    expect(f).toMatchObject({ onePerVisit: false, repeatable: true, couponValidityDays: 30, giftNextDay: false, endsOn: '' });
  });

  it('drops blank rows and trims labels', () => {
    expect(filledItems(form())).toEqual([{ label: 'Espresso', imageUrl: null }, { label: 'Mojito', imageUrl: null }]);
  });

  it('builds the API input', () => {
    expect(formToInput(form({ giftNextDay: true, endsOn: '2027-01-31' }), 'Collection')).toEqual({
      name: 'Collection',
      items: [{ label: 'Espresso', imageUrl: null }, { label: 'Mojito', imageUrl: null }],
      giftLabel: 'Un café glacé',
      giftImageUrl: null,
      onePerVisit: false,
      repeatable: true,
      couponValidityDays: 30,
      giftDelayHours: NEXT_VISIT_DELAY_HOURS,
      endsOn: '2027-01-31',
    });
    expect(formToInput(form({ name: ' Été ' }), 'Collection')).toMatchObject({ name: 'Été', giftDelayHours: 0, endsOn: null });
  });

  it('loads a saved draft', () => {
    const loaded = formFromCollection(
      {
        id: 'c1', name: 'Été', giftLabel: 'Un café glacé', giftImageUrl: null, status: 'DRAFT', onePerVisit: true, repeatable: false,
        couponValidityDays: 60, giftDelayHours: 12, endsAt: null, startedAt: null, endedAt: null, createdAt: '',
        items: [{ id: 'i1', label: 'Espresso', imageUrl: 'https://cdn.test/a.webp' }, { id: 'i2', label: 'Mojito', imageUrl: null }],
      },
      '',
    );
    expect(loaded).toMatchObject({ name: 'Été', onePerVisit: true, repeatable: false, couponValidityDays: 60, giftNextDay: true, endsOn: '' });
    expect(loaded.items.map((i) => [i.label, i.imageUrl])).toEqual([['Espresso', 'https://cdn.test/a.webp'], ['Mojito', null]]);
  });

  it('ignores list keys in the signature but sees every edit', () => {
    const a = form();
    const b = { ...a, items: a.items.map((i) => newItem(i.label)) };
    expect(formSignature(a)).toBe(formSignature(b));
    const withPhoto = { ...a, items: a.items.map((i, n) => (n === 0 ? { ...i, imageUrl: 'https://cdn.test/a.webp' } : i)) };
    expect(formSignature(a)).not.toBe(formSignature(withPhoto));
    expect(formSignature(a)).not.toBe(formSignature({ ...a, giftLabel: 'Autre' }));
  });
});

describe('validateStep', () => {
  it('needs two different products', () => {
    expect(validateStep(form({ items: [newItem('Espresso'), newItem('')] }), 'items', TODAY)).toEqual({
      key: 'collection.error.minItems',
      params: { min: COLLECTION_LIMITS.MIN_ITEMS },
    });
    expect(validateStep(form({ items: [newItem('Mojito'), newItem('mojito ')] }), 'items', TODAY)?.key).toBe('collection.error.duplicateItems');
    expect(validateStep(form(), 'items', TODAY)).toBeNull();
  });

  it('needs a gift', () => {
    expect(validateStep(form({ giftLabel: '  ' }), 'gift', TODAY)?.key).toBe('collection.error.giftRequired');
  });

  it('refuses a past end date', () => {
    expect(validateStep(form({ endsOn: '2026-11-20' }), 'rules', TODAY)?.key).toBe('collection.error.endPast');
    expect(validateStep(form({ endsOn: TODAY }), 'rules', TODAY)).toBeNull();
  });

  it('checks everything again on the review step', () => {
    expect(validateStep(form({ giftLabel: '' }), 'review', TODAY)?.key).toBe('collection.error.giftRequired');
    expect(validateStep(form(), 'review', TODAY)).toBeNull();
  });
});

describe('collectionFormReducer', () => {
  it('edits, adds and removes products within the limits', () => {
    let f = form();
    f = collectionFormReducer(f, { type: 'SET_ITEM', key: f.items[2].key, patch: { label: 'Jus' } });
    f = collectionFormReducer(f, { type: 'SET_ITEM', key: f.items[0].key, patch: { imageUrl: 'https://cdn.test/a.webp' } });
    expect(filledItems(f)).toEqual([
      { label: 'Espresso', imageUrl: 'https://cdn.test/a.webp' },
      { label: 'Mojito', imageUrl: null },
      { label: 'Jus', imageUrl: null },
    ]);

    for (let i = 0; i < 20; i++) f = collectionFormReducer(f, { type: 'ADD_ITEM' });
    expect(f.items).toHaveLength(COLLECTION_LIMITS.MAX_ITEMS);

    for (let i = 0; i < 20; i++) f = collectionFormReducer(f, { type: 'REMOVE_ITEM', key: f.items[f.items.length - 1].key });
    expect(f.items).toHaveLength(COLLECTION_LIMITS.MIN_ITEMS);
  });
});

describe('availableActions', () => {
  it('follows the life cycle', () => {
    expect(availableActions('DRAFT')).toEqual(['activate', 'edit', 'delete']);
    expect(availableActions('ACTIVE')).toEqual(['edit', 'push', 'end']);
    expect(availableActions('ENDED')).toEqual([]);
  });
});

describe('editing a running collection', () => {
  const running = formFromCollection(
    {
      id: 'c1', name: 'Été', giftLabel: 'Un café glacé', giftImageUrl: 'https://cdn.test/gift.webp', status: 'ACTIVE',
      onePerVisit: false, repeatable: true, couponValidityDays: 30, giftDelayHours: 0, endsAt: null, startedAt: null,
      endedAt: null, createdAt: '',
      items: [{ id: 'i1', label: 'Espresso', imageUrl: null }, { id: 'i2', label: 'Mojito', imageUrl: null }, { id: 'i3', label: 'Jus', imageUrl: null }],
    },
    '',
  );

  it('locks the saved products and sends their ids back, with the gift photo', () => {
    expect(running.items.every((i) => i.locked)).toBe(true);
    const input = formToInput(collectionFormReducer(running, { type: 'ADD_ITEM' }), 'Collection');
    expect(input.items.map((i) => i.id)).toEqual(['i1', 'i2', 'i3']);
    expect(input.giftImageUrl).toBe('https://cdn.test/gift.webp');
  });

  it('never removes a locked product, even above the minimum', () => {
    const after = collectionFormReducer(running, { type: 'REMOVE_ITEM', key: running.items[0].key });
    expect(after.items).toHaveLength(3);
  });

  it('refuses to empty a locked product (it would be dropped)', () => {
    const emptied = collectionFormReducer(running, { type: 'SET_ITEM', key: running.items[0].key, patch: { label: ' ' } });
    expect(validateStep(emptied, 'items', TODAY)?.key).toBe('collection.error.lockedItemEmpty');
  });
});
