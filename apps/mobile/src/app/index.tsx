import { describeChain, describeDays } from '@wakey/core';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import AlarmKit, { type WakeSession } from '../../modules/alarm-kit';
import { Button, Card, colors, text } from '../components/ui';
import { formatDateTime, formatTime } from '../lib/format';
import { describeTimeLeft, getExpiryStatus } from '../lib/signing';
import { setAlarmEnabled, useAppState } from '../lib/store';
import { afterAlarmChange, computeStreaks, reconcile } from '../lib/wake';
import { watchdogOutOfDate } from '../lib/watchdog';

export default function Home() {
  const { alarms, settings } = useAppState();
  const [history, setHistory] = useState<WakeSession[]>([]);
  const [active, setActive] = useState<WakeSession | null>(null);
  const [auth, setAuth] = useState(AlarmKit.getAuthorizationState());
  const [expiry, setExpiry] = useState(getExpiryStatus);

  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        setHistory(AlarmKit.getHistory());
        setActive(AlarmKit.getActiveSession());
        setAuth(AlarmKit.getAuthorizationState());
        setExpiry(getExpiryStatus());
      };
      refresh();
      reconcile().then(refresh, refresh);
      const t = setInterval(refresh, 5000);
      return () => clearInterval(t);
    }, []),
  );

  const streaks = computeStreaks(history);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.streakRow}>
        <Card style={styles.streakCard}>
          <Text style={styles.streakNumber}>🔥 {streaks.current}</Text>
          <Text style={text.muted}>day streak</Text>
        </Card>
        <Card style={styles.streakCard}>
          <Text style={styles.streakNumber}>{streaks.best}</Text>
          <Text style={text.muted}>best streak</Text>
        </Card>
      </View>

      {auth !== 'authorized' ? (
        <Card style={styles.warning}>
          <Text style={text.h2}>Allow alarms</Text>
          <Text style={text.body}>
            {auth === 'denied'
              ? 'Alarms are turned off for Wakey Wakey. Turn them on in Settings → Wakey Wakey.'
              : 'Wakey Wakey needs permission to ring alarms when the app is closed.'}
          </Text>
          {auth !== 'denied' ? (
            <Button label="Allow" onPress={() => AlarmKit.requestAuthorization().then(setAuth)} />
          ) : null}
        </Card>
      ) : null}

      {expiry && (expiry.level === 'soon' || expiry.level === 'urgent') ? (
        <Card style={[styles.warning, expiry.level === 'urgent' && { borderColor: colors.danger }]}>
          <Text style={text.h2}>⚠️ App expires in {describeTimeLeft(expiry.msLeft)}</Text>
          <Text style={text.body}>
            On {formatDateTime(expiry.expiresAt)} the app stops opening and your alarms stop ringing. Refresh it in
            SideStore (or reinstall with Sideloadly) before then.
            {expiry.lastRefreshAt
              ? ` Last refresh: ${formatDateTime(expiry.lastRefreshAt)}. Check that your Refresh Wakey shortcut is still running.`
              : ''}
          </Text>
        </Card>
      ) : null}

      {watchdogOutOfDate(Date.now(), settings) ? (
        <Card style={[styles.warning, { borderColor: colors.danger }]}>
          <Text style={text.h2}>⚠️ Watchdog can&apos;t be reached</Text>
          <Text style={text.body}>
            {settings.lastWatchdogSyncAt
              ? `It last got your alarms ${formatDateTime(settings.lastWatchdogSyncAt)}, so it doesn't know about changes since then.`
              : "It hasn't got your alarms yet."}{' '}
            Check this phone&apos;s internet connection; Settings → Watchdog shows the error.
          </Text>
          <Button label="Open Settings" onPress={() => router.push('/settings')} />
        </Card>
      ) : null}

      {active ? (
        <Card style={styles.warning}>
          <Text style={text.h2}>⏰ {active.label} is ringing</Text>
          <Text style={text.body}>Finish the challenge to turn it off.</Text>
          <Button label="Go to challenge" onPress={() => router.push('/challenge')} />
        </Card>
      ) : null}

      {alarms.length === 0 ? (
        <Card>
          <Text style={text.body}>No alarms yet.</Text>
        </Card>
      ) : (
        alarms.map((a) => (
          <Link key={a.id} href={{ pathname: '/alarm/[id]', params: { id: a.id } }} asChild>
            <Pressable>
              <Card style={!a.enabled && { opacity: 0.55 }}>
                <View style={styles.alarmTop}>
                  <View>
                    <Text style={styles.time}>{formatTime(a.hour, a.minute)}</Text>
                    <Text style={text.body}>
                      {a.label} · {describeDays(a.days)}
                    </Text>
                  </View>
                  <Switch
                    value={a.enabled}
                    onValueChange={(v) => setAlarmEnabled(a.id, v).then(afterAlarmChange)}
                    trackColor={{ true: colors.accent, false: colors.cardRaised }}
                  />
                </View>
                <Text style={text.muted}>{describeChain(a.chain)}</Text>
              </Card>
            </Pressable>
          </Link>
        ))
      )}

      <Button label="+ New alarm" onPress={() => router.push({ pathname: '/alarm/[id]', params: { id: 'new' } })} />
      <Button label="Settings" variant="secondary" onPress={() => router.push('/settings')} />
      {expiry && expiry.level === 'ok' ? (
        <Text style={[text.muted, styles.footer]}>
          Install expires {formatDateTime(expiry.expiresAt)} ({describeTimeLeft(expiry.msLeft)})
          {expiry.lastRefreshAt ? ` · refreshed ${formatDateTime(expiry.lastRefreshAt)}` : ''}
        </Text>
      ) : null}
      {expiry && expiry.level === 'unknown' ? (
        <Text style={[text.muted, styles.footer]}>
          Refreshed in SideStore; check its My Apps tab for the expiry date. Add Wakey&apos;s &quot;Record SideStore
          Refresh&quot; action after &quot;Refresh All Apps&quot; in your shortcut so this app can track it.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  streakRow: { flexDirection: 'row', gap: 12 },
  streakCard: { flex: 1, alignItems: 'center', gap: 4 },
  streakNumber: { color: colors.text, fontSize: 32, fontWeight: '800' },
  warning: { borderWidth: 1, borderColor: colors.accent },
  alarmTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { textAlign: 'center' },
  time: { color: colors.text, fontSize: 44, fontWeight: '300', fontVariant: ['tabular-nums'] },
});
