import React from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import { CheckCircle } from 'lucide-react-native';

// lottie-react-native is NOT available in Expo Go SDK 51+
let LottieView: typeof import('lottie-react-native').default | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {
  // Not available in Expo Go
}

interface Props {
  visible: boolean;
  theme: Record<string, any>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  transactionType: 'EARN_POINTS' | 'REDEEM_REWARD';
  isStampsMode: boolean;
  stamps: number;
  points: number;
}

export function TransactionSuccessModal({
  visible,
  theme,
  t,
  transactionType,
  isStampsMode,
  stamps,
  points,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.bgCard }]}>
          {LottieView ? (
            <LottieView
              source={require('@/assets/animations/success.json')}
              autoPlay
              loop={false}
              style={styles.animation}
            />
          ) : (
            <View style={[styles.animation, { alignItems: 'center', justifyContent: 'center' }]}>
              <CheckCircle size={64} color={theme.success} />
            </View>
          )}
          <Text style={[styles.title, { color: theme.success }]}>
            {transactionType === 'EARN_POINTS'
              ? isStampsMode
                ? t('transactionAmount.stampsAdded')
                : t('transactionAmount.transactionValidated')
              : t('transactionAmount.giftOfferedSuccess')}
          </Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            {transactionType === 'EARN_POINTS'
              ? isStampsMode
                ? t('transactionAmount.stampsAddedMsg', { count: stamps })
                : t('transactionAmount.pointsAddedMsg', { count: points })
              : t('transactionAmount.rewardOfferedMsg')}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '80%',
    maxWidth: 340,
  },
  animation: { width: 120, height: 120 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  message: { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
