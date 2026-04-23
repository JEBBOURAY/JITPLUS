import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { MessageCircle, Mail } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { referralStyles as styles } from './referralStyles';
import { SUPPORT_EMAIL } from '@/constants';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface ReferralContactCardProps {
  isRTL: boolean;
  theme: ThemeColors;
  t: (key: string) => string;
}

export default function ReferralContactCard({ isRTL, theme, t }: ReferralContactCardProps) {
  return (
    <View style={[styles.contactCard, { backgroundColor: theme.bgCard }]}>
      <Text style={[styles.contactText, { color: theme.textMuted }, isRTL && styles.textRTL]}>
        {t('referral.contactSupportDesc')}
      </Text>
      <View style={[styles.contactActions, isRTL && styles.codeActionsRTL]}>
        <Pressable onPress={() => {
          const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212675346486';
          const msg = encodeURIComponent(t('referral.contactSupportWhatsApp'));
          Linking.openURL(`https://wa.me/${phone}?text=${msg}`).catch(() => {});
        }} style={({ pressed }) => [styles.contactBtn, { backgroundColor: '#25D36615' }, pressed && { opacity: 0.7 }]}>
          <MessageCircle size={ms(16)} color="#25D366" strokeWidth={2} />
          <Text style={[styles.contactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('referral.contactSupportEmail'))}`)} style={({ pressed }) => [styles.contactBtn, { backgroundColor: `${palette.red}15` }, pressed && { opacity: 0.7 }]}>
          <Mail size={ms(16)} color={palette.red} strokeWidth={2} />
          <Text style={[styles.contactBtnText, { color: palette.red }]}>Email</Text>
        </Pressable>
      </View>
    </View>
  );
}