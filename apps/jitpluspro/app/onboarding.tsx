import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Upload,
  Gift,
  Sparkles,
  BarChart3,
  Smartphone,
  Camera,
  ArrowRight,
  QrCode,
  Trophy,
  Zap,
  Users,
  Stamp,
  Coins,
  ShieldCheck,
  Hash,
  Footprints,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, brandGradient, brandGradientFull, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import api, { getServerBaseUrl } from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { DEFAULT_CURRENCY } from '@/config/currency';

// â”€â”€ Step IDs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STEPS = ['welcome', 'logo', 'reward', 'scan', 'done'] as const;

// â”€â”€ Animated step wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StepSlide({
  children,
  visible,
  direction,
}: {
  children: React.ReactNode;
  visible: boolean;
  direction: 'enter' | 'exit';
}) {
  const { width: SCREEN_W } = useWindowDimensions();
  const anim = useRef(new Animated.Value(visible ? 0 : SCREEN_W)).current;

  React.useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 0 : direction === 'exit' ? -SCREEN_W : SCREEN_W,
      useNativeDriver: true,
      tension: 80,
      friction: 14,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { transform: [{ translateX: anim }] }]}
    >
      {children}
    </Animated.View>
  );
}

// â”€â”€ Progress dots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ProgressDots({
  current,
  total,
  theme,
}: {
  current: number;
  total: number;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor:
                i < current
                  ? palette.violet
                  : i === current
                  ? palette.violet
                  : theme.borderLight,
              width: i === current ? 24 : 8,
            },
          ]}
        />
      ))}
    </View>
  );
}

// â”€â”€ Feature row (welcome step) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FeatureRow({
  icon,
  title,
  desc,
  theme,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.featureRow, { borderColor: theme.borderLight, backgroundColor: theme.bgCard }]}>
      <View style={[styles.featureIcon, { backgroundColor: '#6B7280' + '15' }]}>
        {icon}
      </View>
      <View style={styles.featureText}>
        <Text style={[styles.featureTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.featureDesc, { color: theme.textMuted }]}>{desc}</Text>
      </View>
    </View>
  );
}

// â”€â”€ ChecklistItem (scan step) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CheckItem({
  num,
  text,
  theme,
}: {
  num: number;
  text: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.checkItemRow}>
      <View style={[styles.checkNum, { backgroundColor: '#6B7280' + '20' }]}>
        <Text style={[styles.checkNumText, { color: '#6B7280' }]}>{num}</Text>
      </View>
      <Text style={[styles.checkText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

// â”€â”€ Stat badge (done step) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatBadge({
  icon,
  label,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.statBadge, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      <View style={[styles.statIcon, { backgroundColor: palette.violet + '15' }]}>{icon}</View>
      <Text style={[styles.statLabel, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Main onboarding screen
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function OnboardingScreen() {
  const { merchant, updateMerchant, completeOnboarding, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'enter' | 'exit'>('enter');

  // â”€â”€ Step 2: Logo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [logoUri, setLogoUri] = useState<string | null>(merchant?.logoUrl ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // â”€â”€ Step 3: Reward â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [loyaltyType, setLoyaltyType] = useState<'POINTS' | 'STAMPS'>(merchant?.loyaltyType === 'STAMPS' ? 'STAMPS' : 'POINTS');
  const isStamps = loyaltyType === 'STAMPS';
  const [stampEarningMode, setStampEarningMode] = useState<'PER_VISIT' | 'PER_AMOUNT'>(merchant?.stampEarningMode ?? 'PER_VISIT');
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState('');
  const [rewardDesc, setRewardDesc] = useState('');
  const [creatingReward, setCreatingReward] = useState(false);
  const [rewardCreated, setRewardCreated] = useState(false);
  const rewardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasAccumulationLimit, setHasAccumulationLimit] = useState(false);
  const [accumulationLimit, setAccumulationLimit] = useState('');
  const [pointsRate, setPointsRate] = useState(merchant?.pointsRate?.toString() || '10');

  const currentStep = STEPS[stepIndex];
  const TOTAL_STEPS = STEPS.length - 1; // exclude 'done' from count indicator

  // â”€â”€ Navigation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const goNext = useCallback(() => {
    if (rewardTimerRef.current) { clearTimeout(rewardTimerRef.current); rewardTimerRef.current = null; }
    setDirection('enter');
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection('exit');
    setStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleFinish = useCallback(async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  }, [completeOnboarding, router]);

  // â”€â”€ Logo upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pickAndUploadLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;
      setUploadingLogo(true);

      const asset = result.assets[0];
      const formData = new FormData();
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      formData.append('file', {
        uri: asset.uri,
        name: `logo.${ext}`,
        type: asset.mimeType ?? `image/${ext}`,
      } as any);

      const res = await api.post('/merchant/upload-image?type=logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setLogoUri(res.data.url);
      updateMerchant({ logoUrl: res.data.url });
    } catch (err) {
      Alert.alert(t('common.error'), t('onboarding.logoError'));
    } finally {
      setUploadingLogo(false);
    }
  };

  // â”€â”€ Save loyalty type to backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleLoyaltyTypeChange = (type: 'POINTS' | 'STAMPS') => {
    setLoyaltyType(type);
    setRewardName('');
    setRewardCost('');
  };

  // â”€â”€ Reward creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleCreateReward = async () => {
    if (!rewardName.trim()) {
      Alert.alert(t('common.error'), t('onboarding.rewardNameRequired'));
      return;
    }
    const costNum = parseInt(rewardCost, 10);
    if (!rewardCost || isNaN(costNum) || costNum < 1) {
      Alert.alert(t('common.error'), isStamps ? t('onboarding.rewardStampsRequired') : t('onboarding.rewardCostRequired'));
      return;
    }
    setCreatingReward(true);
    try {
      const limitVal = parseInt(accumulationLimit, 10);
      const rateVal = parseFloat(pointsRate);
      await api.patch('/merchant/loyalty-settings', {
        loyaltyType,
        stampEarningMode: isStamps ? stampEarningMode : undefined,
        pointsRate: !isNaN(rateVal) && rateVal > 0 ? rateVal : 10,
        accumulationLimit: hasAccumulationLimit && !isNaN(limitVal) && limitVal >= 1 ? limitVal : null,
      });
      await api.post('/rewards', {
        titre: rewardName.trim(),
        cout: costNum,
        description: rewardDesc.trim() || undefined,
      });
      updateMerchant({
        loyaltyType,
        pointsRate: !isNaN(rateVal) && rateVal > 0 ? rateVal : 10,
        stampEarningMode: isStamps ? stampEarningMode : undefined,
      });
      setRewardCreated(true);
      rewardTimerRef.current = setTimeout(() => goNext(), 900);
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('onboarding.rewardError')));
    } finally {
      setCreatingReward(false);
    }
  };

  // â”€â”€ If team member, skip onboarding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // (team members don't configure the merchant profile)
  React.useEffect(() => {
    if (isTeamMember) {
      completeOnboarding().then(() => router.replace('/(tabs)'));
    }
  }, [isTeamMember]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  Render steps
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {/* â”€â”€ Header gradient â”€â”€ */}
      <LinearGradient
        colors={brandGradientFull}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerGradient, { paddingTop: insets.top + 8 }]}
      >
        {/* Skip button â€” top right */}
        {currentStep !== 'done' && (
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => {
              Alert.alert(
                t('onboarding.skipConfirmTitle') || 'Passer la configuration ?',
                t('onboarding.skipConfirmMsg') || 'Vous pourrez configurer tout cela plus tard depuis les r\u00e9glages.',
                [
                  { text: t('common.cancel') || 'Annuler', style: 'cancel' },
                  { text: t('onboarding.skipDontShow') || 'Ne plus afficher', onPress: handleFinish },
                ],
              );
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        )}

        {/* Step label */}
        {currentStep !== 'welcome' && currentStep !== 'done' && (
          <Text style={styles.stepLabel}>
            {t('onboarding.stepOf', { current: stepIndex, total: TOTAL_STEPS - 1 })}
          </Text>
        )}

        {/* Progress dots */}
        {currentStep !== 'done' && (
          <ProgressDots
            current={stepIndex}
            total={TOTAL_STEPS}
            theme={theme}
          />
        )}
      </LinearGradient>

      {/* â”€â”€ Steps content â”€â”€ */}
      <View style={styles.stepsContainer}>
        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ STEP 0: WELCOME â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <StepSlide visible={currentStep === 'welcome'} direction={direction}>
          <ScrollView
            contentContainerStyle={[styles.stepScroll, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Logo / Icon */}
            <View style={styles.welcomeIconWrap}>
              <LinearGradient
                colors={brandGradient}
                style={styles.welcomeIconBg}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Sparkles color={palette.white} size={44} strokeWidth={1.5} />
              </LinearGradient>
            </View>

            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {t('onboarding.welcomeTitle')}
            </Text>
            <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
              {t('onboarding.welcomeSubtitle')}
            </Text>

            <View style={styles.featuresWrap}>
              <FeatureRow
                icon={<Users color={'#6B7280'} size={22} strokeWidth={1.5} />}
                title={t('onboarding.welcomeFeature1Title')}
                desc={t('onboarding.welcomeFeature1Desc')}
                theme={theme}
              />
              <FeatureRow
                icon={<QrCode color={'#6B7280'} size={22} strokeWidth={1.5} />}
                title={t('onboarding.welcomeFeature2Title')}
                desc={t('onboarding.welcomeFeature2Desc')}
                theme={theme}
              />
              <FeatureRow
                icon={<BarChart3 color={'#6B7280'} size={22} strokeWidth={1.5} />}
                title={t('onboarding.welcomeFeature3Title')}
                desc={t('onboarding.welcomeFeature3Desc')}
                theme={theme}
              />
            </View>
          </ScrollView>
        </StepSlide>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ STEP 1: LOGO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <StepSlide visible={currentStep === 'logo'} direction={direction}>
          <ScrollView
            contentContainerStyle={[styles.stepScroll, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.welcomeIconWrap}>
              <LinearGradient
                colors={[palette.violet, palette.violetLight]}
                style={styles.welcomeIconBg}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Camera color={palette.white} size={44} strokeWidth={1.5} />
              </LinearGradient>
            </View>

            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {t('onboarding.logoTitle')}
            </Text>
            <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
              {t('onboarding.logoSubtitle')}
            </Text>

            {/* Logo preview / upload zone */}
            <TouchableOpacity
              style={[
                styles.logoZone,
                {
                  borderColor: logoUri ? palette.violet : theme.borderLight,
                  backgroundColor: logoUri ? 'transparent' : theme.bgCard,
                },
              ]}
              onPress={!uploadingLogo ? pickAndUploadLogo : undefined}
              activeOpacity={0.8}
            >
              {uploadingLogo ? (
                <View style={styles.logoPlaceholder}>
                  <ActivityIndicator color={palette.violet} size="large" />
                  <Text style={[styles.uploadingText, { color: theme.textMuted }]}>
                    {t('onboarding.logoUploading')}
                  </Text>
                </View>
              ) : logoUri ? (
                <View style={styles.logoPreviewWrap}>
                  <Image
                    source={{
                      uri: logoUri.startsWith('http')
                        ? logoUri
                        : `${getServerBaseUrl()}${logoUri}`,
                    }}
                    style={styles.logoPreview}
                    resizeMode="cover"
                  />
                  <View style={[styles.logoChangeBadge, { backgroundColor: palette.violet }]}>
                    <Camera color={palette.white} size={14} strokeWidth={1.5} />
                  </View>
                </View>
              ) : (
                <View style={styles.logoPlaceholder}>
                  <View style={[styles.uploadIconCircle, { backgroundColor: palette.violet + '15' }]}>
                    <Upload color={palette.violet} size={32} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.uploadBtnText, { color: palette.violet }]}>
                    {t('onboarding.logoUploadBtn')}
                  </Text>
                  <Text style={[styles.uploadHint, { color: theme.textMuted }]}>
                    JPG, PNG â€” max 5 MB
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {logoUri && !uploadingLogo && (
              <TouchableOpacity onPress={pickAndUploadLogo} style={styles.changeLogoBtn}>
                <Text style={[styles.changeLogoBtnText, { color: palette.violet }]}>
                  {t('onboarding.logoChangeBtn')}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.skipHint, { color: theme.textMuted }]}>
              {t('onboarding.logoSkipHint')}
            </Text>
          </ScrollView>
        </StepSlide>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ STEP 2: REWARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <StepSlide visible={currentStep === 'reward'} direction={direction}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              contentContainerStyle={[styles.stepScroll, { paddingBottom: insets.bottom + 100 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.welcomeIconWrap}>
                <LinearGradient
                  colors={[palette.violet, palette.charbonDark]}
                  style={styles.welcomeIconBg}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Gift color={palette.white} size={44} strokeWidth={1.5} />
                </LinearGradient>
              </View>

              <Text style={[styles.stepTitle, { color: theme.text }]}>
                {t('onboarding.rewardTitle')}
              </Text>
              <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
                {t('onboarding.rewardSubtitle')}
              </Text>

              {/* Loyalty type toggle */}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center', marginBottom: 10 }]}>
                {t('onboarding.loyaltyTypeLabel')}
              </Text>
              <View style={styles.loyaltyToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.loyaltyToggleBtn,
                    {
                      backgroundColor: isStamps ? theme.bgCard : palette.violet + '18',
                      borderColor: isStamps ? theme.borderLight : palette.violet,
                    },
                  ]}
                  onPress={() => handleLoyaltyTypeChange('POINTS')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.loyaltyToggleIcon, { backgroundColor: !isStamps ? palette.violet + '20' : theme.borderLight + '60' }]}>
                    <Coins color={!isStamps ? palette.violet : theme.textMuted} size={22} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.loyaltyToggleLabel, { color: !isStamps ? palette.violet : theme.textSecondary }]}>
                    {t('onboarding.loyaltyPoints')}
                  </Text>
                  <Text style={[styles.loyaltyToggleDesc, { color: theme.textMuted }]}>
                    {t('onboarding.loyaltyPointsDesc')}
                  </Text>
                  {!isStamps && (
                    <View style={[styles.loyaltyToggleCheck, { backgroundColor: palette.violet }]}>
                      <Check color={palette.white} size={12} strokeWidth={1.5} />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.loyaltyToggleBtn,
                    {
                      backgroundColor: !isStamps ? theme.bgCard : palette.violet + '18',
                      borderColor: !isStamps ? theme.borderLight : palette.violet,
                    },
                  ]}
                  onPress={() => handleLoyaltyTypeChange('STAMPS')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.loyaltyToggleIcon, { backgroundColor: isStamps ? palette.violet + '20' : theme.borderLight + '60' }]}>
                    <Stamp color={isStamps ? palette.violet : theme.textMuted} size={22} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.loyaltyToggleLabel, { color: isStamps ? palette.violet : theme.textSecondary }]}>
                    {t('onboarding.loyaltyStamps')}
                  </Text>
                  <Text style={[styles.loyaltyToggleDesc, { color: theme.textMuted }]}>
                    {t('onboarding.loyaltyStampsDesc')}
                  </Text>
                  {isStamps && (
                    <View style={[styles.loyaltyToggleCheck, { backgroundColor: palette.violet }]}>
                      <Check color={palette.white} size={12} strokeWidth={1.5} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Stamp earning mode toggle (only for STAMPS) */}
              {isStamps && (
                <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, marginTop: 12, marginBottom: 4 }]}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center', marginBottom: 8 }]}>
                    {t('onboarding.stampEarningModeLabel')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[
                        styles.loyaltyToggleBtn,
                        {
                          flex: 1,
                          backgroundColor: stampEarningMode === 'PER_VISIT' ? palette.violet + '18' : theme.bgCard,
                          borderColor: stampEarningMode === 'PER_VISIT' ? palette.violet : theme.borderLight,
                        },
                      ]}
                      onPress={() => setStampEarningMode('PER_VISIT')}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.loyaltyToggleIcon, { backgroundColor: stampEarningMode === 'PER_VISIT' ? palette.violet + '20' : theme.borderLight + '60' }]}>
                        <Footprints color={stampEarningMode === 'PER_VISIT' ? palette.violet : theme.textMuted} size={20} strokeWidth={1.5} />
                      </View>
                      <Text style={[styles.loyaltyToggleLabel, { color: stampEarningMode === 'PER_VISIT' ? palette.violet : theme.textSecondary, fontSize: 13 }]}>
                        {t('onboarding.stampPerVisit')}
                      </Text>
                      <Text style={[styles.loyaltyToggleDesc, { color: theme.textMuted, fontSize: 11 }]}>
                        {t('onboarding.stampPerVisitDesc')}
                      </Text>
                      {stampEarningMode === 'PER_VISIT' && (
                        <View style={[styles.loyaltyToggleCheck, { backgroundColor: palette.violet }]}>
                          <Check color={palette.white} size={10} strokeWidth={1.5} />
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.loyaltyToggleBtn,
                        {
                          flex: 1,
                          backgroundColor: stampEarningMode === 'PER_AMOUNT' ? palette.violet + '18' : theme.bgCard,
                          borderColor: stampEarningMode === 'PER_AMOUNT' ? palette.violet : theme.borderLight,
                        },
                      ]}
                      onPress={() => setStampEarningMode('PER_AMOUNT')}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.loyaltyToggleIcon, { backgroundColor: stampEarningMode === 'PER_AMOUNT' ? palette.violet + '20' : theme.borderLight + '60' }]}>
                        <Hash color={stampEarningMode === 'PER_AMOUNT' ? palette.violet : theme.textMuted} size={20} strokeWidth={1.5} />
                      </View>
                      <Text style={[styles.loyaltyToggleLabel, { color: stampEarningMode === 'PER_AMOUNT' ? palette.violet : theme.textSecondary, fontSize: 13 }]}>
                        {t('onboarding.stampPerAmount')}
                      </Text>
                      <Text style={[styles.loyaltyToggleDesc, { color: theme.textMuted, fontSize: 11 }]}>
                        {t('onboarding.stampPerAmountDesc')}
                      </Text>
                      {stampEarningMode === 'PER_AMOUNT' && (
                        <View style={[styles.loyaltyToggleCheck, { backgroundColor: palette.violet }]}>
                          <Check color={palette.white} size={10} strokeWidth={1.5} />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Conversion rate card — visible for POINTS, or STAMPS + PER_AMOUNT */}
              {(!isStamps || stampEarningMode === 'PER_AMOUNT') && (
                <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, marginBottom: 16 }]}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center', marginBottom: 4 }]}>
                    {t('onboarding.conversionRateLabel')}
                  </Text>
                  <Text style={[styles.limitHint, { color: theme.textMuted, textAlign: 'center' }]}>
                    {isStamps
                      ? t('onboarding.conversionRateHintStamps')
                      : t('onboarding.conversionRateHintPoints')}
                  </Text>

                  {/* Visual: [  X  ] DH = 1 point/tampon */}
                  <View style={styles.conversionRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.conversionInput,
                        { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder },
                      ]}
                      value={pointsRate}
                      onChangeText={setPointsRate}
                      keyboardType="decimal-pad"
                      maxLength={6}
                      placeholder="10"
                      placeholderTextColor={theme.textMuted}
                    />
                    <Text style={[styles.conversionEqual, { color: theme.textSecondary }]}>
                      {DEFAULT_CURRENCY.symbol} = 1 {isStamps ? t('common.stamp') : t('common.point')}
                    </Text>
                  </View>

                  <Text style={[styles.limitHint, { color: palette.violet, textAlign: 'center', marginTop: 6 }]}>
                    {isStamps
                      ? t('onboarding.conversionRatePreviewStamps', { rate: pointsRate || '10', currency: DEFAULT_CURRENCY.symbol })
                      : t('onboarding.conversionRatePreviewPoints', { rate: pointsRate || '10', currency: DEFAULT_CURRENCY.symbol })}
                  </Text>
                </View>
              )}

              {/* Suggestion chips */}
              <View style={styles.suggestionsRow}>
                {(isStamps
                  ? ['☕ Café offert', '🍕 Pizza gratuite', '🎁 Dessert offert']
                  : ['☕ Café gratuit', '🎁 -10% remise', '🍕 Livraison offerte']
                ).map((sugg) => (
                  <TouchableOpacity
                    key={sugg}
                    style={[styles.suggestionChip, { borderColor: theme.borderLight, backgroundColor: theme.bgCard }]}
                    onPress={() => setRewardName(sugg.replace(/^[\u{1F300}-\u{1F9FF}] /u, ''))}
                  >
                    <Text style={[styles.suggestionText, { color: theme.textSecondary }]}>{sugg}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Form */}
              <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                {/* Name */}
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {t('onboarding.rewardNameLabel')} *
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder },
                  ]}
                  placeholder={t('onboarding.rewardNamePlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  value={rewardName}
                  onChangeText={setRewardName}
                  maxLength={80}
                />

                {/* Cost */}
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {isStamps ? t('onboarding.rewardStampsLabel') : t('onboarding.rewardCostLabel')} *
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder },
                  ]}
                  placeholder={
                    isStamps ? t('onboarding.rewardStampsPlaceholder') : t('onboarding.rewardCostPlaceholder')
                  }
                  placeholderTextColor={theme.textMuted}
                  value={rewardCost}
                  onChangeText={setRewardCost}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                {/* Description */}
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {t('onboarding.rewardDescLabel')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputMultiline,
                    { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.inputBorder },
                  ]}
                  placeholder={t('onboarding.rewardDescPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  value={rewardDesc}
                  onChangeText={setRewardDesc}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={200}
                />
              </View>

              {/* Accumulation limit option */}
              <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, marginBottom: 16 }]}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {t('onboarding.accumulationLimitLabel')}
                </Text>
                <Text style={[styles.limitHint, { color: theme.textMuted }]}>
                  {t('onboarding.accumulationLimitHint', { unit: isStamps ? t('common.stamps') : t('common.points') })}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.limitToggle,
                    {
                      backgroundColor: hasAccumulationLimit ? palette.violet + '15' : theme.bgCard,
                      borderColor: hasAccumulationLimit ? palette.violet : theme.borderLight,
                    },
                  ]}
                  onPress={() => {
                    setHasAccumulationLimit(!hasAccumulationLimit);
                    if (hasAccumulationLimit) setAccumulationLimit('');
                  }}
                  activeOpacity={0.8}
                >
                  <ShieldCheck
                    size={20}
                    color={hasAccumulationLimit ? palette.violet : theme.textMuted}
                    strokeWidth={1.5}
                  />
                  <Text
                    style={[
                      styles.limitToggleText,
                      { color: hasAccumulationLimit ? palette.violet : theme.textMuted },
                    ]}
                  >
                    {hasAccumulationLimit
                      ? t('settingsPage.limitEnabled')
                      : t('settingsPage.limitDisabled')}
                  </Text>
                </TouchableOpacity>

                {hasAccumulationLimit && (
                  <View style={[styles.limitInputRow, { marginTop: 10 }]}>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: theme.text,
                          backgroundColor: theme.bgInput,
                          borderColor: theme.inputBorder,
                        },
                      ]}
                      value={accumulationLimit}
                      onChangeText={setAccumulationLimit}
                      keyboardType="number-pad"
                      placeholder={t('settingsPage.limitPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                    />
                    <Text style={[styles.limitSuffix, { color: theme.textSecondary }]}>
                      {isStamps ? t('common.stamps') : t('common.points')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Create button */}
              <TouchableOpacity
                style={[
                  styles.createRewardBtn,
                  { opacity: creatingReward ? 0.7 : 1 },
                ]}
                onPress={handleCreateReward}
                disabled={creatingReward || rewardCreated}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={rewardCreated ? [palette.violet, palette.violetDark] : brandGradient}
                  style={styles.createRewardGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {creatingReward ? (
                    <ActivityIndicator color={palette.white} size="small" />
                  ) : rewardCreated ? (
                    <>
                      <Check color={palette.white} size={20} strokeWidth={1.5} />
                      <Text style={styles.createRewardText}>{t('onboarding.rewardCreated')}</Text>
                    </>
                  ) : (
                    <>
                      <Gift color={palette.white} size={20} strokeWidth={1.5} />
                      <Text style={styles.createRewardText}>{t('onboarding.rewardCreateBtn')}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={[styles.skipHint, { color: theme.textMuted }]}>
                {t('onboarding.rewardSkipHint')}
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </StepSlide>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ STEP 3: FIRST SCAN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <StepSlide visible={currentStep === 'scan'} direction={direction}>
          <ScrollView
            contentContainerStyle={[styles.stepScroll, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.welcomeIconWrap}>
              <LinearGradient
                colors={[palette.violet, palette.charbonDark]}
                style={styles.welcomeIconBg}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <QrCode color={palette.white} size={44} strokeWidth={1.5} />
              </LinearGradient>
            </View>

            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {t('onboarding.scanTitle')}
            </Text>
            <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
              {t('onboarding.scanSubtitle')}
            </Text>

            {/* How it works card */}
            <View style={[styles.howCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              <Text style={[styles.howTitle, { color: theme.text }]}>
                {t('onboarding.scanHowTitle')}
              </Text>
              <CheckItem num={1} text={t('onboarding.scanStep1')} theme={theme} />
              <CheckItem num={2} text={t('onboarding.scanStep2')} theme={theme} />
              <CheckItem num={3} text={t('onboarding.scanStep3')} theme={theme} />
            </View>

            {/* Scanner illustration */}
            <View style={[styles.scanIllustration, { borderColor: '#6B7280' + '40' }]}>
              <View style={[styles.scanCorner, styles.scanCornerTL, { borderColor: '#6B7280' }]} />
              <View style={[styles.scanCorner, styles.scanCornerTR, { borderColor: '#6B7280' }]} />
              <View style={[styles.scanCorner, styles.scanCornerBL, { borderColor: '#6B7280' }]} />
              <View style={[styles.scanCorner, styles.scanCornerBR, { borderColor: '#6B7280' }]} />
              <Smartphone color={'#6B7280'} size={56} strokeWidth={1.5} />
            </View>

            {/* Scan now CTA */}
            <TouchableOpacity
              style={styles.scanNowBtn}
              onPress={async () => {
                await completeOnboarding();
                router.replace('/(tabs)');
              }}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[palette.violet, palette.charbonDark]}
                style={styles.scanNowGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <QrCode color={palette.white} size={22} strokeWidth={1.5} />
                <Text style={styles.scanNowText}>{t('onboarding.scanNowBtn')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </StepSlide>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ STEP 4: DONE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <StepSlide visible={currentStep === 'done'} direction={direction}>
          <ScrollView
            contentContainerStyle={[styles.stepScroll, styles.doneScroll, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Confetti / celebration icon */}
            <LinearGradient
              colors={brandGradientFull}
              style={styles.doneBigIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Trophy color={palette.white} size={56} strokeWidth={1.5} />
            </LinearGradient>

            <Text style={[styles.doneTitleText, { color: theme.text }]}>
              {t('onboarding.doneTitle')}
            </Text>
            <Text style={[styles.doneSubtitleText, { color: theme.textMuted }]}>
              {t('onboarding.doneSubtitle')}
            </Text>

            {/* Your merchant name */}
            {merchant?.nom && (
              <View style={[styles.merchantNameBadge, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                {logoUri ? (
                  <Image
                    source={{ uri: logoUri.startsWith('http') ? logoUri : `${getServerBaseUrl()}${logoUri}` }}
                    style={styles.doneMerchantLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.doneMerchantAvatar, { backgroundColor: palette.violet + '20' }]}>
                    <Text style={[styles.doneMerchantInitial, { color: palette.violet }]}>
                      {merchant.nom.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[styles.doneMerchantName, { color: theme.text }]}>{merchant.nom}</Text>
              </View>
            )}

            {/* Completed stats */}
            <View style={styles.statsRow}>
              <StatBadge
                icon={<Check color={palette.violet} size={20} strokeWidth={1.5} />}
                label={t('onboarding.doneStat1')}
                theme={theme}
              />
              <StatBadge
                icon={<Gift color={palette.violet} size={20} strokeWidth={1.5} />}
                label={t('onboarding.doneStat2')}
                theme={theme}
              />
              <StatBadge
                icon={<QrCode color={palette.violet} size={20} strokeWidth={1.5} />}
                label={t('onboarding.doneStat3')}
                theme={theme}
              />
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={handleFinish}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={brandGradient}
                style={styles.doneBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Zap color={palette.white} size={20} strokeWidth={1.5} />
                <Text style={styles.doneBtnText}>{t('onboarding.doneBtn')}</Text>
                <ArrowRight color={palette.white} size={20} strokeWidth={1.5} />
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </StepSlide>
      </View>

      {/* â”€â”€ Bottom action bar â”€â”€ */}
      {currentStep !== 'done' && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: theme.bg,
              borderTopColor: theme.borderLight,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          {/* Back button */}
          {stepIndex > 0 ? (
            <TouchableOpacity style={[styles.backBtn, { borderColor: theme.border }]} onPress={goBack}>
              <ChevronLeft color={theme.textSecondary} size={20} strokeWidth={1.5} />
              <Text style={[styles.backBtnText, { color: theme.textSecondary }]}>
                {t('onboarding.back')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}

          {/* Next / primary action */}
          {currentStep === 'welcome' && (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <LinearGradient
                colors={brandGradient}
                style={styles.nextBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.nextBtnText}>{t('onboarding.welcomeBtn')}</Text>
                <ChevronRight color={palette.white} size={20} strokeWidth={1.5} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {currentStep === 'logo' && (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <LinearGradient
                colors={brandGradient}
                style={styles.nextBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.nextBtnText}>{t('onboarding.next')}</Text>
                <ChevronRight color={palette.white} size={20} strokeWidth={1.5} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {currentStep === 'reward' && (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <LinearGradient
                colors={rewardCreated ? [palette.violet, palette.violetDark] : [palette.gray400, palette.gray500]}
                style={styles.nextBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.nextBtnText}>{t('onboarding.next')}</Text>
                <ChevronRight color={palette.white} size={20} strokeWidth={1.5} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {currentStep === 'scan' && (
            <TouchableOpacity style={styles.nextBtn} onPress={() => { setDirection('enter'); setStepIndex(STEPS.indexOf('done')); }} activeOpacity={0.85}>
              <LinearGradient
                colors={[palette.gray400, palette.gray500]}
                style={styles.nextBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.nextBtnText}>{t('onboarding.scanLaterBtn')}</Text>
                <ChevronRight color={palette.white} size={20} strokeWidth={1.5} />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Styles
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  headerGradient: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
    minHeight: 90,
    justifyContent: 'flex-end',
  },
  skipBtn: {
    position: 'absolute',
    right: 20,
    bottom: 18,
  },
  skipText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontFamily: 'Lexend_400Regular',
  },
  stepLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    marginBottom: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },

  // Steps container
  stepsContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  stepScroll: {
    paddingHorizontal: 24,
    paddingTop: 28,
    alignItems: 'center',
  },
  doneScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Welcome icon
  welcomeIconWrap: {
    marginBottom: 20,
  },
  welcomeIconBg: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  // Title / subtitle
  stepTitle: {
    fontSize: 26,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 10,
  },
  stepSubtitle: {
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 320,
  },

  // Features (welcome)
  featuresWrap: { width: '100%', gap: 12 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureTitle: {
    fontSize: 14,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 18,
  },

  // Logo zone
  logoZone: {
    width: 200,
    height: 200,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoPlaceholder: { alignItems: 'center', gap: 10 },
  uploadIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: {
    fontSize: 15,
    fontFamily: 'Lexend_600SemiBold',
  },
  uploadHint: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
  },
  uploadingText: {
    fontSize: 13,
    fontFamily: 'Lexend_400Regular',
    marginTop: 8,
  },
  logoPreviewWrap: {
    width: 200,
    height: 200,
    position: 'relative',
  },
  logoPreview: {
    width: 200,
    height: 200,
    borderRadius: 22,
  },
  logoChangeBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeLogoBtn: { marginBottom: 8 },
  changeLogoBtnText: {
    fontSize: 14,
    fontFamily: 'Lexend_500Medium',
    textDecorationLine: 'underline',
  },
  skipHint: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },

  // Reward suggestions
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 13,
    fontFamily: 'Lexend_400Regular',
  },

  // Reward form card
  formCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Lexend_500Medium',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
  },
  inputMultiline: {
    minHeight: 72,
    paddingTop: 11,
  },
  createRewardBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  createRewardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  createRewardText: {
    color: palette.white,
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
  },

  // Accumulation limit
  limitHint: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 17,
    marginBottom: 10,
  },
  limitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  limitToggleText: {
    fontSize: 14,
    fontFamily: 'Lexend_500Medium',
  },
  limitInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  limitSuffix: {
    marginLeft: 10,
    fontSize: 13,
    fontFamily: 'Lexend_400Regular',
  },

  // Conversion rate
  conversionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  conversionInput: {
    width: 80,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: 'Lexend_600SemiBold',
    paddingVertical: 10,
  },
  conversionEqual: {
    fontSize: 16,
    fontFamily: 'Lexend_500Medium',
  },

  // Loyalty type toggle
  loyaltyToggleRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 18,
  },
  loyaltyToggleBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  loyaltyToggleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  loyaltyToggleLabel: {
    fontSize: 14,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 2,
  },
  loyaltyToggleDesc: {
    fontSize: 11,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 15,
  },
  loyaltyToggleCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scan step
  howCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  howTitle: {
    fontSize: 15,
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 12,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  checkNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkNumText: {
    fontSize: 13,
    fontFamily: 'Lexend_700Bold',
  },
  checkText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 20,
  },
  scanIllustration: {
    width: 140,
    height: 140,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderWidth: 3,
  },
  scanCornerTL: { top: 6, left: 6, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  scanCornerTR: { top: 6, right: 6, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  scanCornerBL: { bottom: 6, left: 6, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  scanCornerBR: { bottom: 6, right: 6, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanNowBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  scanNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  scanNowText: {
    color: palette.white,
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
  },

  // Done step
  doneBigIcon: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    alignSelf: 'center',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  doneTitleText: {
    fontSize: 28,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  doneSubtitleText: {
    fontSize: 15,
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 300,
  },
  merchantNameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  doneMerchantLogo: { width: 32, height: 32, borderRadius: 8 },
  doneMerchantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneMerchantInitial: {
    fontSize: 16,
    fontFamily: 'Lexend_700Bold',
  },
  doneMerchantName: {
    fontSize: 15,
    fontFamily: 'Lexend_600SemiBold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statBadge: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minWidth: 90,
    gap: 6,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Lexend_500Medium',
    textAlign: 'center',
  },
  doneBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  doneBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    gap: 10,
  },
  doneBtnText: {
    color: palette.white,
    fontSize: 16,
    fontFamily: 'Lexend_700Bold',
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: 'Lexend_500Medium',
  },
  backBtnPlaceholder: { width: 80 },
  nextBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 260,
  },
  nextBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  nextBtnText: {
    color: palette.white,
    fontSize: 15,
    fontFamily: 'Lexend_600SemiBold',
  },
});
