import React, { useState, useEffect } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppHeader } from '../../components/AppHeader';
import { shadows, theme } from '../../constants/theme';
import { formatCurrency, getPartySummary, parties as mockParties, PartyKind, Party } from '../../data/ledgerData';
import { API_BASE_URL } from '../../constants/api';

export default function CustomerScreen() {
  const [selectedKind, setSelectedKind] = useState<PartyKind>('Customer');
  const [parties, setParties] = useState<Party[]>(mockParties);
  const [summary, setSummary] = useState({ youWillGive: 0, youWillGet: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const summaryRes = await fetch(`${API_BASE_URL}/api/dashboard/`);
        const summaryData = await summaryRes.json();
        setSummary({ youWillGive: summaryData.you_will_give, youWillGet: summaryData.you_will_get });
        setParties(mockParties);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const visibleParties = parties.filter((p) => p.kind === selectedKind);

  return (
    <SafeAreaView style={s.screen}>
      <AppHeader title="Customer" subtitle="Simple ledger for daily use" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.segmentWrap}>
          {(['Customer', 'Supplier'] as PartyKind[]).map((kind) => (
            <Pressable key={kind} style={[s.segment, selectedKind === kind ? s.segmentActive : null]} onPress={() => setSelectedKind(kind)}>
              <Text style={[s.segmentText, selectedKind === kind ? s.segmentTextActive : null]}>{kind === 'Customer' ? 'Customers' : 'Suppliers'}</Text>
            </Pressable>
          ))}
        </View>

        <LinearGradient colors={['#FFF0E6', '#F5E7FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.summaryCard, s.glowCard]}>
          <View style={s.summaryBadge}><MaterialIcons name="bolt" size={14} color={theme.colors.accent} /><Text style={s.summaryBadgeText}>Today's snapshot</Text></View>
          <View style={s.summaryCol}><Text style={s.summaryLabel}>You will get</Text><Text style={[s.summaryValue, s.greenText]}>{formatCurrency(summary.youWillGet)}</Text></View>
          <View style={s.summaryDivider} />
          <View style={s.summaryCol}><Text style={s.summaryLabel}>You will give</Text><Text style={[s.summaryValue, s.redText]}>{formatCurrency(summary.youWillGive)}</Text></View>
          <Pressable style={s.reportButton} onPress={() => router.push('/cashbook-report')}><MaterialIcons name="picture-as-pdf" size={18} color={theme.colors.brand} /><Text style={s.reportButtonText}>View Reports</Text></Pressable>
        </LinearGradient>

        <LinearGradient colors={['#FFF5E5', '#E8F2FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.insightCard}>
          <View style={s.insightIcon}><MaterialIcons name="notifications-active" size={20} color={theme.colors.accent} /></View>
          <View style={s.insightCopy}><Text style={s.insightTitle}>Reminder smart queue</Text><Text style={s.insightText}>Day 5, 7, 10, and 60 WhatsApp reminders are active for lending entries.</Text></View>
        </LinearGradient>

        <View style={s.searchRow}>
          <View style={s.searchBox}><MaterialIcons name="search" size={18} color={theme.colors.brand} /><TextInput placeholder="Search customer" placeholderTextColor={theme.colors.textMuted} style={s.searchInput} /></View>
          <Pressable style={s.compactButton} onPress={() => router.push('/cashbook-report')}><MaterialIcons name="tune" size={18} color={theme.colors.brand} /><Text style={s.compactButtonText}>Filters</Text></Pressable>
        </View>

        <LinearGradient colors={['#FFFFFF', '#FDF5FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.listCard}>
          {visibleParties.map((party) => (
            <Pressable key={party.id} style={s.partyRow} onPress={() => router.push('/add')}>
              <View style={s.avatar}><Text style={s.avatarText}>{party.name.charAt(0)}</Text></View>
              <View style={s.partyCopy}>
                <Text style={s.partyName}>{party.name}</Text>
                <Text style={s.partyMeta}>{party.lastActivity}</Text>
                <Text style={s.partyNotes}>{party.reminderDue}</Text>
              </View>
              <Text style={[s.partyBalance, party.balance >= 0 ? s.greenText : s.redText]}>{formatCurrency(party.balance)}</Text>
            </Pressable>
          ))}
        </LinearGradient>
      </ScrollView>
      <Pressable style={s.fab} onPress={() => router.push('/add')}><MaterialIcons name="person-add-alt-1" size={20} color="#FFF" /><Text style={s.fabText}>Add Customer</Text></Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 110, gap: 14 },
  segmentWrap: { flexDirection: 'row', gap: 10 },
  segment: { flex: 1, borderRadius: 14, paddingVertical: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  segmentActive: { backgroundColor: theme.colors.accent },
  segmentText: { color: theme.colors.text, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  segmentTextActive: { color: '#FFF' },
  summaryCard: { borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: 'rgba(11,86,179,0.08)', padding: 18, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 12, ...shadows.card },
  glowCard: { shadowColor: '#0B56B3', shadowOpacity: 0.15, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  summaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(196,20,104,0.08)', marginBottom: 8, alignSelf: 'flex-start' },
  summaryBadgeText: { color: theme.colors.accent, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryCol: { flex: 1, minWidth: 120 },
  summaryDivider: { width: 1, height: 44, backgroundColor: theme.colors.border, marginHorizontal: 12 },
  summaryLabel: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  summaryValue: { marginTop: 8, fontSize: 24, fontWeight: '800' },
  greenText: { color: theme.colors.positive },
  redText: { color: theme.colors.negative },
  reportButton: { marginTop: 2, borderRadius: 14, backgroundColor: theme.colors.brandSoft, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  reportButtonText: { color: theme.colors.brand, fontWeight: '800' },
  insightCard: { borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(37,99,235,0.16)', flexDirection: 'row', gap: 12 },
  insightIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(244,114,182,0.16)', alignItems: 'center', justifyContent: 'center' },
  insightCopy: { flex: 1 },
  insightTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  insightText: { marginTop: 6, color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchBox: { flex: 1, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  searchInput: { flex: 1, paddingVertical: 12, color: theme.colors.text },
  compactButton: { borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: 'rgba(37,99,235,0.18)', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  compactButtonText: { color: theme.colors.brand, fontSize: 11, fontWeight: '700' },
  listCard: { borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: 'rgba(37,99,235,0.14)', overflow: 'hidden', ...shadows.card },
  partyRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#ECF1F7' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFE9D7', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  partyCopy: { flex: 1 },
  partyName: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  partyMeta: { marginTop: 4, color: theme.colors.textMuted, fontSize: 12 },
  partyNotes: { marginTop: 4, color: theme.colors.brand, fontSize: 12, fontWeight: '700' },
  partyBalance: { fontSize: 15, fontWeight: '800' },
  fab: { position: 'absolute', right: 18, bottom: 26, borderRadius: 999, backgroundColor: theme.colors.brand, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8, ...shadows.card },
  fabText: { color: '#FFF', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
});
