import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Alert, Modal, Share, TouchableOpacity, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, FileText, Link2, Printer, QrCode, Share2, X } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import {
  useRevokeStampCode, useRevokeStampCodeBatch, useStampCodeBatch, type StampCodeItem,
} from '@/hooks/queries/stampCodes';
import { getIntlLocale } from '@/config/currency';
import { getErrorMessage } from '@/utils/error';
import { logWarn } from '@/utils/devLogger';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, Notice, ScreenHeader, Section, StatusPill } from '@/components/scratch/ScratchUI';
import { ListSeparator } from '@/components/games/GameList';
import StampCodeLabel from '@/components/stampCodes/StampCodeLabel';
import { isPrintCancelled, printStampCodeSheet, shareStampCodeSheet } from '@/components/stampCodes/printStampCodeSheet';

type Selected = { code: StampCodeItem; n: number };

export default function StampCodeBatchScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { money } = useMoney();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const merchant = useAuthStore((s) => s.merchant);
  const canManage = !isTeamMember;
  /** Sheet being prepared: printed directly or shared as a PDF file */
  const [sheetBusy, setSheetBusy] = useState<'print' | 'share' | null>(null);

  const { data: batch, isLoading, isError, refetch, isRefetching } = useStampCodeBatch(typeof id === 'string' ? id : undefined);
  const revokeBatch = useRevokeStampCodeBatch();
  const [selected, setSelected] = useState<Selected | null>(null);

  const intlLocale = getIntlLocale(locale);
  const formatDate = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(intlLocale, { day: 'numeric', month: 'short', year: 'numeric' }),
    [intlLocale],
  );
  /** Usable codes with their number in the batch (same numbering as the list). */
  const printable = useMemo(
    () => (batch?.codes ?? []).flatMap((c, i) => (c.url ? [{ url: c.url, n: i + 1 }] : [])),
    [batch?.codes],
  );

  const exportSheet = useCallback(async (mode: 'print' | 'share') => {
    if (!batch || sheetBusy || printable.length === 0) return;
    setSheetBusy(mode);
    const input = {
      codes: printable,
      stamps: batch.stamps,
      merchantName: merchant?.nom ?? '',
      logoUrl: merchant?.logoUrl,
      brandColor: merchant?.themeColor,
      t,
      locale,
      isRTL,
    };
    try {
      if (mode === 'print') {
        await printStampCodeSheet(input);
      } else if (!(await shareStampCodeSheet(input, batch.label))) {
        Alert.alert(t('common.error'), t('stampCodes.qr.shareUnavailable'));
      }
    } catch (e) {
      if (!isPrintCancelled(e)) {
        const detail = e instanceof Error ? e.message : String(e);
        logWarn('StampCodeSheet', `${mode} failed: ${detail}`);
        // In development (Expo Go), show the cause so a failure can be diagnosed from the device.
        Alert.alert(t('common.error'), t('stampCodes.detail.printError') + (__DEV__ ? `\n\n${detail}` : ''));
      }
    } finally {
      setSheetBusy(null);
    }
  }, [batch, sheetBusy, printable, merchant, t, locale, isRTL]);

  const shareLinks = useCallback(() => {
    if (!batch || printable.length === 0) return;
    const message = [t('stampCodes.detail.shareLinksMessage', { label: batch.label }), ...printable.map((c) => c.url)].join('\n');
    Share.share({ message }).catch(() => {});
  }, [printable, batch, t]);

  const confirmRevokeBatch = useCallback(() => {
    if (!batch) return;
    Alert.alert(t('stampCodes.detail.revokeAll'), t('stampCodes.detail.revokeAllConfirm', { count: batch.active }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeBatch.mutateAsync(batch.batchId);
            Alert.alert(t('stampCodes.detail.revoked'));
          } catch (e) {
            Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
          }
        },
      },
    ]);
  }, [batch, revokeBatch, t]);

  const renderItem = useCallback(({ item, index }: { item: StampCodeItem; index: number }) => (
    <CodeRow code={item} n={index + 1} formatDate={formatDate} onOpen={setSelected} />
  ), [formatDate]);

  if (shouldWait) return null;

  const header = batch ? (
    <View style={styles.headerContent}>
      <Section>
        <Text style={[styles.value, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
          {t(pluralKey('stampCodes.detail.value', batch.stamps, locale), { count: batch.stamps })}
        </Text>
        {batch.amount > 0 && (
          <Text style={[styles.meta, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('stampCodes.detail.orderAmount', { amount: money(batch.amount) })}
          </Text>
        )}
        <Text style={[styles.meta, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
          {t('stampCodes.detail.summary', { active: batch.active, redeemed: batch.redeemed, revoked: batch.revoked })}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
          {t('stampCodes.list.createdOn', { date: formatDate(batch.createdAt) })}
        </Text>
      </Section>

      {batch.active > 0 && (
        <>
          <Notice text={t('stampCodes.detail.printHint')} />
          <Button
            icon={Printer}
            label={t('stampCodes.detail.print')}
            onPress={() => exportSheet('print')}
            loading={sheetBusy === 'print'}
            disabled={sheetBusy === 'share'}
          />
          <Button
            variant="secondary"
            icon={FileText}
            label={t('stampCodes.detail.sharePdf')}
            onPress={() => exportSheet('share')}
            loading={sheetBusy === 'share'}
            disabled={sheetBusy === 'print'}
          />
          <Button variant="secondary" icon={Link2} label={t('stampCodes.detail.shareLinks')} onPress={shareLinks} />
          {canManage && (
            <Button
              variant="ghost"
              icon={Ban}
              label={t('stampCodes.detail.revokeAll')}
              onPress={confirmRevokeBatch}
              loading={revokeBatch.isPending}
            />
          )}
        </>
      )}
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={batch?.label ?? t('stampCodes.detail.title')}
        wrap
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/stamp-codes'))}
      />
      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : isError || !batch ? (
        <View style={styles.errorBox}>
          <Notice tone="danger" text={t('stampCodes.list.loadError')} />
          <Button variant="secondary" label={t('common.retry')} onPress={() => refetch()} />
        </View>
      ) : (
        <FlatList
          data={batch.codes}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={ListSeparator}
          initialNumToRender={20}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />}
        />
      )}

      {selected && batch && (
        <QrModal
          selected={selected}
          stamps={batch.stamps}
          canManage={canManage}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

const CodeRow = React.memo(function CodeRow({ code, n, formatDate, onOpen }: {
  code: StampCodeItem;
  n: number;
  formatDate: (iso: string) => string;
  onOpen: (s: Selected) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const color = code.status === 'ACTIVE' ? theme.success : code.status === 'REDEEMED' ? theme.primary : theme.textMuted;
  const name = code.redeemedBy ? `${code.redeemedBy.prenom ?? ''} ${code.redeemedBy.nom ?? ''}`.trim() : '';
  const detail = code.status === 'REDEEMED' && code.redeemedAt
    ? name
      ? t('stampCodes.detail.usedBy', { name, date: formatDate(code.redeemedAt) })
      : t('stampCodes.detail.usedOn', { date: formatDate(code.redeemedAt) })
    : null;
  const usable = code.status === 'ACTIVE';

  return (
    <TouchableOpacity
      disabled={!usable}
      onPress={() => onOpen({ code, n })}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ disabled: !usable }}
      style={[styles.codeRow, { flexDirection: row, backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
    >
      <QrCode size={ms(22)} color={usable ? theme.primary : theme.textMuted} strokeWidth={icon.stroke} />
      <View style={styles.flex}>
        <Text style={[styles.codeTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
          {t('stampCodes.detail.codeNumber', { n })}
        </Text>
        {detail && (
          <Text style={[styles.meta, { color: theme.textMuted, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {detail}
          </Text>
        )}
      </View>
      <StatusPill label={t(`stampCodes.detail.codeStatus.${code.status}`)} color={color} />
    </TouchableOpacity>
  );
});

/** One QR code full size, exportable as an image to print or send. */
function QrModal({ selected, stamps, canManage, onClose }: {
  selected: Selected;
  stamps: number;
  canManage: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const merchant = useAuthStore((s) => s.merchant);
  const revokeCode = useRevokeStampCode();
  const posterRef = useRef<View | null>(null);
  const [exporting, setExporting] = useState(false);
  const { code, n } = selected;

  const exportImage = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(t('common.error'), t('stampCodes.qr.shareUnavailable'));
        return;
      }
      if (!posterRef.current) throw new Error('Poster view unavailable');
      const fileUri = await captureRef(posterRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(fileUri, { mimeType: 'image/png' });
    } catch (e) {
      logWarn('StampCodeLabel', `image export failed: ${e instanceof Error ? e.message : String(e)}`);
      Alert.alert(t('common.error'), t('stampCodes.qr.exportError'));
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);

  const confirmRevoke = useCallback(() => {
    Alert.alert(t('stampCodes.detail.revokeOne'), t('stampCodes.detail.revokeOneConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeCode.mutateAsync(code.id);
            onClose();
          } catch (e) {
            Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError')));
          }
        },
      },
    ]);
  }, [code.id, onClose, revokeCode, t]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: theme.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.close}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <X size={ms(24)} color={theme.text} strokeWidth={icon.stroke} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {/* Captured as the printable image */}
          {code.url ? (
            <StampCodeLabel
              ref={posterRef}
              url={code.url}
              n={n}
              stamps={stamps}
              merchantName={merchant?.nom ?? ''}
              logoUrl={merchant?.logoUrl}
              brandColor={merchant?.themeColor}
              t={t}
              locale={locale}
              isRTL={isRTL}
            />
          ) : null}

          <Text style={[styles.hint, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {t('stampCodes.qr.hint')}
          </Text>
        </ScrollView>

        <View style={styles.modalActions}>
          <Button icon={Share2} label={t('stampCodes.qr.share')} onPress={exportImage} loading={exporting} />
          {canManage && (
            <Button variant="ghost" icon={Ban} label={t('stampCodes.detail.revokeOne')} onPress={confirmRevoke} loading={revokeCode.isPending} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: { padding: 16, gap: 12 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 12, marginBottom: 14 },
  value: { fontSize: ms(16), fontFamily: font.semibold },
  meta: { fontSize: ms(13), fontFamily: font.regular, marginTop: 2 },
  codeRow: { alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  codeTitle: { fontSize: ms(14), fontFamily: font.semibold },
  modal: { flex: 1, paddingHorizontal: 20, gap: 12 },
  modalContent: { alignItems: 'center', gap: 16, paddingBottom: 8 },
  close: { alignSelf: 'flex-end' },
  hint: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular, textAlign: 'center' },
  modalActions: { alignSelf: 'stretch', gap: 10 },
});
