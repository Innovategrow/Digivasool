import React, { useState, useEffect } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { AppHeader } from '../../components/AppHeader';
import { shadows, theme } from '../../constants/theme';
import { API_BASE_URL } from '../../constants/api';

type LoanItem = {
  id: string;
  customer_name: string;
  customer_phone: string;
  loan_amount: number;
  due_amount: number;
  collected_amount: number;
  pending_amount: number;
  status: string;
  start_date: string;
  closing_date: string;
};

export default function CollectionScreen() {
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [totalPending, setTotalPending] = useState(0);
  const [totalCollected, setTotalCollected] = useState(0);

  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/loans/`);
      if (res.ok) {
        const data: LoanItem[] = await res.json();
        setLoans(data);
        const pending = data.reduce((sum, l) => sum + (l.pending_amount || 0), 0);
        const collected = data.reduce((sum, l) => sum + (l.collected_amount || 0), 0);
        setTotalPending(pending);
        setTotalCollected(collected);
      }
    } catch (err) {
      console.error('Failed to fetch loans:', err);
    } finally {
      setLoading(false);
    }
  };

  const activeLoans = loans.filter(
    (l) =>
      l.status === 'active' &&
      l.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Collection" subtitle="Daily loan recovery tracker" />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Summary Cards */}
        <LinearGradient
          colors={['#0B56B3', '#3C8DFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summaryCard}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Total Collected</Text>
              <Text style={styles.summaryValue}>₹ {totalCollected.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Total Pending</Text>
              <Text style={styles.summaryValueDanger}>₹ {totalPending.toLocaleString('en-IN')}</Text>
            </View>
          </View>
          <View style={styles.loanCountRow}>
            <MaterialIcons name="people" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.loanCountText}>{activeLoans.length} active loan(s)</Text>
          </View>
        </LinearGradient>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionButton} onPress={() => router.push('/collection-entry')}>
            <MaterialIcons name="add-circle" size={20} color="#FFFFFF" />
            <Text style={styles.actionText}>New Collection</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => router.push('/add')}>
            <MaterialIcons name="person-add" size={20} color={theme.colors.brand} />
            <Text style={[styles.actionText, styles.actionTextSecondary]}>New Loan</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={18} color={theme.colors.brand} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search borrower name"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />
        </View>

        {/* Loan List */}
        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading loans...</Text>
          </View>
        ) : activeLoans.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="inbox" size={40} color="#C4C9D4" />
            <Text style={styles.emptyTitle}>No active loans</Text>
            <Text style={styles.emptyText}>Create a new loan to start tracking collections.</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {activeLoans.map((loan, idx) => (
              <Pressable
                key={loan.id}
                style={[styles.loanRow, idx < activeLoans.length - 1 && styles.loanRowBorder]}
                onPress={() => router.push('/collection-entry')}
              >
                <View style={styles.loanAvatar}>
                  <Text style={styles.loanAvatarText}>{loan.customer_name.charAt(0)}</Text>
                </View>
                <View style={styles.loanCopy}>
                  <Text style={styles.loanName}>{loan.customer_name}</Text>
                  <Text style={styles.loanMeta}>{loan.customer_phone || 'No phone'}</Text>
                  <View style={styles.loanProgress}>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(
                              ((loan.collected_amount || 0) / Math.max(loan.due_amount, 1)) * 100,
                              100
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressLabel}>
                      {loan.due_amount > 0
                        ? `${Math.round(((loan.collected_amount || 0) / loan.due_amount) * 100)}%`
                        : '0%'}
                    </Text>
                  </View>
                </View>
                <View style={styles.loanAmounts}>
                  <Text style={styles.loanPending}>₹{(loan.pending_amount || 0).toLocaleString('en-IN')}</Text>
                  <Text style={styles.loanPendingLabel}>pending</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

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
    paddingBottom: 110,
    gap: 14,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 18,
    ...shadows.card,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCol: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 14,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  summaryValueDanger: {
    marginTop: 6,
    color: '#FFBABA',
    fontSize: 22,
    fontWeight: '800',
  },
  loanCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  loanCountText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: theme.colors.brand,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: theme.colors.brandSoft,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  actionTextSecondary: {
    color: theme.colors.brand,
  },
  searchBox: {
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: theme.colors.text,
  },
  listCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  loanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  loanRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#ECF1F7',
  },
  loanAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E5EDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loanAvatarText: {
    color: theme.colors.brand,
    fontSize: 16,
    fontWeight: '800',
  },
  loanCopy: {
    flex: 1,
  },
  loanName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  loanMeta: {
    marginTop: 3,
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  loanProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E8EEF5',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.positive,
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  loanAmounts: {
    alignItems: 'flex-end',
  },
  loanPending: {
    color: theme.colors.negative,
    fontSize: 15,
    fontWeight: '800',
  },
  loanPendingLabel: {
    marginTop: 2,
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  emptyCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
