import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Mail, Star, Coins, RefreshCw, LogOut, QrCode, BarChart3, Settings, CheckCircle2, Circle, Store, Crown, Clock, Check, X, Sparkles } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import MerchantCategoryIcon, { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import MerchantLogo from '@/components/MerchantLogo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlanInfo } from '@/types';
import { DEFAULT_CURRENCY } from '@/config/currency';
import api from '@/services/api';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';

export default function ProfileScreen() {
  const { merchant, loading, signOut, loadProfile } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { label: categoryLabel } = useCategoryMetadata(merchant?.categorie);

  // ── Plan state ──
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);

  const loadPlanInfo = useCallback(async () => {
    try {
      const res = await api.get('/merchant/plan');
      setPlanInfo(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (merchant) loadPlanInfo();
  }, [merchant, loadPlanInfo]);

  useEffect(() => {
    if (!merchant && !loading) {
      router.replace('/login');
    }
  }, [merchant, loading]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const guardedLoadProfile = useGuardedCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!merchant) {
    return null;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.border, paddingTop: insets.top + 16 }]}>
        <View style={[styles.iconContainer, { backgroundColor: theme.bgElevated }]}>
          {merchant.logoUrl ? (
            <MerchantLogo logoUrl={merchant.logoUrl} style={styles.logoImage} />
          ) : (
            <MerchantCategoryIcon 
              category={merchant?.categorie} 
              size={64} 
              color={theme.primary}
              strokeWidth={1.5}
            />
          )}
        </View>
        <Text style={[styles.merchantName, { color: theme.text }]}>{merchant.nom}</Text>
        <View style={[styles.categoryBadge, { backgroundColor: theme.primaryBg }]}>
          <Text style={[styles.categoryText, { color: theme.primary }]}>{categoryLabel}</Text>
        </View>

        {/* Plan badge */}
        {planInfo && (
          <View style={[
            styles.categoryBadge,
            {
              backgroundColor: planInfo.plan === 'PREMIUM' ? '#37415130' : '#F3F4F6',
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            },
          ]}>
            <Crown size={14} color={planInfo.plan === 'PREMIUM' ? '#9CA3AF' : '#6B7280'} />
            <Text style={[styles.categoryText, {
              color: planInfo.plan === 'PREMIUM' ? '#9CA3AF' : '#6B7280',
            }]}>
              {planInfo.plan === 'PREMIUM'
                ? planInfo.planActivatedByAdmin
                  ? t('profileView.premium')
                  : planInfo.isTrial
                    ? t('profileView.trialPremium', { days: planInfo.daysRemaining })
                    : t('profileView.premium')
                : t('profileView.freePlan')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('profileView.information')}</Text>

        <View style={[styles.card, { backgroundColor: theme.bgCard, shadowColor: theme.shadowColor }]}>
          <View style={styles.infoRow}>
            <Mail size={20} color={palette.charbon} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profileView.email')}</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{merchant.email}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.infoRow}>
            <Star size={20} color={palette.charbon} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profileView.loyaltyProgram')}</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {merchant?.loyaltyType === 'STAMPS'
                  ? t('profileView.stampsMode', { count: merchant?.stampsForReward || 10 })
                  : t('profileView.pointsMode', { rate: merchant?.pointsRate || 10, currency: DEFAULT_CURRENCY.symbol })}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.infoRow}>
            <Coins size={20} color={palette.charbon} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profileView.minimumPurchase')}</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {merchant?.pointsRules?.minimumPurchase || 5} {DEFAULT_CURRENCY.symbol}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Plan details section */}
      {planInfo && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('profileView.subscription')}</Text>
          <View style={[styles.card, { backgroundColor: theme.bgCard, shadowColor: theme.shadowColor }]}>
            <View style={styles.infoRow}>
              <Crown size={20} color={planInfo.plan === 'PREMIUM' ? '#9CA3AF' : palette.charbon} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profileView.currentPlan')}</Text>
                <Text style={[styles.infoValue, { color: planInfo.plan === 'PREMIUM' ? '#9CA3AF' : theme.text, fontWeight: '700' }]}>
                  {planInfo.plan === 'PREMIUM' ? t('profileView.premium') : t('profileView.free')}
                  {planInfo.isTrial ? t('profileView.trial') : ''}
                </Text>
              </View>
            </View>
            {planInfo.isTrial && planInfo.daysRemaining !== null && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.infoRow}>
                  <Clock size={20} color={planInfo.daysRemaining <= 7 ? '#DC2626' : palette.charbon} />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profileView.trialEnd')}</Text>
                    <Text style={[styles.infoValue, { color: planInfo.daysRemaining <= 7 ? '#DC2626' : theme.text }]}>
                      {t('profileView.daysRemaining', { count: planInfo.daysRemaining })}
                    </Text>
                  </View>
                </View>
              </>
            )}
            {planInfo.plan === 'FREE' && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <TouchableOpacity onPress={() => router.push('/plan')} activeOpacity={0.7} style={{ paddingHorizontal: 4, paddingVertical: 8 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, fontFamily: 'Lexend_500Medium' }}>
                    {t('profileView.trialExpiredMessage')}
                  </Text>
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_600SemiBold', marginTop: 6 }}>
                    {t('profileView.discoverPro')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {/* Feature list */}
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={{ paddingVertical: 8, gap: 6 }}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold', marginBottom: 4 }}>
                {planInfo.plan === 'PREMIUM' ? t('profileView.featuresIncluded') : t('profileView.freePlanPrice')}
              </Text>
              {[
                { label: t('profileView.oneProgram'), included: true },
                { label: planInfo.limits.maxStores === 1 ? t('profileView.oneStore') : t('profileView.nStores', { count: planInfo.limits.maxStores }), included: true },
                { label: planInfo.plan === 'FREE' ? t('profileView.limitedClients') : t('profileView.unlimitedClients'), included: true },
                { label: t('profileView.basicDashboard'), included: true },
                { label: t('profileView.pushNotifications'), included: true },
                { label: t('profileView.whatsappMarketing'), included: planInfo.limits.whatsappBlasts },
                { label: t('profileView.emailMarketing'), included: planInfo.limits.emailBlasts },
              ].map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {f.included
                    ? <Check size={15} color={theme.primary} strokeWidth={1.5} />
                    : <X size={15} color="#9CA3AF" strokeWidth={1.5} />}
                  <Text style={{ color: f.included ? theme.text : theme.textMuted, fontSize: 13, fontFamily: 'Lexend_400Regular' }}>
                    {f.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('profileView.compliance')}</Text>
        
        <View style={[styles.card, { backgroundColor: theme.bgCard, shadowColor: theme.shadowColor }]}>
          <View style={styles.complianceRow}>
            {merchant.termsAccepted ? (
              <>
                <CheckCircle2 size={20} color={palette.charbon} strokeWidth={1.5} />
                <View style={styles.complianceContent}>
                  <Text style={[styles.complianceLabel, { color: theme.textSecondary }]}>{t('profileView.legalNotices')}</Text>
                  <Text style={[styles.complianceStatus, { color: theme.success }]}>{t('profileView.accepted')}</Text>
                </View>
              </>
            ) : (
              <>
                <Circle size={20} color={palette.charbon} strokeWidth={1.5} />
                <View style={styles.complianceContent}>
                  <Text style={[styles.complianceLabel, { color: theme.textSecondary }]}>{t('profileView.legalNotices')}</Text>
                  <Text style={[styles.complianceStatus, { color: theme.danger }]}>{t('profileView.notAccepted')}</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('profileView.actions')}</Text>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#7C3AED' }]}
          onPress={() => router.push('/plan')}
        >
          <Crown size={20} color="#fff" strokeWidth={1.5} />
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>
            {t('profileView.myPlan')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: theme.warning }]} 
          onPress={() => router.push('/settings')}
        >
          <Settings size={20} color="#fff" strokeWidth={1.5} />
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>
            {t('profileView.loyaltySettings')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: theme.primary }]} 
          onPress={() => router.push('/stores')}
        >
          <Store size={20} color="#fff" strokeWidth={1.5} />
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>
            {t('profileView.myStores')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: theme.primary }]} 
          onPress={() => router.push('/scan-qr')}
        >
          <QrCode size={20} color="#fff" strokeWidth={1.5} />
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>
            {t('profileView.scanQR')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: '#6B7280' }]} 
          onPress={() => router.push('/my-qr' as never)}
        >
          <Sparkles size={20} color="#fff" strokeWidth={1.5} />
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>
            {t('profileView.myQRCode')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: theme.success }]} 
          onPress={() => router.push('/dashboard')}
        >
          <BarChart3 size={20} color="#fff" strokeWidth={1.5} />
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>
            {t('profileView.dashboardHistory')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.bgCard, shadowColor: theme.shadowColor }]} onPress={guardedLoadProfile}>
          <RefreshCw size={20} color={palette.charbon} />
          <Text style={[styles.actionButtonText, { color: theme.text }]}>{t('profileView.refreshProfile')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2' }]}
          onPress={handleSignOut}
        >
          <LogOut size={20} color={palette.charbon} />
          <Text style={[styles.actionButtonText, { color: theme.danger }]}>
            {t('profileView.signOut')}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    resizeMode: 'cover',
  },
  merchantName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  categoryBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoContent: {
    marginLeft: 16,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionButtonText: {
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  complianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  complianceContent: {
    marginLeft: 12,
    flex: 1,
  },
  complianceLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  complianceStatus: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
});
