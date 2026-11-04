import { isDiscordWebhookUrl, outcome } from '@wakey/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import AlarmKit, { type ScheduledAlarm, type WakeSession } from '../../modules/alarm-kit';
import { Button, Card, SectionTitle, colors, text } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { getExpiryStatus } from '../lib/signing';
import { updateSettings, useAppState } from '../lib/store';
import { reconcile, sendDiscord, toWakeRecord } from '../lib/wake';

export default function Settings() {
  const { settings } = useAppState();
  const [history, setHistory] = useState<WakeSession[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledAlarm[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const refresh = useCallback(() => {
    setHistory(AlarmKit.getHistory().slice().reverse());
    setScheduled(AlarmKit.listAlarms());
    setLog(AlarmKit.getDebugLog().slice().reverse());
  }, []);
  useFocusEffect(refresh);

  const webhookValid = isDiscordWebhookUrl(settings.webhookUrl);

  const change = (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch);
    reconcile().catch(() => {});
  };

  const sendTest = async () => {
    const ok = await sendDiscord(settings.webhookUrl.trim(), {
      username: 'Wakey Wakey',
      content: `🔔 Test from Wakey Wakey: ${settings.userName.trim() || 'Someone'} set up wake-up accountability. You'll hear from me if they oversleep.`,
    });
    Alert.alert(ok ? 'Sent' : 'Failed', ok ? 'Check your Discord channel.' : 'Discord rejected the message. Check the URL.');
  };

  const now = Date.now();

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>Punishment</SectionTitle>
      <Card>
        <Text style={text.body}>
          If an alarm isn't finished within 10 minutes of first ringing, a message is posted to a Discord channel.
        </Text>
        <TextInput
          style={styles.input}
          value={settings.userName}
          onChangeText={(userName) => change({ userName })}
          placeholder="Your name (used in the message)"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={styles.input}
          value={settings.webhookUrl}
          onChangeText={(webhookUrl) => change({ webhookUrl })}
          placeholder="Discord webhook URL"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {settings.webhookUrl && !webhookValid ? (
          <Text style={text.error}>That doesn't look like a Discord webhook URL.</Text>
        ) : null}
        <Text style={text.muted}>
          In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
        </Text>
        <View style={styles.rowBetween}>
          <Text style={text.body}>Send punishment messages</Text>
          <Switch
            value={settings.punishmentEnabled}
            onValueChange={(punishmentEnabled) => change({ punishmentEnabled })}
            disabled={!webhookValid}
            trackColor={{ true: colors.accent, false: colors.cardRaised }}
          />
        </View>
        <Button label="Send test message" variant="secondary" disabled={!webhookValid} onPress={sendTest} />
        <Text style={text.muted}>
          The message is sent the next time you touch the alarm or open the app after the 10 minutes, so it can't
          reach Discord while the phone is off.
        </Text>
      </Card>

      <SectionTitle>History</SectionTitle>
      <Card>
        {history.length === 0 ? <Text style={text.muted}>No mornings yet.</Text> : null}
        {history.slice(0, 30).map((s) => {
          const o = outcome(toWakeRecord(s), now);
          const mins = s.completedAt ? Math.round((s.completedAt - s.firstRangAt) / 60000) : null;
          return (
            <View key={s.sessionId} style={styles.historyRow}>
              <Text style={[text.body, { flex: 1 }]}>
                {formatDateTime(s.firstRangAt)} · {s.label}
                {s.isTest ? ' (test)' : ''}
              </Text>
              <Text style={[text.body, { color: o === 'won' ? colors.success : o === 'late' ? colors.danger : colors.accent }]}>
                {o === 'won' ? `✓ ${mins}m` : o === 'pending' ? 'ringing' : s.state === 'missed' ? 'missed' : mins !== null ? `late ${mins}m` : 'late'}
                {s.punishedAt ? ' · 📣' : ''}
              </Text>
            </View>
          );
        })}
      </Card>

      <Button label={showDebug ? 'Hide debug info' : 'Show debug info'} variant="secondary" onPress={() => { refresh(); setShowDebug((v) => !v); }} />
      {showDebug ? (
        <>
          <Card>
            <Text style={text.h2}>Permission: {AlarmKit.getAuthorizationState()}</Text>
            <Text style={styles.mono}>
              {(() => {
                const e = getExpiryStatus();
                if (!e) return 'Signing: no provisioning profile (or old build)';
                return `Signed ${e.createdAt ? formatDateTime(e.createdAt) : '?'} · expires ${formatDateTime(e.expiresAt)}${e.teamName ? ` · ${e.teamName}` : ''}`;
              })()}
            </Text>
            <Text style={text.h2}>Scheduled in AlarmKit ({scheduled.length})</Text>
            {scheduled.map((a) => (
              <Text key={a.id} style={styles.mono}>
                {a.id.slice(0, 8)} {a.kind} {a.state} {a.label}
                {a.fireDate ? ` @ ${new Date(a.fireDate).toLocaleTimeString()}` : ''}
              </Text>
            ))}
          </Card>
          <Card>
            <View style={styles.rowBetween}>
              <Text style={text.h2}>Log</Text>
              <Button label="Clear" variant="secondary" onPress={() => { AlarmKit.clearDebugLog(); refresh(); }} />
            </View>
            {log.slice(0, 150).map((line, i) => (
              <Text key={i} style={styles.mono}>
                {line}
              </Text>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 64 },
  input: { backgroundColor: colors.cardRaised, color: colors.text, borderRadius: 12, padding: 12, fontSize: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: colors.muted },
});
