import { memo, useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { LogOut } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { useAppFonts } from '@/utils/fonts';
import { haptic, HapticStyle } from '@/utils/haptics';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';
import DeleteAccountModal from './DeleteAccountModal';

/** Logout + account deletion, kept visually apart from regular settings. */
function AccountActions() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const { client, logout } = useAuth();
  const [showDelete, setShowDelete] = useState(false);

  const handleLogout = useCallback(() => {
    haptic(HapticStyle.Medium);
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        // The root layout sends the signed-out user to welcome, clearing the history.
        onPress: async () => { await logout(); },
      },
    ]);
  }, [logout, t]);

  const openDelete = useCallback(() => { haptic(HapticStyle.Heavy); setShowDelete(true); }, []);
  const closeDelete = useCallback(() => setShowDelete(false), []);

  // Errors propagate to the modal, which stays open and shows them inline
  // (a wrong password must be retyped, not replayed into the 3/min throttle).
  const confirmDelete = useCallback(async (password: string) => {
    await api.deleteAccount(password);
    setShowDelete(false);
    Alert.alert(t('profile.accountDeleted'), t('profile.accountDeletedMsg'));
    // The account is gone: a failed logout must not surface as a deletion error.
    try {
      await logout();
    } catch (error) {
      if (__DEV__) console.warn('Logout after account deletion failed:', error);
    }
  }, [logout, t]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handleLogout}
        accessibilityRole="button"
        accessibilityLabel={t('profile.logout')}
        android_ripple={{ color: `${theme.danger}14` }}
        style={({ pressed }) => [
          styles.logoutBtn,
          { backgroundColor: theme.bgCard, borderColor: `${theme.danger}40` },
          pressed && styles.pressed,
        ]}
      >
        <LogOut size={ms(17)} color={theme.danger} strokeWidth={2.2} />
        <Text style={[styles.logoutText, { color: theme.danger, fontFamily: fonts.semibold }]}>{t('profile.logout')}</Text>
      </Pressable>

      <Pressable
        onPress={openDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('profile.deleteAccount')}
        accessibilityHint={t('profile.deleteAccountDesc')}
        style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
      >
        <Text style={[styles.deleteText, { color: theme.textMuted, fontFamily: fonts.medium }]}>
          {t('profile.deleteAccount')}
        </Text>
      </Pressable>

      <DeleteAccountModal
        visible={showDelete}
        hasPassword={!!client?.hasPassword}
        onClose={closeDelete}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

export default memo(AccountActions);

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', marginTop: hp(4) },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(8),
    height: ms(52),
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  logoutText: { fontSize: FS.md },
  deleteLink: { alignSelf: 'center', paddingVertical: hp(14), paddingHorizontal: wp(12), minHeight: ms(44), justifyContent: 'center' },
  deleteText: { fontSize: FS.sm, textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
});
