import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, Animated, PanResponder, Dimensions, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Trash2, BadgeCheck } from 'lucide-react-native';
import { hp, ms } from '@/utils/responsive';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { ClientNotification } from '@/types';
import { notificationStyles as styles } from './notificationStyles';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface NotificationDetailModalProps {
  notif: ClientNotification | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  theme: ThemeColors;
  fonts: AppFonts;
  formatDate: (date: Date) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const OPEN_DURATION_MS = 260;
const CLOSE_DURATION_MS = 200;
const DRAG_CLOSE_DISTANCE = 110;
const DRAG_CLOSE_VELOCITY = 1.1;

export default React.memo(function NotificationDetailModal({
  notif, onClose, onDelete, theme, fonts, formatDate, t,
}: NotificationDetailModalProps) {
  const insets = useSafeAreaInsets();
  // Keeps the content mounted during the close animation, after the parent clears `notif`.
  const [shown, setShown] = useState<ClientNotification | null>(notif);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!notif) {
      if (!closingRef.current) setShown(null);
      return;
    }
    closingRef.current = false;
    setShown(notif);
    translateY.setValue(SCREEN_HEIGHT);
    overlay.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.9 }),
      Animated.timing(overlay, { toValue: 1, duration: OPEN_DURATION_MS, useNativeDriver: true }),
    ]).start();
  }, [notif, translateY, overlay]);

  const animateOut = useCallback((after: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: CLOSE_DURATION_MS, useNativeDriver: true }),
      Animated.timing(overlay, { toValue: 0, duration: CLOSE_DURATION_MS, useNativeDriver: true }),
    ]).start(() => {
      setShown(null);
      after();
    });
  }, [translateY, overlay]);

  const handleClose = useCallback(() => animateOut(onClose), [animateOut, onClose]);
  const handleDelete = useCallback(() => {
    const id = shown?.id;
    animateOut(() => { onClose(); if (id) onDelete(id); });
  }, [animateOut, onClose, onDelete, shown?.id]);

  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { translateY.setValue(Math.max(0, g.dy)); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DRAG_CLOSE_DISTANCE || g.vy > DRAG_CLOSE_VELOCITY) handleCloseRef.current();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    }),
  ).current;

  if (!shown) return null;

  const isDark = theme.mode === 'dark';
  const accent = isDark ? palette.violetLight : palette.violet;
  const isOfficial = !shown.merchantName;
  const sender = shown.merchantName || 'JitPlus';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <Animated.View style={[styles.modalOverlay, { opacity: overlay }]}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      </Animated.View>

      <Animated.View
        style={[styles.modalSheet, {
          backgroundColor: theme.bgCard,
          paddingBottom: insets.bottom + hp(16),
          transform: [{ translateY }],
        }]}
        accessibilityViewIsModal
      >
        <View style={styles.modalGrabZone} {...panResponder.panHandlers}>
          <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
          <View style={styles.modalHeader}>
            <MerchantLogo logoUrl={shown.merchantLogoUrl} style={[styles.modalLogo, { backgroundColor: theme.bgInput }]} merchantName={sender} />
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
              onPress={handleClose}
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
            onPress={handleClose}
            activeOpacity={0.85}
            style={[styles.modalPrimaryBtn, { backgroundColor: palette.violet }]}
            accessibilityRole="button"
          >
            <Text style={[styles.modalBtnText, { color: '#fff', fontFamily: fonts.bold }]}>{t('notifications.gotIt')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
});
