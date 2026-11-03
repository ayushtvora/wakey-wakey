import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import AlarmKit from '../../modules/alarm-kit';
import { colors } from '../components/ui';
import { reconcile } from '../lib/wake';

export default function RootLayout() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const onActive = () => {
      reconcile().catch((e) => console.warn('reconcile failed', e));
      // A ringing alarm's "Start challenge" button opens the app: go straight to the challenge.
      if (AlarmKit.getActiveSession() && pathRef.current !== '/challenge') {
        router.push('/challenge');
      }
    };
    onActive();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && onActive());
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Wakey Wakey' }} />
        <Stack.Screen name="alarm/[id]" options={{ title: 'Alarm', presentation: 'modal' }} />
        <Stack.Screen name="challenge" options={{ title: 'Wake up', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
