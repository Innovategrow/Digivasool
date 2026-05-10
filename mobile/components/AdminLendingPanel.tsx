import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { shadows, theme } from '../constants/theme';
import { formatCurrency, getAdminSummary, ledgerTransactions } from '../data/ledgerData';

export function AdminLendingPanel() {
  const lendings = ledgerTransactions.filter((item) => item.type === 'GAVE');
  const summary = getAdminSummary();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>ADMIN SIDE ONLY</Text>
        <Text style={styles.title}>Lending control room</Text>
        <Text style={styles.subtitle}>
          Every lending shows its monthly interest rate here, along with the WhatsApp reminder cadence for day 5, 7, 10, and 60.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Active lendings</Text>
          <Text style={styles.summaryValue}>{summary.activeLendings}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Avg. interest</Text>
          <Text style={styles.summaryValue}>{summary.averageInterest}%</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Outstanding</Text>
          <Text style={styles.summaryValue}>{formatCurrency(summary.outstanding)}</Text>
        </View>
      </View>

      {lendings.map((item) => (
        <View key={item.id} style={styles.loanCard}>
          <View style={styles.row}>
            <View>
              <Text style={styles.customerName}>{item.customerName}</Text>
              <Text style={styles.phone}>{item.customerPhone}</Text>
            </View>
            <View style={styles.interestPill}>
              <Text style={styles.interestText}>{item.interestRateMonthly}% / month</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Principal</Text>
              <Text style={styles.metricValue}>{formatCurrency(item.amount)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Outstanding</Text>
              <Text style={styles.metricValue}>{formatCurrency(item.outstandingAmount)}</Text>
            </View>
          </View>

          <Text style={styles.notes}>{item.notes}</Text>
          <Text style={styles.meta}>Due {item.dueDate}</Text>

          <View style={styles.reminderRow}>
            {item.reminderDays.map((day) => (
              <View key={day} style={styles.reminderChip}>
                <Text style={styles.reminderChipText}>WhatsApp day {day}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 16,
    backgroundColor: theme.colors.background,
  },
  headerCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: theme.colors.brandDark,
    ...shadows.card,
  },
  kicker: {
    color: '#9CC4FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    marginTop: 8,
    color: '#fff6ee',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    color: '#D8E7FF',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...shadows.card,
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    marginTop: 8,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  loanCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: theme.colors.surface,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  customerName: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  phone: {
    marginTop: 5,
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  interestPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: theme.colors.warningSoft,
  },
  interestText: {
    color: '#8A4A19',
    fontSize: 12,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metric: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: theme.colors.surfaceMuted,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    marginTop: 8,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  notes: {
    color: '#4C5A66',
    fontSize: 13,
    lineHeight: 18,
  },
  meta: {
    color: '#806D5D',
    fontSize: 12,
    fontWeight: '700',
  },
  reminderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reminderChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: theme.colors.successSoft,
  },
  reminderChipText: {
    color: '#116D49',
    fontSize: 12,
    fontWeight: '700',
  },
});
