import { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Smartphone, Trash2, Wifi, Clock, User, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { toast } from '@/components/ui/Toast';
import { StateMessage } from '@/components/ui/StateMessage';
import api from '@/services/api';
import { registerPushToken } from '@/contexts/AuthContext';
import { resetMerchantPushTokenCache } from '@/services/merchantPushToken';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { timeAgo } from '@/utils/date';
import { logError } from '@/utils/devLogger';
import { font, icon as iconTokens } from '@/constants/design';

const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 };

interface DeviceSession {
  id: string;
  deviceName: string;
  deviceOS?: string;
  userType?: string;
  userName?: string;
  lastActiveAt: string;
  ipAddress?: string;
  isCurrentDevice: boolean;
}

/** The backend dropped the push token (it may belong to a revoked device): re-register this one. */
export function reRegisterThisDevicePush() {
  resetMerchantPushTokenCache();
  registerPushToken(false).catch(() => {});
}

/**
 * "Appareils" tab of the security screen: the signed-in sessions of the
 * merchant and the team, each removable except the current one. Loads on
 * mount, so the list is fresh every time the tab is opened.
 */
export function SecurityDevices() {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    api.get('/merchant/devices')
      .then((res) => {
        if (cancelled) return;
        setDevices(res.data ?? []);
        setFailed(false);
      })
      .catch((error) => {
        logError('Security', 'Failed to load devices:', error);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [load]);

  const retry = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  const handleRemoveDevice = useCallback((device: DeviceSession) => {
    Alert.alert(
      t('security.disconnectTitle'),
      t('security.disconnectMsg', { name: device.deviceName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('security.disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/merchant/devices/${device.id}`);
              setDevices((prev) => prev.filter((d) => d.id !== device.id));
              reRegisterThisDevicePush();
            } catch {
              toast.error(t('security.disconnectError'));
            }
          },
        },
      ],
    );
  }, [t]);

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (failed) {
    return (
      <StateMessage
        Icon={Smartphone}
        title={t('security.devicesLoadError')}
        hint={t('security.devicesLoadErrorHint')}
        actionLabel={t('common.retry')}
        ActionIcon={RefreshCw}
        onAction={retry}
      />
    );
  }

  if (devices.length === 0) {
    return (
      <View style={styles.emptyDevices}>
        <Smartphone size={48} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
        <Text style={[styles.emptyTitle, { color: theme.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('security.noDevices')}
        </Text>
        <Text style={[styles.emptyText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {t('security.noDevicesHint')}
        </Text>
      </View>
    );
  }

  return (
    <>
      {devices.map((device) => {
        const isTeam = device.userType === 'team_member';
        const userColor = isTeam ? theme.warning : theme.primary;
        return (
          <View
            key={device.id}
            style={[styles.deviceCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
          >
            <View style={[styles.deviceRow, { flexDirection: dir.row }]}>
              <View
                style={[
                  styles.deviceIcon,
                  { backgroundColor: device.isCurrentDevice ? theme.success + '15' : theme.primary + '12' },
                ]}
              >
                <Smartphone
                  size={20}
                  color={device.isCurrentDevice ? theme.success : theme.primary}
                  strokeWidth={iconTokens.stroke}
                />
              </View>
              <View style={[styles.deviceInfo, dir.isRTL ? styles.deviceInfoRTL : styles.deviceInfoLTR]}>
                <View style={[styles.deviceNameRow, { flexDirection: dir.row }]}>
                  <Text style={[styles.deviceName, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {device.deviceName}
                  </Text>
                  {device.isCurrentDevice && (
                    <View style={[styles.currentBadge, { backgroundColor: theme.success + '18' }]}>
                      <Text style={[styles.currentBadgeText, { color: theme.success }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                        {t('security.currentDevice')}
                      </Text>
                    </View>
                  )}
                </View>
                {device.deviceOS ? (
                  <Text style={[styles.deviceOS, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {device.deviceOS}
                  </Text>
                ) : null}
                {device.userName ? (
                  <View style={[styles.deviceMeta, styles.deviceMetaUser, { flexDirection: dir.row }]}>
                    <User size={11} strokeWidth={iconTokens.strokeSmall} color={userColor} />
                    <Text style={[styles.deviceMetaText, { color: userColor, fontFamily: font.semibold }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                      {device.userName}
                    </Text>
                    <View
                      style={[
                        styles.userTypeBadge,
                        dir.isRTL ? styles.userTypeBadgeRTL : styles.userTypeBadgeLTR,
                        { backgroundColor: isTeam ? theme.warning + '18' : theme.primary + '12' },
                      ]}
                    >
                      <Text style={[styles.userTypeBadgeText, { color: userColor }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                        {isTeam ? t('security.teamBadge') : t('security.ownerBadge')}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={[styles.deviceMeta, { flexDirection: dir.row }]}>
                  <Clock size={11} color={theme.textMuted} strokeWidth={iconTokens.strokeSmall} />
                  <Text style={[styles.deviceMetaText, { color: theme.textMuted }]} numberOfLines={1}>
                    {timeAgo(device.lastActiveAt)}
                  </Text>
                  {device.ipAddress ? (
                    <>
                      <Wifi size={11} color={theme.textMuted} strokeWidth={iconTokens.strokeSmall} style={dir.isRTL ? styles.wifiIconRTL : styles.wifiIconLTR} />
                      <Text
                        style={[styles.deviceMetaText, { color: theme.textMuted }]}
                        numberOfLines={1}
                        accessibilityLabel={`IP ${device.ipAddress.split('.').join(' ')}`}
                      >
                        {device.ipAddress}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>

              {!device.isCurrentDevice && (
                <TouchableOpacity
                  onPress={() => handleRemoveDevice(device)}
                  style={[styles.removeBtn, { backgroundColor: theme.danger + '12' }]}
                  hitSlop={HIT_SLOP_8}
                  accessibilityRole="button"
                  accessibilityLabel={t('security.removeDeviceA11y')}
                >
                  <Trash2 size={16} color={theme.danger} strokeWidth={iconTokens.stroke} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  loadingCenter: { alignItems: 'center', paddingTop: 60 },
  emptyDevices: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, marginTop: 16, fontFamily: font.semibold },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 30,
    lineHeight: 20,
    fontFamily: font.regular,
  },

  deviceCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  deviceRow: { alignItems: 'center' },
  deviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: { flex: 1 },
  deviceInfoLTR: { marginLeft: 14 },
  deviceInfoRTL: { marginRight: 14 },
  deviceNameRow: { alignItems: 'center', gap: 8 },
  deviceName: { fontSize: 15, fontFamily: font.semibold },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: { fontSize: 11, fontFamily: font.semibold },
  deviceOS: { fontSize: 12, marginTop: 2, fontFamily: font.regular },
  deviceMeta: { alignItems: 'center', gap: 4, marginTop: 4 },
  deviceMetaUser: { marginTop: 3 },
  deviceMetaText: { fontSize: 11, fontFamily: font.regular },
  wifiIconLTR: { marginLeft: 8 },
  wifiIconRTL: { marginRight: 8 },
  userTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  userTypeBadgeLTR: { marginLeft: 6 },
  userTypeBadgeRTL: { marginRight: 6 },
  userTypeBadgeText: { fontSize: 11, fontFamily: font.semibold },

  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
