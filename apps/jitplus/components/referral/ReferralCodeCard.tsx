import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Copy, CheckCircle, Share2 } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { referralStyles as styles } from './referralStyles';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface ReferralCodeCardProps {
  code: string;
  copied: boolean;
  isRTL: boolean;
  onCopy: () => void;
  onShare: () => void;
  theme: ThemeColors;
  t: (key: string) => string;
}

export default function ReferralCodeCard({ code, copied, isRTL, onCopy, onShare, theme, t }: ReferralCodeCardProps) {
  return (
    <View style={[styles.codeCard, { backgroundColor: theme.bgCard }]}>
      <Text style={[styles.codeLabel, { color: theme.textMuted }]}>{t('referral.yourCode')}</Text>
      <Text style={[styles.codeValue, { color: theme.text }]}>{code}</Text>
      <View style={[styles.codeActions, isRTL && styles.codeActionsRTL]}>
        <Pressable onPress={onCopy} style={({ pressed }) => [styles.codeBtn, { backgroundColor: copied ? `${palette.emerald}15` : `${palette.violet}15` }, pressed && { opacity: 0.7 }]}>
          {copied ? <CheckCircle size={ms(16)} color={palette.emerald} strokeWidth={2} /> : <Copy size={ms(16)} color={palette.violet} strokeWidth={2} />}
          <Text style={[styles.codeBtnText, { color: copied ? palette.emerald : palette.violet }]}>{copied ? t('referral.codeCopied') : t('referral.copyCode')}</Text>
        </Pressable>
        <Pressable onPress={onShare} style={({ pressed }) => [styles.codeBtn, { backgroundColor: `${palette.violet}15` }, pressed && { opacity: 0.7 }]}>
          <Share2 size={ms(16)} color={palette.violet} strokeWidth={2} />
          <Text style={[styles.codeBtnText, { color: palette.violet }]}>{t('referral.shareCode')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
