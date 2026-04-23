import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, Linking, TouchableOpacity, Alert } from 'react-native';
import {
  Gift, Lock, MessageSquare, Star, FileDown, Shield, FileText, LogOut, Trash2,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import FadeInView from '@/components/FadeInView';
import { profileStyles as styles } from './profileStyles';
import { ms } from '@/utils/responsive';
import { getStoreUrl, getReviewUrl, SUPPORT_EMAIL } from '@/constants';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { Client } from '@/types';
import type { Router } from 'expo-router';

interface AccountSectionProps {
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
  client: Client | null;
  compteExpanded: boolean;
  setCompteExpanded: (v: boolean) => void;
  isExporting: boolean;
  isDeleting: boolean;
  handleExportData: () => void;
  handleLogout: () => void;
  handleDeleteAccount: () => void;
  router: Router;
}

export default function AccountSection({
  theme, t, locale, client, compteExpanded, setCompteExpanded,
  isExporting, isDeleting,
  handleExportData, handleLogout, handleDeleteAccount, router,
}: AccountSectionProps) {
  const isRTL = locale === 'ar';

  return (
    <FadeInView delay={500}>
      <TouchableOpacity onPress={() => setCompteExpanded(!compteExpanded)} activeOpacity={0.7} style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('profile.account')}</Text>
        <ChevronDown size={ms(18)} color={theme.textMuted} strokeWidth={1.5}
          style={{ transform: [{ rotate: compteExpanded ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>
      {compteExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
          {/* Referral */}
          <Pressable
            onPress={() => router.push('/referral')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Gift size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.referral')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.referralDesc')}</Text>
            </View>
            <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </Pressable>

          {/* Change/set password */}
          <Pressable
            onPress={() => router.push('/change-password')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Lock size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {client?.hasPassword ? t('profile.changePassword') : t('profile.setPasswordLink')}
              </Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {client?.hasPassword ? t('profile.changePasswordDesc') : t('profile.setPasswordLinkDesc')}
              </Text>
            </View>
            <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </Pressable>

          {/* Contact support */}
          <Pressable
            onPress={async () => {
              const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212675346486';
              // Check if we have a localized message, otherwise fallback to French or default
              const defaultMsg = "Bonjour, j'ai besoin d'aide avec l'app JitPlus";
              const rawT = t('profile.supportMessage');
              const message = rawT !== 'profile.supportMessage' ? rawT : defaultMsg;
              const msg = encodeURIComponent(message);
              
              const whatsappUrl = `whatsapp://send?phone=${phone}&text=${msg}`;
              const waMeUrl = `https://wa.me/${phone}?text=${msg}`;
              
              try {
                const canOpen = await Linking.canOpenURL(whatsappUrl);
                if (canOpen) {
                  await Linking.openURL(whatsappUrl);
                } else {
                  // Fallback to wa.me if native intent fails
                  await Linking.openURL(waMeUrl);
                }
              } catch (e) {
                // If everything fails, try email
                Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Support&body=${msg}`).catch(() => {
                  Alert.alert(t('common.error'), t('profile.supportError'));
                });
              }
            }}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <MessageSquare size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.contactSupport')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.contactSupportDesc')}</Text>
            </View>
          </Pressable>

          {/* Rate app */}
          <Pressable
            onPress={async () => {
              const reviewUrl = getReviewUrl();
              try {
                const canOpen = await Linking.canOpenURL(reviewUrl);
                if (canOpen) {
                  await Linking.openURL(reviewUrl);
                } else {
                  await Linking.openURL(getStoreUrl());
                }
              } catch {
                Linking.openURL(getStoreUrl()).catch(() => {});
              }
            }}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Star size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.rateApp')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.rateAppDesc')}</Text>
            </View>
          </Pressable>

          {/* Export data */}
          <Pressable
            onPress={handleExportData} disabled={isExporting}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              {isExporting
                ? <ActivityIndicator size="small" color={palette.gold} />
                : <FileDown size={ms(16)} color={palette.gold} strokeWidth={1.5} />}
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.exportData')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.exportDataDesc')}</Text>
            </View>
          </Pressable>

          {/* Privacy policy */}
          <Pressable
            onPress={() => router.push('/legal/privacy')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Shield size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.legalNotice')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.legalNoticeDesc')}</Text>
            </View>
            <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </Pressable>

          {/* Terms of use */}
          <Pressable
            onPress={() => router.push('/legal/terms')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <FileText size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.termsOfUse')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.termsOfUseDesc')}</Text>
            </View>
            <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </Pressable>

          {/* Logout */}
          <Pressable
            onPress={handleLogout}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <LogOut size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.danger }]}>{t('profile.logout')}</Text>
            </View>
          </Pressable>

          {/* Delete account */}
          <Pressable
            onPress={handleDeleteAccount} disabled={isDeleting}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, { borderBottomWidth: 0 }, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              {isDeleting
                ? <ActivityIndicator size="small" color={palette.gold} />
                : <Trash2 size={ms(16)} color={palette.gold} strokeWidth={1.5} />}
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.danger }]}>{t('profile.deleteAccount')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.deleteAccountDesc')}</Text>
            </View>
            <AlertTriangle size={ms(14)} color={theme.danger} strokeWidth={1.5} />
          </Pressable>
        </View>
      )}
    </FadeInView>
  );
}
