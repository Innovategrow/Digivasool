import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { shadows, theme } from '../constants/theme';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  onRightPress?: () => void;
};

export function AppHeader({ title, subtitle, showBack = false, rightIcon = 'edit', onRightPress }: AppHeaderProps) {
  return (
    <LinearGradient colors={[theme.colors.brand, theme.colors.purple, theme.colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wrap}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.row}>
          <View style={styles.leftGroup}>
            {showBack ? (
              <Pressable style={styles.iconButton} onPress={() => router.back()}>
                <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
              </Pressable>
            ) : (
              <View style={styles.businessMark}>
                <MaterialIcons name="business" size={18} color="#FFFFFF" />
              </View>
            )}

            <View style={styles.copy}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          </View>

          {onRightPress ? (
            <Pressable style={styles.iconButton} onPress={onRightPress}>
              <MaterialIcons name={rightIcon} size={18} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={styles.iconSpacer} />
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.brand,
    ...shadows.card,
  },
  safeArea: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  businessMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: {
    width: 34,
    height: 34,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
  },
});
