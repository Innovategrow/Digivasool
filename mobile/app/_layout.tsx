import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cashbook-report" options={{ presentation: 'card' }} />
        <Stack.Screen name="collection-entry" options={{ presentation: 'card' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
