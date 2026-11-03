import { PUNISH_AFTER_MS, describeStep, type ChallengeChain, type ChallengeStep } from '@wakey/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AlarmKit, { type WakeSession } from '../../modules/alarm-kit';
import { MathChallenge, ScanChallenge, StepsChallenge } from '../components/challenges';
import { Button, Card, colors, text } from '../components/ui';
import { getAlarm } from '../lib/store';
import { computeStreaks, reconcile } from '../lib/wake';

const FALLBACK_CHAIN: ChallengeChain = [{ type: 'math', difficulty: 'medium', problems: 3 }];

function progressKey(sessionId: string) {
  return `progress:${sessionId}`;
}

export default function Challenge() {
  const [session] = useState<WakeSession | null>(() => AlarmKit.getActiveSession());
  const chain = useMemo(() => (session && getAlarm(session.appAlarmId)?.chain) || FALLBACK_CHAIN, [session]);
  // Progress survives the app being closed while snoozed.
  const [index, setIndex] = useState(() =>
    session ? Number(AlarmKit.getItem(progressKey(session.sessionId)) ?? 0) : 0,
  );
  const [finished, setFinished] = useState<WakeSession | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const stepDone = () => {
    if (!session) return;
    const next = index + 1;
    if (next < chain.length) {
      AlarmKit.setItem(progressKey(session.sessionId), String(next));
      setIndex(next);
      return;
    }
    AlarmKit.setItem(progressKey(session.sessionId), null);
    const completed = AlarmKit.completeSession(session.sessionId) ?? session;
    setFinished({ ...completed, completedAt: completed.completedAt ?? Date.now() });
    reconcile().catch(() => {});
  };

  if (finished) return <Finished session={finished} />;

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={text.h2}>No alarm is ringing.</Text>
        <Button label="Back" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const remaining = session.firstRangAt + PUNISH_AFTER_MS - now;
  const step = chain[index] as ChallengeStep;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={text.h1}>{session.label}</Text>
      <Text style={[text.body, remaining <= 0 && { color: colors.danger }]}>
        {remaining > 0
          ? `${formatCountdown(remaining)} left to keep your streak${session.isTest ? ' (test)' : ''}`
          : 'Too late for the streak, but the alarm keeps ringing until you finish.'}
      </Text>

      <View style={styles.progressRow}>
        {chain.map((s, i) => (
          <View key={i} style={[styles.dot, i < index && styles.dotDone, i === index && styles.dotCurrent]} />
        ))}
      </View>
      <Text style={text.muted}>
        Step {index + 1} of {chain.length}: {describeStep(step)}
      </Text>

      <StepView key={`${session.sessionId}-${index}`} step={step} onDone={stepDone} />
    </ScrollView>
  );
}

function StepView({ step, onDone }: { step: ChallengeStep; onDone: () => void }) {
  switch (step.type) {
    case 'math':
      return <MathChallenge step={step} onDone={onDone} />;
    case 'qr':
    case 'barcode':
      return <ScanChallenge step={step} onDone={onDone} />;
    case 'steps':
      return <StepsChallenge step={step} onDone={onDone} />;
  }
}

function Finished({ session }: { session: WakeSession }) {
  const won = (session.completedAt ?? Date.now()) - session.firstRangAt <= PUNISH_AFTER_MS;
  const streak = computeStreaks(AlarmKit.getHistory()).current;
  return (
    <View style={styles.center}>
      <Text style={styles.big}>{won ? '☀️' : '😴'}</Text>
      <Text style={text.h1}>{won ? "You're up!" : 'Finally up.'}</Text>
      <Card style={{ alignSelf: 'stretch', alignItems: 'center' }}>
        <Text style={text.body}>
          {session.isTest
            ? 'Test alarm finished. It doesn’t count toward your streak.'
            : won
              ? `Streak: 🔥 ${streak} day${streak === 1 ? '' : 's'}`
              : 'That took more than 10 minutes, so the streak is reset.'}
        </Text>
      </Card>
      <Button label="Done" style={{ alignSelf: 'stretch' }} onPress={() => router.replace('/')} />
    </View>
  );
}

function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 64 },
  center: { flex: 1, padding: 24, gap: 16, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 72 },
  progressRow: { flexDirection: 'row', gap: 8 },
  dot: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.cardRaised },
  dotDone: { backgroundColor: colors.success },
  dotCurrent: { backgroundColor: colors.accent },
});
