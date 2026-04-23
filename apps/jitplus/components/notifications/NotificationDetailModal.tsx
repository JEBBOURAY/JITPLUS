import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { ms } from '@/utils/responsive';
import MerchantLogo from '@/components/MerchantLogo';
import { notificationStyles as styles } from './notificationStyles';
import { ClientNotification } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

const COLOR_MAP: Record<string, string> = {
  reward: '#10B981',
  promo: '#7C3AED',
  info: '#3B82F6',
};

interface NotificationDetailModalProps {
  notif: ClientNotification | null;
  onClose: () => void;
  theme: ThemeColors;
  notifDateFmt: Intl.DateTimeFormat;
  t: (key: string) => string;
}

export default React.memo(function NotificationDetailModal({ notif, onClose, theme, notifDateFmt, t }: NotificationDetailModalProps) {
  if (!notif) return null;
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.modalSheet, { backgroundColor: theme.bgCard }]}>
        <View style={[styles.modalHandle, { backgroundColor: theme.textMuted + '60' }]} />
        <View style={styles.modalHeader}>
          <View style={[styles.modalIcon, { backgroundColor: `${COLOR_MAP[notif.type] ?? theme.primary}15` }]}>
            <MerchantLogo logoUrl={notif.merchantLogoUrl} style={styles.modalLogoImg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalMerchant, { color: !notif.merchantName ? '#3B82F6' : theme.primaryLight }]}>
              {notif.merchantName || 'JitPlus'}
            </Text>
            <Text style={[styles.modalDate, { color: theme.textMuted }]}>
              {notifDateFmt.format(new Date(notif.createdAt))}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: ms(4) }}>
            <X size={ms(20)} color={theme.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{notif.title}</Text>
          <Text style={[styles.modalBodyText, { color: theme.textMuted }]}>{notif.body}</Text>
        </ScrollView>
        <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: `${theme.primary}18` }]} onPress={onClose} activeOpacity={0.75}>
          <Text style={[styles.modalCloseBtnText, { color: theme.primary }]}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
})
