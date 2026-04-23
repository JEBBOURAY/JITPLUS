import React from 'react';
import { View, Text } from 'react-native';
import { Share2, Smartphone, BadgeCheck, CreditCard } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { referralStyles as styles } from './referralStyles';
import type { ThemeColors } from '@/contexts/ThemeContext';

const STEPS = [
  { icon: Share2, titleKey: 'referral.howStep1Title', descKey: 'referral.howStep1Desc' },
  { icon: Smartphone, titleKey: 'referral.howStep2Title', descKey: 'referral.howStep2Desc' },
  { icon: BadgeCheck, titleKey: 'referral.howStep3Title', descKey: 'referral.howStep3Desc' },
  { icon: CreditCard, titleKey: 'referral.howStep4Title', descKey: 'referral.howStep4Desc' },
];

interface HowItWorksProps {
  isRTL: boolean;
  theme: ThemeColors;
  t: (key: string) => string;
}

export default function HowItWorks({ isRTL, theme, t }: HowItWorksProps) {
  return (
    <View style={[styles.howCard, { backgroundColor: theme.bgCard }]}>
      <Text style={[styles.howTitle, { color: theme.text }]}>{t('referral.howTitle')}</Text>
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isLast = i === STEPS.length - 1;
        return (
          <View key={i} style={[styles.howStep, isRTL && styles.howStepRTL, isLast && { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <View style={[styles.howStepIcon, { backgroundColor: `${palette.gold}12` }]}>
              <View style={styles.howStepNumber}><Text style={styles.howStepNumberText}>{i + 1}</Text></View>
              <Icon size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.howStepContent}>
              <Text style={[styles.howStepTitle, { color: theme.text }]}>{t(step.titleKey)}</Text>
              <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t(step.descKey)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
