// AlarmKit spike: a single test screen to prove the alarm/challenge loop works on a
// sideloaded build before the real app is built. Replaced by expo-router screens later.
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AlarmKit, { type ScheduledAlarm, type WakeSession } from './modules/alarm-kit';

function makeProblem() {
  const a = 12 + Math.floor(Math.random() * 30);
  const b = 3 + Math.floor(Math.random() * 9);
  const c = 10 + Math.floor(Math.random() * 90);
  return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
}

export default function App() {
  const [auth, setAuth] = useState(AlarmKit.getAuthorizationState());
  const [alarms, setAlarms] = useState<ScheduledAlarm[]>([]);
  const [session, setSession] = useState<WakeSession | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [fastMode, setFastMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [problem, setProblem] = useState(makeProblem);

  const refresh = useCallback(() => {
    setAuth(AlarmKit.getAuthorizationState());
    setAlarms(AlarmKit.listAlarms());
    setSession(AlarmKit.getActiveSession());
    setLog(AlarmKit.getDebugLog().slice().reverse());
  }, []);

  useEffect(() => {
    // Fast mode: snooze 60s / re-ring 30s so the whole loop can be tested in a few minutes.
    if (fastMode) AlarmKit.setTimings(60, 30);
    else AlarmKit.setTimings(300, 60);
  }, [fastMode]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const timer = setInterval(refresh, 2000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  const run = async (fn: () => Promise<unknown> | unknown) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
    refresh();
  };

  const scheduleIn = (seconds: number) =>
    run(() => AlarmKit.scheduleAlarm(Date.now() + seconds * 1000, 'Wake up!'));

  const submitAnswer = () => {
    if (Number(answer.trim()) === problem.answer) {
      AlarmKit.completeSession();
      setAnswer('');
      setProblem(makeProblem());
      refresh();
    } else {
      setError('Wrong answer, new problem.');
      setAnswer('');
      setProblem(makeProblem());
    }
  };

  const timings = useMemo(() => (fastMode ? 'snooze 60s · re-ring 30s' : 'snooze 5m · re-ring 1m'), [fastMode]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Wakey Wakey · AlarmKit spike</Text>

        {session && (
          <View style={[styles.card, styles.challenge]}>
            <Text style={styles.h2}>Challenge ({session.state})</Text>
            <Text style={styles.muted}>
              {session.followUpAlarmIds.length} follow-up alarm(s) scheduled. Solve to stop them.
            </Text>
            <Text style={styles.problem}>{problem.text} = ?</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={answer}
              onChangeText={setAnswer}
              onSubmitEditing={submitAnswer}
              placeholder="Answer"
            />
            <Btn label="Submit" onPress={submitAnswer} />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.h2}>Permission: {auth}</Text>
          {auth !== 'authorized' && (
            <Btn label="Request AlarmKit permission" onPress={() => run(AlarmKit.requestAuthorization)} />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Schedule a test alarm</Text>
          <Text style={styles.muted}>{timings}</Text>
          <View style={styles.row}>
            <Btn label="+30 s" onPress={() => scheduleIn(30)} />
            <Btn label="+2 min" onPress={() => scheduleIn(120)} />
            <Btn label="+5 min" onPress={() => scheduleIn(300)} />
          </View>
          <Btn
            label={fastMode ? 'Fast mode: ON' : 'Fast mode: OFF'}
            onPress={() => setFastMode((f) => !f)}
            secondary
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Scheduled alarms ({alarms.length})</Text>
          {alarms.map((a) => (
            <View key={a.id} style={styles.alarmRow}>
              <Text style={styles.mono}>
                {a.id.slice(0, 8)} · {a.state}
                {a.fireDate ? ` · ${new Date(a.fireDate).toLocaleTimeString()}` : ''}
                {a.title ? `\n${a.title}` : ''}
              </Text>
              <Btn label="Cancel" secondary onPress={() => run(() => AlarmKit.cancelAlarm(a.id))} />
            </View>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.h2}>Debug log</Text>
            <Btn label="Clear" secondary onPress={() => run(AlarmKit.clearDebugLog)} />
          </View>
          {log.map((line, i) => (
            <Text key={i} style={styles.mono}>
              {line}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Btn({ label, onPress, secondary }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, secondary && styles.btnSecondary, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.btnText, secondary && styles.btnTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f1ec' },
  content: { padding: 16, gap: 12 },
  h1: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  h2: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#666' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10 },
  challenge: { borderWidth: 2, borderColor: '#f28c28' },
  problem: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 22, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alarmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  btn: { backgroundColor: '#f28c28', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center' },
  btnSecondary: { backgroundColor: '#eee' },
  btnText: { color: '#fff', fontWeight: '600' },
  btnTextSecondary: { color: '#333' },
  mono: { fontFamily: 'Menlo', fontSize: 12, color: '#333', flexShrink: 1 },
  error: { color: '#c0392b' },
});
