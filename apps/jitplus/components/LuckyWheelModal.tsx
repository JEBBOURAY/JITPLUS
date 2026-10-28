import React from 'react';
import {
  View, StyleSheet, Animated, Modal, ScrollView, StatusBar, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms } from '@/utils/responsive';
import WheelStage from './luckyWheel/WheelStage';
import WheelResultSheet from './luckyWheel/WheelResultSheet';
import WheelHistory from './luckyWheel/WheelHistory';
import WheelPrizeList from './luckyWheel/WheelPrizeList';
import CampaignPicker from './luckyWheel/CampaignPicker';
import WheelHeader from './luckyWheel/WheelHeader';
import WheelStatus from './luckyWheel/WheelStatus';
import WheelMerchantRow from './luckyWheel/WheelMerchantRow';
import WheelLegalNotice from './luckyWheel/WheelLegalNotice';
import { useLuckyWheel } from './luckyWheel/useLuckyWheel';

const LOCALE_TAGS: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };
const BG_GRADIENT = ['#24104A', '#150830', '#0B0418'] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default React.memo(function LuckyWheelModal({ visible, onClose }: Props) {
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const localeTag = LOCALE_TAGS[locale] ?? 'fr-FR';

  const {
    isLoading, isError, refetch, historyData, historyLoading, phase, spinning, result, groups,
    ticket, campaign, lockedCampaign, pendingCount, segments, pointerKick, entrance, contentFade,
    spinRotation, contentTranslate, canSpin, spinsLeft, setSelectedCampaignId, handleClose,
    dismissResult, handleSpin, handleReplay, handleViewPrizes, handleRequestClose, openRules,
    showWheel, showHistory,
  } = useLuckyWheel(visible, onClose);

  const wheelSize = Math.round(Math.min(wp(300), screenW - ms(72), screenH * 0.4));
  const merchantName = campaign?.merchant?.nom || campaign?.name || '';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleRequestClose}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={BG_GRADIENT} style={styles.root}>
        <WheelHeader
          phase={phase}
          spinning={spinning}
          pendingCount={pendingCount}
          isRTL={isRTL}
          topInset={insets.top}
          fonts={fonts}
          t={t}
          onClose={handleClose}
          onBack={showWheel}
          onOpenHistory={showHistory}
        />

        <Animated.View style={[styles.body, { opacity: contentFade, transform: [{ translateY: contentTranslate }] }]}>
          {phase === 'history' ? (
            <WheelHistory
              draws={historyData}
              loading={historyLoading}
              localeTag={localeTag}
              bottomInset={insets.bottom}
              fonts={fonts}
              t={t}
            />
          ) : (
            <ScrollView
              style={styles.body}
              contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + hp(28) }]}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!spinning}
            >
              {groups.length > 1 && (
                <CampaignPicker
                  groups={groups}
                  selectedId={campaign?.id}
                  disabled={spinning || !!result}
                  fonts={fonts}
                  t={t}
                  onSelect={setSelectedCampaignId}
                />
              )}

              {campaign && (
                <WheelMerchantRow
                  logoUrl={campaign.merchant?.logoUrl}
                  merchantName={merchantName}
                  campaignName={campaign.name}
                  fonts={fonts}
                />
              )}

              <View style={styles.stage}>
                <WheelStage
                  size={wheelSize}
                  segments={segments}
                  rotation={spinRotation}
                  pointerKick={pointerKick}
                  entrance={entrance}
                  spinning={spinning}
                  dimmed={!campaign}
                  onPress={canSpin ? handleSpin : undefined}
                  accessibilityLabel={t('luckyWheel.spinCta')}
                />
              </View>

              <WheelStatus
                isLoading={isLoading}
                isError={isError}
                hasCampaign={!!campaign}
                hasPlayable={!!ticket || !!lockedCampaign}
                pendingCount={pendingCount}
                spinning={spinning}
                spinsLeft={spinsLeft}
                canSpin={canSpin}
                fonts={fonts}
                t={t}
                onRetry={refetch}
                onOpenHistory={showHistory}
                onSpin={handleSpin}
              />

              {campaign && campaign.prizes?.length > 0 && (
                <View style={styles.section}>
                  <WheelPrizeList prizes={campaign.prizes} globalWinRate={campaign.globalWinRate ?? 0} fonts={fonts} t={t} />
                </View>
              )}

              <WheelLegalNotice fonts={fonts} t={t} onOpenRules={openRules} />
            </ScrollView>
          )}
        </Animated.View>

        {result && (
          <WheelResultSheet
            result={result.data}
            merchantName={result.merchantName}
            remainingTickets={result.remaining}
            localeTag={localeTag}
            bottomInset={insets.bottom}
            theme={theme}
            fonts={fonts}
            t={t}
            onReplay={handleReplay}
            onClose={handleClose}
            onViewPrizes={handleViewPrizes}
            onDismiss={dismissResult}
          />
        )}
      </LinearGradient>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  scroll: { alignItems: 'center', paddingTop: hp(8) },
  stage: { marginTop: hp(14), marginBottom: hp(6), alignItems: 'center' },
  section: { alignSelf: 'stretch', paddingHorizontal: wp(20), marginTop: hp(22) },
});
