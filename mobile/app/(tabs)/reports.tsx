import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AppHeader } from '../../components/AppHeader';
import { shadows, theme } from '../../constants/theme';
import { customerReportItems, reportFilters } from '../../data/ledgerData';

export default function ReportsScreen() {
  const [activeFilter, setActiveFilter] = useState('Customer');

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="View Reports" subtitle="Simple exports and summaries" onRightPress={() => router.push('/cashbook-report')} rightIcon="calendar-month" />
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {reportFilters.map((filter) => (
            <Pressable
              key={filter}
              style={[styles.filterChip, activeFilter === filter ? styles.filterChipActive : null]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.filterText, activeFilter === filter ? styles.filterTextActive : null]}>{filter}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.heroCard}>
          <MaterialIcons name="insights" size={28} color={theme.colors.brand} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Reports made easier</Text>
            <Text style={styles.heroText}>Keep exports simple for shop owners while still giving you enough detail to act quickly.</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Customer reports</Text>
          {customerReportItems.map((item) => (
            <Pressable key={item.id} style={styles.reportRow} onPress={() => router.push(item.target)}>
              <View style={styles.reportIcon}>
                <MaterialIcons name={item.icon as keyof typeof MaterialIcons.glyphMap} size={22} color={theme.colors.brand} />
              </View>
              <View style={styles.reportCopy}>
                <Text style={styles.reportTitle}>{item.title}</Text>
                <Text style={styles.reportSubtitle}>{item.subtitle}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  filterRow: {
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.brandSoft,
    borderColor: '#BFD5F6',
  },
  filterText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  filterTextActive: {
    color: theme.colors.brand,
  },
  heroCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    ...shadows.card,
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  heroText: {
    marginTop: 6,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    ...shadows.card,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF1F7',
  },
  reportIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCopy: {
    flex: 1,
  },
  reportTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  reportSubtitle: {
    marginTop: 4,
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
});
