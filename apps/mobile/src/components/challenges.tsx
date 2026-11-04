// One component per challenge type. Each calls onDone() once its step is passed.
import {
  checkMathAnswer,
  checkScan,
  generateMathProblem,
  stepsProgress,
  type BarcodeStep,
  type MathStep,
  type QrStep,
  type StepsStep,
} from '@wakey/core';
import { Pedometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Scanner } from './Scanner';
import { Button, Card, colors, text } from './ui';

export function MathChallenge({ step, onDone }: { step: MathStep; onDone: () => void }) {
  const [solved, setSolved] = useState(0);
  const [problem, setProblem] = useState(() => generateMathProblem(step.difficulty));
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = () => {
    if (checkMathAnswer(problem, answer)) {
      const next = solved + 1;
      if (next >= step.problems) return onDone();
      setSolved(next);
      setWrong(false);
    } else {
      setWrong(true);
    }
    // Wrong answers get a fresh problem so you can't just keep guessing.
    setProblem(generateMathProblem(step.difficulty));
    setAnswer('');
  };

  return (
    <Card>
      <Text style={text.muted}>
        Problem {solved + 1} of {step.problems}
      </Text>
      <Text style={styles.expression}>{problem.expression}</Text>
      <TextInput
        style={styles.input}
        value={answer}
        onChangeText={setAnswer}
        onSubmitEditing={submit}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        placeholder="Answer"
        placeholderTextColor={colors.muted}
        autoFocus
      />
      {wrong ? <Text style={text.error}>Wrong. Here's a new one.</Text> : null}
      <Button label="Submit" onPress={submit} disabled={answer.trim() === ''} />
    </Card>
  );
}

export function ScanChallenge({ step, onDone }: { step: QrStep | BarcodeStep; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const noun = step.type === 'qr' ? 'QR code' : 'barcode';

  const onScanned = (data: string) => {
    if (checkScan(step, { kind: step.type, data })) {
      setOpen(false);
      onDone();
    } else {
      setMessage(`That's not the right ${noun}.`);
    }
  };

  return (
    <Card>
      <Text style={text.h2}>Scan the {noun}</Text>
      <Text style={text.body}>{step.label ? `Go to: ${step.label}` : `Find your registered ${noun}.`}</Text>
      <Button label={`Open scanner`} onPress={() => { setMessage(undefined); setOpen(true); }} />
      <Scanner
        visible={open}
        kind={step.type}
        title={step.label ? `Scan: ${step.label}` : `Scan your ${noun}`}
        message={message}
        onScanned={onScanned}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}

export function StepsChallenge({ step, onDone }: { step: StepsStep; onDone: () => void }) {
  const [walked, setWalked] = useState(0);
  const [status, setStatus] = useState<'checking' | 'ok' | 'denied' | 'unavailable'>('checking');

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      if (!(await Pedometer.isAvailableAsync())) return setStatus('unavailable');
      const perm = await Pedometer.requestPermissionsAsync();
      if (!perm.granted) return setStatus('denied');
      if (cancelled) return;
      setStatus('ok');
      // Counts steps taken since this subscription started.
      sub = Pedometer.watchStepCount(({ steps }) => setWalked(steps));
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (walked >= step.count) onDone();
    // onDone is stable enough for this; only react to the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walked, step.count]);

  const progress = stepsProgress(step.count, walked);
  return (
    <Card>
      <Text style={text.h2}>Walk {step.count} steps</Text>
      {status === 'denied' ? (
        <Text style={text.error}>Motion access is off. Enable it in Settings → Wakey Wakey → Motion & Fitness.</Text>
      ) : status === 'unavailable' ? (
        <Text style={text.error}>Step counting isn't available on this device.</Text>
      ) : (
        <>
          <Text style={styles.expression}>
            {Math.min(walked, step.count)} / {step.count}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={text.muted}>Keep the phone with you. Steps can take a few seconds to show up.</Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  expression: { color: colors.text, fontSize: 40, fontWeight: '700', textAlign: 'center', marginVertical: 8 },
  input: {
    backgroundColor: colors.cardRaised,
    color: colors.text,
    borderRadius: 12,
    padding: 14,
    fontSize: 24,
    textAlign: 'center',
  },
  track: { height: 12, backgroundColor: colors.cardRaised, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
});
