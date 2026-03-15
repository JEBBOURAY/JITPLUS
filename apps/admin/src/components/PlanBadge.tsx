import React from 'react';
import { C, S } from '../theme';

interface Props {
  plan: 'FREE' | 'PREMIUM';
  isTrial?: boolean;
  isActive?: boolean;
}

export default function PlanBadge({ plan, isTrial, isActive = true }: Props) {
  if (!isActive) return <span style={S.badge(C.red)}>Banni</span>;
  if (plan === 'PREMIUM' && isTrial) return <span style={S.badge(C.cyan)}>Trial</span>;
  if (plan === 'PREMIUM') return <span style={S.badge(C.primary)}>Premium</span>;
  return <span style={S.badge(C.textMuted)}>Free</span>;
}
