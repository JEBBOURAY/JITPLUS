import { COLLECTION_LIMITS as SHARED } from '../../../../packages/shared/src/collection';
import { COLLECTION_LIMITS } from './collection-rules';

// The apps validate the form with the shared copy; the API enforces this one.
it('collection limits stay in sync (backend ↔ shared)', () => {
  expect(SHARED).toEqual(COLLECTION_LIMITS);
});
