import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BadgeCheck } from 'lucide-react-native';
import { ms } from '@/utils/responsive';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { ClientNotification } from '@/types';
import SwipeableNotifCard from './SwipeableNotifCard';
import { notificationStyles as styles } from './notificationStyles';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface NotificationCardProps {
  notif: ClientNotification;
  timeLabel: string;
  onPress: (notif: ClientNotification) => void;
  onDismiss: (id: string) => void;
  theme: ThemeColors;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export default React.memo(function NotificationCard({
  notif, timeLabel, onPress, onDismiss, theme, fonts, t,
}: NotificationCardProps) {
  const isDark = theme.mode === 'dark';
  const isUnread = !notif.isRead;
  const isOfficial = !notif.merchantName;
  const sender = notif.merchantName || 'JitPlus';
  const accent = isDark ? palette.violetLight : palette.violet;
  // Opaque tints (not rgba) so the unread dot's border reads as a clean cut-out.
  const cardBg = isUnread ? (isDark ? '#1E2340' : '#F7F3FF') : theme.bgCard;

  const handlePress = useCallback(() => onPress(notif), [onPress, notif]);
  const handleDismiss = useCallback(() => onDismiss(notif.id), [onDismiss, notif.id]);

  const a11yLabel = [
    isUnread ? t('notifications.unreadA11y') : null,
    sender,
    notif.title,
    timeLabel,
  ].filter(Boolean).join(', ');

  return (
    <SwipeableNotifCard onDismiss={handleDismiss} deleteLabel={t('common.delete')} fontFamily={fonts.semibold}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: cardBg, borderColor: isUnread ? `${accent}33` : theme.border },
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('notifications.openHint')}
        accessibilityActions={[{ name: 'dismiss', label: t('common.delete') }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'dismiss') handleDismiss(); }}
      >
        <View style={styles.logoWrap}>
          <MerchantLogo logoUrl={notif.merchantLogoUrl} style={[styles.logo, { backgroundColor: theme.bgInput }]} merchantName={sender} />
          {isUnread && <View style={[styles.logoUnreadDot, { backgroundColor: accent, borderColor: cardBg }]} />}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <View style={styles.senderRow}>
              <Text style={[styles.sender, { color: isOfficial ? accent : theme.textSecondary, fontFamily: fonts.semibold }]} numberOfLines={1}>
                {sender}
              </Text>
              {isOfficial && <BadgeCheck size={ms(13)} color={accent} strokeWidth={2.2} />}
            </View>
            <Text style={[styles.time, { color: isUnread ? accent : theme.textMuted, fontFamily: isUnread ? fonts.semibold : fonts.regular }]} numberOfLines={1}>
              {timeLabel}
            </Text>
          </View>
          <Text
            style={[styles.cardTitle, { color: theme.text, fontFamily: isUnread ? fonts.bold : fonts.medium }]}
            numberOfLines={2}
          >
            {notif.title}
          </Text>
          {!!notif.body && (
            <Text style={[styles.cardBody, { color: isUnread ? theme.textSecondary : theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
              {notif.body}
            </Text>
          )}
        </View>
      </Pressable>
    </SwipeableNotifCard>
  );
});
