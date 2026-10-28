export type WheelStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';

interface WheelPrize {
  id: string;
  label: string;
  description?: string | null;
  weight: number;
  totalStock: number;
  remaining: number;
  claimWindowHours?: number | null;
}

export interface WheelCampaign {
  id: string;
  name: string;
  description?: string | null;
  globalWinRate: number;
  startsAt: string;
  endsAt: string;
  minSpendAmount: number;
  status: WheelStatus;
  prizes: WheelPrize[];
  createdAt?: string;
  _count?: { tickets: number };
}

interface WheelPrizeInput {
  id?: string;
  label: string;
  description?: string;
  weight: number;
  totalStock: number;
  claimWindowHours?: number;
}

export interface WheelCampaignInput {
  name: string;
  description?: string;
  globalWinRate: number;
  startsAt: string;
  endsAt: string;
  minSpendAmount: number;
  prizes: WheelPrizeInput[];
}

export interface WheelPendingDraw {
  id: string;
  claimBefore?: string | null;
  createdAt?: string;
  prize?: { label: string; description?: string | null };
  ticket?: {
    clientId?: string;
    client?: { prenom?: string | null; nom?: string | null; telephone?: string | null };
    campaign?: { id?: string; name: string };
  };
}

export interface WheelFulfilledDraw {
  id: string;
  fulfilledAt: string;
  fulfilledBy?: string | null;
  fulfilledByName?: string | null;
  prize?: { label: string };
  ticket?: {
    client?: { prenom?: string | null; nom?: string | null };
    campaign?: { id?: string; name: string };
  };
}
