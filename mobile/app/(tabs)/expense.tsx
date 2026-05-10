import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppHeader } from '../../components/AppHeader';
import { shadows, theme } from '../../constants/theme';
import { cashbookDays, formatCurrency, getCashbookSummary } from '../../data/ledgerData';

export default function ExpenseScreen() {
  const summary = getCashbookSummary();
  return (
    <SafeAreaView style={s.screen}>
      <AppHeader title="Expense" subtitle="Track daily cash transactions" onRightPress={() => router.push('/cashbook-report')} rightIcon="help-outline" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.balanceCard}>
          <View style={s.balanceRow}>
            <View style={s.balanceCol}><Text style={s.balanceLabel}>Total balance</Text><Text style={s.balanceValue}>{formatCurrency(summary.totalBalance)}</Text></View>
            <View style={s.balanceCol}><Text style={s.balanceLabel}>Today balance</Text><Text style={s.balanceValue}>{formatCurrency(summary.todayBalance)}</Text></View>
          </View>
          <View style={s.subRow}>
            <View style={s.subMetric}><Text style={s.subLabel}>Cash in hand</Text><Text style={s.subValue}>{formatCurrency(summary.cashInHand)}</Text></View>
            <View style={s.subMetric}><Text style={s.subLabel}>Online</Text><Text style={s.subValue}>{formatCurrency(summary.online)}</Text></View>
          </View>
          <Pressable style={s.linkBtn} onPress={() => router.push('/cashbook-report')}>
            <MaterialIcons name="picture-as-pdf" size={18} color={theme.colors.brand} />
            <Text style={s.linkBtnText}>View Cashbook Report</Text>
          </Pressable>
        </View>
        <View style={s.actionsRow}>
          <Pressable style={[s.action, s.actionIn]} onPress={() => router.push('/add')}><MaterialIcons name="south-west" size={18} color="#FFF" /><Text style={s.actionText}>Record In</Text></Pressable>
          <Pressable style={[s.action, s.actionOut]} onPress={() => router.push('/add')}><MaterialIcons name="north-east" size={18} color="#FFF" /><Text style={s.actionText}>Record Out</Text></Pressable>
        </View>
        <View style={s.listCard}>
          {cashbookDays.map((day) => (
            <View key={day.id} style={s.dayRow}>
              <View><Text style={s.dayDate}>{day.dateLabel}</Text><Text style={s.dayMeta}>Daily balance {formatCurrency(day.dailyBalance)}</Text></View>
              <View style={s.dayAmounts}><Text style={s.dayAmt}>{formatCurrency(day.totalBalance)}</Text><Text style={s.daySub}>Cash {formatCurrency(day.cashInHand)}</Text></View>
            </View>
          ))}
        </View>
        <View style={s.infoSheet}>
          <Text style={s.infoTitle}>Manage daily cash with less confusion</Text>
          <View style={s.infoPoint}><MaterialIcons name="check-circle" size={18} color={theme.colors.brand} /><Text style={s.infoText}>Today balance = total IN minus total OUT for the day.</Text></View>
          <View style={s.infoPoint}><MaterialIcons name="account-balance-wallet" size={18} color={theme.colors.brand} /><Text style={s.infoText}>Cash in hand shows what is currently in the counter or drawer.</Text></View>
          <View style={s.infoPoint}><MaterialIcons name="picture-as-pdf" size={18} color={theme.colors.brand} /><Text style={s.infoText}>Reports can be downloaded by month, week, or custom date range.</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  balanceCard: { borderRadius: 20, backgroundColor: theme.colors.brand, padding: 16, ...shadows.card },
  balanceRow: { flexDirection: 'row', gap: 14 },
  balanceCol: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 },
  balanceLabel: { color: '#D7E8FF', fontSize: 12, fontWeight: '700' },
  balanceValue: { marginTop: 8, color: '#FFF', fontSize: 24, fontWeight: '800' },
  subRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  subMetric: { flex: 1, borderRadius: 14, backgroundColor: '#FFF', padding: 12 },
  subLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  subValue: { marginTop: 8, color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  linkBtn: { marginTop: 14, borderRadius: 14, backgroundColor: '#FFF', paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  linkBtnText: { color: theme.colors.brand, fontSize: 14, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, borderRadius: 16, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  actionIn: { backgroundColor: theme.colors.positive },
  actionOut: { backgroundColor: theme.colors.negative },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  listCard: { borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', ...shadows.card },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#ECF1F7' },
  dayDate: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  dayMeta: { marginTop: 4, color: theme.colors.textMuted, fontSize: 12 },
  dayAmounts: { alignItems: 'flex-end' },
  dayAmt: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  daySub: { marginTop: 4, color: theme.colors.textMuted, fontSize: 12 },
  infoSheet: { borderRadius: 20, backgroundColor: theme.colors.surface, padding: 18, borderWidth: 1, borderColor: theme.colors.border, gap: 12, ...shadows.card },
  infoTitle: { color: theme.colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  infoPoint: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoText: { flex: 1, color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 },
});
