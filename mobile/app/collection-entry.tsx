import React, { useState } from 'react';
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
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AppHeader } from '../components/AppHeader';
import { shadows, theme } from '../constants/theme';
import { mockLoanRecord } from '../data/ledgerData';

export default function CollectionEntryScreen() {
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GPay'>('Cash');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Simulated data state
  const loan = mockLoanRecord;
  const ratio = `${Math.min(loan.totalDaysPaid, loan.totalDaysPaid + loan.totalDaysNotPaid)}/${loan.totalDaysPaid + loan.totalDaysNotPaid}`;

  const handleSave = () => {
    if (!amount) {
      Alert.alert('Error', 'Please enter an amount');
      return;
    }
    Alert.alert('Success', `Collected ₹${amount} via ${paymentMethod}`, [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Collection Entry" subtitle="Daily loan recovery" showBack />
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          
          {/* Header Card matching the image closely */}
          <View style={styles.cardInfo}>
            <View style={styles.customerRow}>
              <Text style={styles.customerId}>1627.</Text>
              <Text style={styles.customerName}>{loan.customerName}</Text>
            </View>
            
            <View style={styles.detailsGrid}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Loan Amount</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={styles.detailValue}>{loan.loanAmount}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Interest/Document</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={styles.detailValue}>{loan.interestDocument}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={styles.detailValue}>{loan.startDate}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Closing Date</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={styles.detailValue}>{loan.closingDate}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Due</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={styles.detailValue}>{loan.dueAmount}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Collected</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={styles.detailValueActive}>{loan.collectedAmount}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Pending</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={styles.detailValueDanger}>{loan.pendingAmount}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailColon}>:</Text>
                <Text style={[styles.detailValue, { textTransform: 'uppercase' }]}>{loan.status}</Text>
              </View>
              
              <View style={[styles.detailRow, styles.marginTop10]}>
                <Text style={styles.detailLabelDanger}>Loan Due Collection</Text>
                <Text style={styles.detailColon}>:</Text>
                <View style={styles.loanDueWrap}>
                  <Text style={styles.loanDueRatio}>{ratio}</Text>
                  <TextInput 
                    value={amount}
                    onChangeText={setAmount}
                    style={styles.loanDueInput} 
                    placeholder="Amt" 
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                  />
                  <Text style={styles.loanDueCurrent}>{amount || "0"}</Text>
                </View>
              </View>
            </View>
          </View>
          
          {/* Day Stats Row */}
          <View style={styles.statsRow}>
            <View style={[styles.statBox, styles.statBoxGreen]}>
              <Text style={styles.statBoxTitle}>Total days paid</Text>
              <Text style={styles.statBoxValue}>{loan.totalDaysPaid} days</Text>
            </View>
            <View style={[styles.statBox, styles.statBoxRed]}>
              <Text style={styles.statBoxTitle}>Total days not paid</Text>
              <Text style={styles.statBoxValue}>({loan.totalDaysNotPaid}) days</Text>
            </View>
          </View>
          
          {/* Amount Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBoxNormal}>
              <Text style={styles.statBoxTitle}>Total paid amount</Text>
              <Text style={styles.statBoxValueAmount}>₹{loan.collectedAmount}</Text>
            </View>
            <View style={styles.statBoxNormal}>
              <Text style={styles.statBoxTitle}>Total balance due</Text>
              <Text style={styles.statBoxValueAmount}>₹{loan.pendingAmount}</Text>
            </View>
          </View>

          {/* Payment Method Selector */}
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Payment Method</Text>
            <View style={styles.paymentOptions}>
              <Pressable 
                style={[styles.paymentOption, paymentMethod === 'Cash' && styles.paymentOptionActive]}
                onPress={() => setPaymentMethod('Cash')}
              >
                <MaterialIcons name="payments" size={20} color={paymentMethod === 'Cash' ? '#FFFFFF' : theme.colors.brand} />
                <Text style={[styles.paymentOptionText, paymentMethod === 'Cash' && styles.paymentOptionTextActive]}>Cash</Text>
              </Pressable>
              
              <Pressable 
                style={[styles.paymentOption, paymentMethod === 'GPay' && styles.paymentOptionActive]}
                onPress={() => setPaymentMethod('GPay')}
              >
                <MaterialIcons name="account-balance-wallet" size={20} color={paymentMethod === 'GPay' ? '#FFFFFF' : theme.colors.brand} />
                <Text style={[styles.paymentOptionText, paymentMethod === 'GPay' && styles.paymentOptionTextActive]}>GPay</Text>
              </Pressable>
            </View>
          </View>

        </ScrollView>
        
        <View style={styles.footer}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleSave} disabled={loading} style={styles.saveWrap}>
            <View style={styles.saveButton}>
              <Text style={styles.saveText}>{loading ? 'Saving...' : 'Save Collection'}</Text>
            </View>
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
  flex: { flex: 1 },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 20,
  },
  cardInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    ...shadows.card,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  customerId: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    marginLeft: 4,
  },
  detailsGrid: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    flex: 0.45,
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  detailLabelDanger: {
    flex: 0.45,
    fontSize: 14,
    color: theme.colors.negative,
    fontWeight: '700',
  },
  detailColon: {
    width: 20,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  detailValue: {
    flex: 0.55,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.brandDark,
  },
  detailValueActive: {
    flex: 0.55,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.brand,
  },
  detailValueDanger: {
    flex: 0.55,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.negative,
  },
  marginTop10: {
    marginTop: 10,
    alignItems: 'center',
  },
  loanDueWrap: {
    flex: 0.55,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loanDueRatio: {
    fontSize: 14,
    color: theme.colors.brand,
    fontWeight: '700',
  },
  loanDueInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 60,
    fontSize: 14,
  },
  loanDueCurrent: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.positive,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    ...shadows.card,
  },
  statBoxNormal: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.card,
  },
  statBoxGreen: {
    backgroundColor: '#E6F4EA',
    borderWidth: 1,
    borderColor: '#A8DAB5',
  },
  statBoxRed: {
    backgroundColor: '#FCE8E8',
    borderWidth: 1,
    borderColor: '#F5B7B7',
  },
  statBoxTitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  statBoxValue: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  statBoxValueAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.brandDark,
  },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.card,
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  paymentOptionActive: {
    backgroundColor: theme.colors.brand,
    borderColor: theme.colors.brand,
  },
  paymentOptionText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  paymentOptionTextActive: {
    color: '#FFFFFF',
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
    backgroundColor: theme.colors.positive,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
