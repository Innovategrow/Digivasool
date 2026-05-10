import React, { useState } from 'react';
import { Alert } from 'react-native';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AppHeader } from '../components/AppHeader';
import { shadows, theme } from '../constants/theme';
import { reminderCadenceDays } from '../data/ledgerData';
import { API_BASE_URL } from '../constants/api';

export default function AddEntryScreen() {
  const [type, setType] = useState<'GAVE' | 'GOT'>('GAVE');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name || !amount) {
      Alert.alert('Error', 'Please enter name and amount');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/transactions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'admin',
        },
        body: JSON.stringify({
          customer_id: `cust-${Date.now()}`,
          customer_name: name,
          customer_phone: phone,
          type: type,
          amount: parseFloat(amount),
          notes: notes,
          interest_rate_monthly: type === 'GAVE' ? parseFloat(interestRate) || 0 : null,
        }),
      });

      if (response.ok) {
        router.replace('/');
      } else {
        const errData = await response.json();
        Alert.alert('Error', errData.detail || 'Failed to save transaction');
      }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="New Entry" subtitle="Keep entries simple and fast" showBack />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Quick summary</Text>
            <Text style={styles.heroAmount}>{amount ? `₹ ${amount}` : '₹ 0'}</Text>
            <Text style={styles.heroText}>
              {name ? `Entry ready for ${name}` : 'Add customer details and save a clean record in one step.'}
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Transaction type</Text>
            <View style={styles.segmentRow}>
              <Pressable style={[styles.segment, type === 'GAVE' ? styles.segmentRed : null]} onPress={() => setType('GAVE')}>
                <Text style={[styles.segmentText, type === 'GAVE' ? styles.segmentTextLight : null]}>You Gave</Text>
              </Pressable>
              <Pressable style={[styles.segment, type === 'GOT' ? styles.segmentGreen : null]} onPress={() => setType('GOT')}>
                <Text style={[styles.segmentText, type === 'GOT' ? styles.segmentTextLight : null]}>You Got</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Customer name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Ramesh Traders" placeholderTextColor={theme.colors.textMuted} style={styles.input} />

            <Text style={styles.label}>Phone number</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="+91 99990 00111" placeholderTextColor={theme.colors.textMuted} style={styles.input} keyboardType="phone-pad" />

            <Text style={styles.label}>Amount</Text>
            <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={theme.colors.textMuted} style={styles.amountInput} keyboardType="numeric" />

            {type === 'GAVE' ? (
              <>
                <View style={styles.adminNote}>
                  <MaterialIcons name="admin-panel-settings" size={18} color={theme.colors.brand} />
                  <Text style={styles.adminNoteText}>Interest rate is visible only on the admin side.</Text>
                </View>

                <Text style={styles.label}>Interest rate (% / month)</Text>
                <TextInput
                  value={interestRate}
                  onChangeText={setInterestRate}
                  placeholder="2.5"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  keyboardType="numeric"
                />

                <View style={styles.reminderCard}>
                  <Text style={styles.reminderTitle}>WhatsApp reminder schedule</Text>
                  <Text style={styles.reminderText}>Automatic reminders will be prepared for every lending on day 5, 7, 10, and 60.</Text>
                  <View style={styles.reminderRow}>
                    {reminderCadenceDays.map((day) => (
                      <View key={day} style={styles.reminderChip}>
                        <Text style={styles.reminderChipText}>Day {day}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : null}

            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a short note"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.notesInput]}
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleSave} disabled={loading} style={styles.saveWrap}>
            <LinearGradient colors={[theme.colors.accent, '#8C1A63']} style={styles.saveButton}>
              <Text style={styles.saveText}>{loading ? 'Saving...' : 'Save Entry'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 20,
  },
  heroCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.brand,
    padding: 18,
    ...shadows.card,
  },
  heroLabel: {
    color: '#D8E8FF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroAmount: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  heroText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    lineHeight: 19,
  },
  formCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    ...shadows.card,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#EDF2F8',
    paddingVertical: 13,
    alignItems: 'center',
  },
  segmentRed: {
    backgroundColor: theme.colors.negative,
  },
  segmentGreen: {
    backgroundColor: theme.colors.positive,
  },
  segmentText: {
    color: theme.colors.textMuted,
    fontWeight: '800',
  },
  segmentTextLight: {
    color: '#FFFFFF',
  },
  input: {
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.colors.text,
    fontSize: 15,
  },
  amountInput: {
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  adminNote: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.brandSoft,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adminNoteText: {
    flex: 1,
    color: theme.colors.brand,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  reminderCard: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: '#FFF7EA',
    padding: 14,
    borderWidth: 1,
    borderColor: '#F2DFB5',
  },
  reminderTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  reminderText: {
    marginTop: 6,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  reminderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  reminderChip: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reminderChipText: {
    color: '#8A4A19',
    fontSize: 12,
    fontWeight: '700',
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
  },
  cancelText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  saveWrap: {
    flex: 1,
    marginLeft: 16,
  },
  saveButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
