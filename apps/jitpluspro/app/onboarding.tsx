import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, brandGradient, brandGradientFull, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import {
  StepSlide,
  ProgressDots,
  StepWelcome,
  StepLogo,
  StepReward,
  StepScan,
  StepDone,
} from '@/components/onboarding';

// â”€â”€ Step IDs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STEPS = ['welcome', 'logo', 'reward', 'scan', 'done'] as const;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Main onboarding screen
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function OnboardingScreen() {
  const { merchant, updateMerchant, completeOnboarding, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'enter' | 'exit'>('enter');

  // â”€â”€ Step 2: Logo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [logoUri, setLogoUri] = useState<string | null>(merchant?.logoUrl ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // â”€â”€ Step 3: Reward â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const TOTAL_STEPS = STEPS.length - 1;

  // â”€â”€ Navigation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    router.replace('/scan-qr');
  }, [completeOnboarding, router]);

  // â”€â”€ Logo upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Save loyalty type to backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleLoyaltyTypeChange = (type: 'POINTS' | 'STAMPS') => {
    setLoyaltyType(type);
    setRewardName('');
    setRewardCost('');
  };

  // â”€â”€ Reward creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ If team member, skip onboarding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  React.useEffect(() => {
    if (isTeamMember) {
      completeOnboarding().then(() => router.replace('/scan-qr'));
    }
  }, [isTeamMember]);

  const bottomPadding = insets.bottom + 100;

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  Render
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {/* â”€â”€ Header gradient â”€â”€ */}
      <LinearGradient
        colors={brandGradientFull}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerGradient, { paddingTop: insets.top + 8 }]}
      >
        {currentStep !== 'done' && (
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => {
              Alert.alert(
                t('onboarding.skipConfirmTitle'),
                t('onboarding.skipConfirmMsg'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('onboarding.skipDontShow'), onPress: handleFinish },
                ],
              );
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        )}

        {currentStep !== 'welcome' && currentStep !== 'done' && (
          <Text style={styles.stepLabel}>
            {t('onboarding.stepOf', { current: stepIndex, total: TOTAL_STEPS - 1 })}
          </Text>
        )}

        {currentStep !== 'done' && (
          <ProgressDots current={stepIndex} total={TOTAL_STEPS} theme={theme} />
        )}
      </LinearGradient>

      {/* â”€â”€ Steps content â”€â”€ */}
      <View style={styles.stepsContainer}>
        <StepSlide visible={currentStep === 'welcome'} direction={direction}>
          <StepWelcome theme={theme} t={t} bottomPadding={bottomPadding} />
        </StepSlide>

        <StepSlide visible={currentStep === 'logo'} direction={direction}>
          <StepLogo
            theme={theme} t={t} bottomPadding={bottomPadding}
            logoUri={logoUri} uploadingLogo={uploadingLogo}
            onPickLogo={pickAndUploadLogo}
          />
        </StepSlide>

        <StepSlide visible={currentStep === 'reward'} direction={direction}>
          <StepReward
            theme={theme} t={t} bottomPadding={bottomPadding}
            loyaltyType={loyaltyType} isStamps={isStamps}
            stampEarningMode={stampEarningMode} setStampEarningMode={setStampEarningMode}
            rewardName={rewardName} setRewardName={setRewardName}
            rewardCost={rewardCost} setRewardCost={setRewardCost}
            rewardDesc={rewardDesc} setRewardDesc={setRewardDesc}
            pointsRate={pointsRate} setPointsRate={setPointsRate}
            hasAccumulationLimit={hasAccumulationLimit} setHasAccumulationLimit={setHasAccumulationLimit}
            accumulationLimit={accumulationLimit} setAccumulationLimit={setAccumulationLimit}
            creatingReward={creatingReward} rewardCreated={rewardCreated}
            onCreateReward={handleCreateReward} onLoyaltyTypeChange={handleLoyaltyTypeChange}
          />
        </StepSlide>

        <StepSlide visible={currentStep === 'scan'} direction={direction}>
          <StepScan
            theme={theme} t={t} bottomPadding={bottomPadding}
            onScanNow={async () => { await completeOnboarding(); router.replace('/scan-qr'); }}
          />
        </StepSlide>

        <StepSlide visible={currentStep === 'done'} direction={direction}>
          <StepDone
            theme={theme} t={t} bottomPadding={insets.bottom + 40}
            merchant={merchant} logoUri={logoUri} onFinish={handleFinish}
          />
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

          {currentStep === 'welcome' && (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <LinearGradient colors={brandGradient} style={styles.nextBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.nextBtnText}>{t('onboarding.welcomeBtn')}</Text>
                <ChevronRight color={palette.white} size={20} strokeWidth={1.5} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {currentStep === 'logo' && (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <LinearGradient colors={brandGradient} style={styles.nextBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.nextBtnText}>{t('onboarding.next')}</Text>
                <ChevronRight color={palette.white} size={20} strokeWidth={1.5} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {currentStep === 'reward' && (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <LinearGradient
                colors={rewardCreated ? [palette.violet, palette.violetDark] : [palette.gray400, palette.gray500]}
                style={styles.nextBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
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
                style={styles.nextBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Styles
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const styles = StyleSheet.create({
  root: { flex: 1 },
  headerGradient: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
    minHeight: 90,
    justifyContent: 'flex-end',
  },
  skipBtn: { position: 'absolute', right: 20, bottom: 18 },
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
  stepsContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
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
  backBtnText: { fontSize: 14, fontFamily: 'Lexend_500Medium' },
  backBtnPlaceholder: { width: 80 },
  nextBtn: { flex: 1, borderRadius: 12, overflow: 'hidden', maxWidth: 260 },
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

