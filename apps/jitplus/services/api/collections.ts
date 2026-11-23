import { AxiosInstance } from 'axios';
import type { ClientCollection, ClientCollectionsOverview } from '@jitplus/shared/src/collection';

export function createCollectionMethods(http: AxiosInstance) {
  return {
    /** The open collection of a merchant with the caller's progress; null when there is none. */
    async getMerchantCollection(merchantId: string): Promise<ClientCollection | null> {
      const { data } = await http.get<{ collection: ClientCollection | null }>(`/collections/client/merchants/${merchantId}`);
      return data.collection ?? null;
    },
    /** Open collections of the shops where the caller has a card, and the gifts already won. */
    async getMyCollections(): Promise<ClientCollectionsOverview> {
      const { data } = await http.get<ClientCollectionsOverview>('/collections/client');
      return data;
    },
  };
}
