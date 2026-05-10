import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { AppHeader } from '../components/AppHeader';
import { shadows, theme } from '../constants/theme';
import { cashbookDays, durationOptions, formatCurrency } from '../data/ledgerData';

export default function CashbookReportScreen() {
  const [selectedDuration, setSelectedDuration] = useState('This Month');
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Cashbook Report" subtitle="Export and review balances" showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.dateRow}>
          <View style={styles.dateCard}>
            <MaterialIcons name="calendar-month" size={18} color={theme.colors.brand} />
            <Text style={styles.dateText}>01 Apr 26</Text>
          </View>
          <View style={styles.dateCard}>
            <MaterialIcons name="calendar-month" size={18} color={theme.colors.brand} />
            <Text style={styles.dateText}>30 Apr 26</Text>
          </View>
        </View>

        <Pressable style={styles.durationCard} onPress={() => setSheetOpen(true)}>
          <Text style={styles.durationLabel}>Select report duration</Text>
          <View style={styles.durationValueWrap}>
            <Text style={styles.durationValue}>{selectedDuration}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={22} color={theme.colors.brand} />
          </View>
        </Pressable>

        <View style={styles.tableHeader}>
          <Text style={styles.tableHeaderText}>Date</Text>
          <Text style={styles.tableHeaderText}>Daily balance</Text>
          <Text style={styles.tableHeaderText}>Total balance</Text>
        </View>

        <View style={styles.listCard}>
          {cashbookDays.map((day) => (
            <Pressable key={day.id} style={styles.reportRow}>
              <Text style={styles.reportDate}>{day.dateLabel}</Text>
              <Text style={styles.reportAmount}>{formatCurrency(day.dailyBalance)}</Text>
              <View style={styles.reportEnd}>
                <Text style={styles.reportAmount}>{formatCurrency(day.totalBalance)}</Text>
                <MaterialIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.downloadButton}>
          <MaterialIcons name="picture-as-pdf" size={18} color="#FFFFFF" />
          <Text style={styles.downloadText}>Download Report</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Select report duration</Text>
            {durationOptions.map((option) => (
              <Pressable
                key={option}
                style={styles.sheetRow}
                onPress={() => {
                  setSelectedDuration(option);
                  setSheetOpen(false);
                }}
              >
                <Text style={[styles.sheetLabel, selectedDuration === option ? styles.sheetLabelActive : null]}>{option}</Text>
                <MaterialIcons
                  name={selectedDuration === option ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={22}
                  color={theme.colors.brand}
                />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingBottom: 28,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadows.card,
  },
  dateText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  durationCard: {
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.card,
  },
  durationLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  durationValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationValue: {
    color: theme.colors.brand,
    fontSize: 14,
    fontWeight: '800',
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF1F7',
  },
  reportDate: {
    width: 70,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  reportAmount: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  reportEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadButton: {
    borderRadius: 14,
    backgroundColor: theme.colors.brand,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  downloadText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 16, 33, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 8,
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetLabel: {
    color: theme.colors.textMuted,
    fontSize: 15,
  },
  sheetLabelActive: {
    color: theme.colors.brand,
    fontWeight: '800',
  },
});
