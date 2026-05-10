import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { AppHeader } from '../../components/AppHeader';
import { AdminLendingPanel } from '../../components/AdminLendingPanel';
import { theme } from '../../constants/theme';

export default function AdminScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Admin Lending" subtitle="Interest and reminder control" showBack />
      <AdminLendingPanel />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
