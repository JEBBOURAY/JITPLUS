import { AxiosInstance } from 'axios';

export interface StampCodeRedeemResult {
  success: true;
  /** True when this account had already used the code: nothing was credited again */
  alreadyRedeemed: boolean;
  stamps: number;
  newBalance: number;
  merchant: { id: string; nom: string };
}

export function createStampCodeMethods(http: AxiosInstance) {
  return {
    /** Credit the stamps of a single-use QR code found in an e-commerce parcel. */
    async redeemStampCode(token: string): Promise<StampCodeRedeemResult> {
      const { data } = await http.post('/stamp-codes/client/redeem', { token });
      return data;
    },
  };
}
