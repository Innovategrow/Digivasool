import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AppHeader } from '../../components/AppHeader';
import { shadows, theme } from '../../constants/theme';

type SettingsRowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress?: () => void;
  isDestructive?: boolean;
  showChevron?: boolean;
  trailing?: React.ReactNode;
};

function SettingsRow({ icon, label, onPress, isDestructive, showChevron = true, trailing }: SettingsRowProps) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.rowIcon, isDestructive && styles.rowIconDestructive]}>
        <MaterialIcons
          name={icon}
          size={22}
          color={isDestructive ? theme.colors.negative : '#6B7280'}
        />
      </View>
      <Text style={[styles.rowLabel, isDestructive && styles.rowLabelDestructive]}>{label}</Text>
      {trailing ? trailing : showChevron ? (
        <MaterialIcons name="chevron-right" size={22} color="#C4C9D4" />
      ) : null}
    </Pressable>
  );
}

function SectionSpacer() {
  return <View style={styles.sectionSpacer} />;
}

export default function SettingsScreen() {
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);
  const [securityAlertEnabled, setSecurityAlertEnabled] = useState(false);

  const handlePlaceholder = (label: string) => {
    Alert.alert(label, `${label} settings will be available soon.`);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Settings" subtitle="Manage your app preferences" />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Support & License */}
        <View style={styles.card}>
          <SettingsRow
            icon="help-outline"
            label="Support"
            onPress={() => handlePlaceholder('Support')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="vpn-key"
            label="License"
            onPress={() => handlePlaceholder('License')}
          />
        </View>

        <SectionSpacer />

        {/* Line Management */}
        <View style={styles.card}>
          <SettingsRow
            icon="account-balance-wallet"
            label="Line"
            onPress={() => handlePlaceholder('Line')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="cloud-download"
            label="Import Line"
            onPress={() => handlePlaceholder('Import Line')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="cloud-upload"
            label="Export Line"
            onPress={() => handlePlaceholder('Export Line')}
          />
        </View>

        <SectionSpacer />

        {/* Area */}
        <View style={styles.card}>
          <SettingsRow
            icon="my-location"
            label="Area"
            onPress={() => handlePlaceholder('Area')}
          />
        </View>

        <SectionSpacer />

        {/* Expense & Investment Types */}
        <View style={styles.card}>
          <SettingsRow
            icon="credit-card"
            label="Expense Type"
            onPress={() => handlePlaceholder('Expense Type')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="business-center"
            label="Investment Type"
            onPress={() => handlePlaceholder('Investment Type')}
          />
        </View>

        <SectionSpacer />

        {/* Site */}
        <View style={styles.card}>
          <SettingsRow
            icon="apps"
            label="Site"
            onPress={() => handlePlaceholder('Site')}
          />
        </View>

        <SectionSpacer />

        {/* App Settings & Security */}
        <View style={styles.card}>
          <SettingsRow
            icon="settings"
            label="My Settings"
            onPress={() => handlePlaceholder('My Settings')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="translate"
            label="Language Settings"
            onPress={() => handlePlaceholder('Language Settings')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="fingerprint"
            label="Enable Fingerprint"
            showChevron={false}
            trailing={
              <Switch
                value={fingerprintEnabled}
                onValueChange={setFingerprintEnabled}
                trackColor={{ false: '#E2E8F0', true: theme.colors.brand }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="phone-android"
            label="Enable Security Alert"
            showChevron={false}
            trailing={
              <Switch
                value={securityAlertEnabled}
                onValueChange={setSecurityAlertEnabled}
                trackColor={{ false: '#E2E8F0', true: theme.colors.brand }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="lock-outline"
            label="Change Password"
            onPress={() => handlePlaceholder('Change Password')}
          />
        </View>

        <SectionSpacer />

        {/* Sign Out */}
        <View style={styles.card}>
          <SettingsRow
            icon="power-settings-new"
            label="Sign out"
            isDestructive
            showChevron={false}
            onPress={() => {
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: () => {} },
              ]);
            }}
          />
        </View>

        {/* Admin Access Card */}
        <Pressable style={styles.adminCard} onPress={() => router.push('/(admin)')}>
          <View style={styles.adminBadge}>
            <MaterialIcons name="admin-panel-settings" size={22} color={theme.colors.brand} />
          </View>
          <View style={styles.adminCopy}>
            <Text style={styles.adminTitle}>Admin lending controls</Text>
            <Text style={styles.adminText}>View interest rates, due balances, and reminder cadence in one place.</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={theme.colors.textMuted} />
        </Pressable>

        <View style={styles.versionBox}>
          <Text style={styles.versionText}>DigitKhata Pro v1.0.0</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF0',
    overflow: 'hidden',
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F4F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDestructive: {
    backgroundColor: theme.colors.dangerSoft,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  rowLabelDestructive: {
    color: theme.colors.negative,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F2F5',
    marginLeft: 66,
  },
  sectionSpacer: {
    height: 16,
  },
  adminCard: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF0',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card,
  },
  adminBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCopy: {
    flex: 1,
  },
  adminTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  adminText: {
    marginTop: 4,
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  versionBox: {
    marginTop: 24,
    alignItems: 'center',
  },
  versionText: {
    color: '#A0A8B4',
    fontSize: 12,
    fontWeight: '600',
  },
});
