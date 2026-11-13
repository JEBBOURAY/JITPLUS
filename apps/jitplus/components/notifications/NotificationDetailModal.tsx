import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Trash2, BadgeCheck, BadgePercent } from 'lucide-react-native';
import { hp, ms } from '@/utils/responsive';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import BottomSheet from '@/components/BottomSheet';
import { ClientNotification } from '@/types';
import type { Href } from 'expo-router';
import { notificationKind, notificationLinkRoute } from '@/utils/notificationKind';
import { notificationStyles as styles } from './notificationStyles';

import type { AppFonts } from '@/utils/fonts';

interface NotificationDetailModalProps {
  notif: ClientNotification | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  /** Opens the screen the notification points at (its merchant card). */
  onOpenLink: (route: Href) => void;
  theme: ThemeColors;
  fonts: AppFonts;
  formatDate: (date: Date) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export default React.memo(function NotificationDetailModal({
  notif, onClose, onDelete, onOpenLink, theme, fonts, formatDate, t,
}: NotificationDetailModalProps) {
  const insets = useSafeAreaInsets();
  // Keeps the content on screen during the slide-out, after the parent clears `notif`.
  const [shown, setShown] = useState<ClientNotification | null>(notif);
  useEffect(() => { if (notif) setShown(notif); }, [notif]);

  // Delete / open run once the sheet has left, so the list and navigation update behind a closed modal.
  const pendingRef = useRef<(() => void) | null>(null);
  const handleExited = useCallback(() => {
    setShown(null);
    const run = pendingRef.current;
    pendingRef.current = null;
    run?.();
  }, []);

  const handleDelete = useCallback(() => {
    const id = shown?.id;
    if (id) pendingRef.current = () => onDelete(id);
    onClose();
  }, [onClose, onDelete, shown?.id]);

  const linkRoute = shown ? notificationLinkRoute(shown) : null;
  const handleOpenLink = useCallback(() => {
    if (!linkRoute) return;
    pendingRef.current = () => onOpenLink(linkRoute);
    onClose();
  }, [onClose, onOpenLink, linkRoute]);

  if (!shown) return null;

  const isDark = theme.mode === 'dark';
  const accent = isDark ? palette.violetLight : palette.violet;
  const kind = notificationKind(shown);
  const isOfficial = kind !== 'merchant';
  const sender = kind === 'deals' ? t('deals.notification.sender') : shown.merchantName || 'JitPlus';

  return (
    <BottomSheet
      visible={!!notif}
      onClose={onClose}
      onExited={handleExited}
      scrollable
      backdropColor="rgba(15,23,42,0.5)"
      backdropLabel={t('common.close')}
      handleStyle={styles.modalHandle}
      style={[styles.modalSheet, { backgroundColor: theme.bgCard, paddingBottom: insets.bottom + hp(16) }]}
      header={(
        <View style={styles.modalGrabZone}>
          <View style={styles.modalHeader}>
            {kind === 'deals' ? (
              <View style={[styles.modalLogo, styles.dealsLogo, { backgroundColor: `${palette.violet}${isDark ? '33' : '18'}` }]}>
                <BadgePercent size={ms(24)} color={accent} strokeWidth={2} />
              </View>
            ) : (
              <MerchantLogo logoUrl={shown.merchantLogoUrl} style={[styles.modalLogo, { backgroundColor: theme.bgInput }]} merchantName={sender} />
            )}
            <View style={styles.modalHeaderText}>
              <View style={styles.modalSenderRow}>
                <Text style={[styles.modalSender, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1}>{sender}</Text>
                {isOfficial && <BadgeCheck size={ms(15)} color={accent} strokeWidth={2.2} />}
              </View>
              <Text style={[styles.modalDate, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
                {isOfficial ? `${t('notifications.official')} · ` : ''}{formatDate(new Date(shown.createdAt))}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.modalClose, { backgroundColor: theme.bgInput }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={ms(17)} color={theme.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <View style={[styles.modalDivider, { backgroundColor: theme.border }]} />
        </View>
      )}
    >
      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false} bounces={false}>
        <Text style={[styles.modalTitle, { color: theme.text, fontFamily: fonts.bold }]} selectable>{shown.title}</Text>
        {!!shown.body && (
          <Text style={[styles.modalBodyText, { color: theme.textSecondary, fontFamily: fonts.regular }]} selectable>{shown.body}</Text>
        )}
      </ScrollView>

      <View style={styles.modalActions}>
        <TouchableOpacity
          onPress={handleDelete}
          activeOpacity={0.75}
          style={[styles.modalDeleteBtn, { borderColor: `${theme.danger}40`, backgroundColor: `${theme.danger}0D` }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Trash2 size={ms(17)} color={theme.danger} strokeWidth={2} />
          <Text style={[styles.modalBtnText, { color: theme.danger, fontFamily: fonts.semibold }]}>{t('common.delete')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={linkRoute ? handleOpenLink : onClose}
          activeOpacity={0.85}
          style={[styles.modalPrimaryBtn, { backgroundColor: palette.violet }]}
          accessibilityRole="button"
        >
          <Text style={[styles.modalBtnText, { color: '#fff', fontFamily: fonts.bold }]}>
            {t(linkRoute ? 'notifications.viewCard' : 'notifications.gotIt')}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
});
