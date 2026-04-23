import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { User, Mail, Phone, Calendar, Pencil, Check, X, ChevronDown, ShieldCheck } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import FadeInView from '@/components/FadeInView';
import PremiumPhoneInput from '@/components/PremiumPhoneInput';
import { profileStyles as styles } from './profileStyles';
import { ms, wp } from '@/utils/responsive';
import { formatDateInput } from '@/utils/dateInput';
import { isoDtoDmy } from '@/utils/dateInput';
import type { CountryCode } from '@/utils/countryCodes';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { Client } from '@/types';

interface PersonalInfoSectionProps {
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  client: Client | null;
  isLoading: boolean;
  isEditing: boolean;
  isSaving: boolean;
  isSendingOtp: boolean;
  otpTarget: { type: string; value: string } | null;
  infoExpanded: boolean;
  setInfoExpanded: (v: boolean) => void;
  editPrenom: string;
  setEditPrenom: (v: string) => void;
  editNom: string;
  setEditNom: (v: string) => void;
  editEmail: string;
  setEditEmail: (v: string) => void;
  editPhoneLocal: string;
  setEditPhoneLocal: (v: string) => void;
  editPhoneCountry: CountryCode;
  setEditPhoneCountry: (v: CountryCode) => void;
  editDateNaissance: string;
  setEditDateNaissance: (v: string) => void;
  startEditing: () => void;
  cancelEditing: () => void;
  saveProfile: () => void;
  startOtpFlow: (target: { type: 'email' | 'telephone'; value: string }) => void;
}

export default function PersonalInfoSection({
  theme, t, client, isLoading, isEditing, isSaving, isSendingOtp, otpTarget,
  infoExpanded, setInfoExpanded,
  editPrenom, setEditPrenom, editNom, setEditNom,
  editEmail, setEditEmail,
  editPhoneLocal, setEditPhoneLocal, editPhoneCountry, setEditPhoneCountry,
  editDateNaissance, setEditDateNaissance,
  startEditing, cancelEditing, saveProfile, startOtpFlow,
}: PersonalInfoSectionProps) {
  return (
    <FadeInView delay={300}>
      <TouchableOpacity
        onPress={() => { if (!isEditing) setInfoExpanded(!infoExpanded); }}
        activeOpacity={0.7}
        style={styles.sectionHeaderRow}
      >
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('profile.personalInfo')}</Text>
        <View style={styles.editActions}>
          {!isLoading && !isEditing && (
            <ChevronDown size={ms(18)} color={theme.textMuted} strokeWidth={1.5}
              style={{ transform: [{ rotate: infoExpanded ? '180deg' : '0deg' }] }} />
          )}
          {!isLoading && !isEditing && infoExpanded && (
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); startEditing(); }}
              style={[styles.editHeaderBtn, { backgroundColor: `${palette.violet}12` }]} activeOpacity={0.7}>
              <Pencil size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </TouchableOpacity>
          )}
          {isEditing && (
            <>
              <TouchableOpacity onPress={cancelEditing} style={[styles.editActionBtn, { backgroundColor: `${theme.danger}12` }]} activeOpacity={0.7}>
                <X size={ms(16)} color={theme.danger} strokeWidth={1.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={saveProfile} disabled={isSaving}
                style={[styles.editActionBtn, { backgroundColor: `${palette.violet}15` }]} activeOpacity={0.7}>
                {isSaving ? <ActivityIndicator size="small" color={palette.violet} /> : <Check size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>

      {(infoExpanded || isEditing) && (
        <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
          {/* Prénom */}
          <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <User size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.firstName')}</Text>
              {isEditing ? (
                <TextInput style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet }]}
                  value={editPrenom} onChangeText={setEditPrenom}
                  placeholder={t('profile.firstNamePlaceholder')} placeholderTextColor={theme.textMuted} autoCapitalize="words" />
              ) : (
                <Text style={[styles.infoValue, { color: theme.text }]}>{client?.prenom || '—'}</Text>
              )}
            </View>
          </View>

          {/* Nom */}
          <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <User size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.lastName')}</Text>
              {isEditing ? (
                <TextInput style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet }]}
                  value={editNom} onChangeText={setEditNom}
                  placeholder={t('profile.lastNamePlaceholder')} placeholderTextColor={theme.textMuted} autoCapitalize="words" />
              ) : (
                <Text style={[styles.infoValue, { color: theme.text }]}>{client?.nom || '—'}</Text>
              )}
            </View>
          </View>

          {/* Email */}
          <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Mail size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.email')}</Text>
              {isEditing ? (
                <TextInput style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet }]}
                  value={editEmail} onChangeText={setEditEmail}
                  placeholder={t('profile.emailPlaceholder')} placeholderTextColor={theme.textMuted}
                  keyboardType="email-address" autoCapitalize="none" />
              ) : (
                <Text style={[styles.infoValue, { color: theme.text }]}>{client?.email || t('profile.notProvided')}</Text>
              )}
              {client?.email && !client.emailVerified && (
                <TouchableOpacity
                  onPress={() => startOtpFlow({ type: 'email', value: client.email! })}
                  style={styles.pendingBadge} activeOpacity={0.7} disabled={isSendingOtp}>
                  {isSendingOtp && otpTarget?.type === 'email' ? (
                    <ActivityIndicator size={ms(12)} color={palette.gold} />
                  ) : (
                    <ShieldCheck size={ms(12)} color={palette.gold} strokeWidth={1.5} />
                  )}
                  <Text style={styles.pendingBadgeText}>{t('profile.pendingVerification')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Phone */}
          <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Phone size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.phone')}</Text>
              {isEditing ? (
                <PremiumPhoneInput
                  value={editPhoneLocal} onChangePhone={setEditPhoneLocal}
                  country={editPhoneCountry} onChangeCountry={setEditPhoneCountry}
                  accentColor={palette.violet} errorMessage={t('profile.phoneInvalid')} />
              ) : (
                <Text style={[styles.infoValue, { color: theme.text }]}>{client?.telephone || '—'}</Text>
              )}
              {client?.telephone && !client.telephoneVerified && (
                <TouchableOpacity
                  onPress={() => startOtpFlow({ type: 'telephone', value: client.telephone! })}
                  style={styles.pendingBadge} activeOpacity={0.7} disabled={isSendingOtp}>
                  {isSendingOtp && otpTarget?.type === 'telephone' ? (
                    <ActivityIndicator size={ms(12)} color={palette.gold} />
                  ) : (
                    <ShieldCheck size={ms(12)} color={palette.gold} strokeWidth={1.5} />
                  )}
                  <Text style={styles.pendingBadgeText}>{t('profile.pendingVerification')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Date de naissance */}
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Calendar size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {t('profile.dateNaissance')}<Text style={{ fontWeight: '400' }}>{' '}({t('profile.optional')})</Text>
              </Text>
              {isEditing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(8) }}>
                  <TextInput
                    style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet, flex: 1 }]}
                    value={editDateNaissance} onChangeText={(v) => setEditDateNaissance(formatDateInput(v))}
                    placeholder={t('profile.dateNaissancePlaceholder')} placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" maxLength={10} />
                  {editDateNaissance.length > 0 && (
                    <TouchableOpacity onPress={() => setEditDateNaissance('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <X size={ms(16)} color={theme.textMuted} strokeWidth={1.5} />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {client?.dateNaissance ? isoDtoDmy(client.dateNaissance) : t('profile.notProvided')}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}
    </FadeInView>
  );
}
