import {
  MATH_PROBLEMS_RANGE,
  MAX_CHAIN_LENGTH,
  STEPS_RANGE,
  type ChallengeChain,
  type ChallengeStep,
  type Difficulty,
} from '@wakey/core';
import { randomUUID } from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Scanner } from './Scanner';
import { Button, Card, Chip, Stepper, colors, text } from './ui';

const NEW_STEP: Record<ChallengeStep['type'], () => ChallengeStep> = {
  math: () => ({ type: 'math', difficulty: 'medium', problems: 3 }),
  qr: () => ({ type: 'qr', code: '', label: '' }),
  barcode: () => ({ type: 'barcode', code: '', label: '' }),
  steps: () => ({ type: 'steps', count: 50 }),
};

const TYPE_NAMES: Record<ChallengeStep['type'], string> = {
  math: 'Math',
  qr: 'QR code',
  barcode: 'Barcode',
  steps: 'Steps',
};

export function ChainEditor({ chain, onChange }: { chain: ChallengeChain; onChange: (c: ChallengeChain) => void }) {
  const [scanning, setScanning] = useState<number | null>(null);

  const update = (i: number, step: ChallengeStep) => onChange(chain.map((s, j) => (j === i ? step : s)));
  const remove = (i: number) => onChange(chain.filter((_, j) => j !== i));
  const move = (i: number, by: -1 | 1) => {
    const next = [...chain];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    onChange(next);
  };

  const scanningStep = scanning === null ? undefined : chain[scanning];

  return (
    <View style={{ gap: 12 }}>
      {chain.map((step, i) => (
        <Card key={i}>
          <View style={styles.header}>
            <Text style={text.h2}>
              {i + 1}. {TYPE_NAMES[step.type]}
            </Text>
            <View style={styles.headerButtons}>
              <Button label="↑" variant="secondary" style={styles.small} disabled={i === 0} onPress={() => move(i, -1)} />
              <Button label="↓" variant="secondary" style={styles.small} disabled={i === chain.length - 1} onPress={() => move(i, 1)} />
              <Button label="✕" variant="danger" style={styles.small} onPress={() => remove(i)} />
            </View>
          </View>
          <StepFields step={step} onChange={(s) => update(i, s)} onScan={() => setScanning(i)} />
        </Card>
      ))}

      {chain.length < MAX_CHAIN_LENGTH ? (
        <View style={styles.addRow}>
          <Text style={text.muted}>Add:</Text>
          {(Object.keys(NEW_STEP) as ChallengeStep['type'][]).map((type) => (
            <Chip key={type} label={`+ ${TYPE_NAMES[type]}`} selected={false} onPress={() => onChange([...chain, NEW_STEP[type]()])} />
          ))}
        </View>
      ) : (
        <Text style={text.muted}>Maximum of {MAX_CHAIN_LENGTH} challenges.</Text>
      )}

      {scanningStep && (scanningStep.type === 'qr' || scanningStep.type === 'barcode') ? (
        <Scanner
          visible
          kind={scanningStep.type}
          title={`Register a ${scanningStep.type === 'qr' ? 'QR code' : 'barcode'}`}
          onScanned={(data) => {
            update(scanning!, { ...scanningStep, code: data.trim() });
            setScanning(null);
          }}
          onClose={() => setScanning(null)}
        />
      ) : null}
    </View>
  );
}

function StepFields({
  step,
  onChange,
  onScan,
}: {
  step: ChallengeStep;
  onChange: (s: ChallengeStep) => void;
  onScan: () => void;
}) {
  switch (step.type) {
    case 'math':
      return (
        <>
          <View style={styles.row}>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <Chip key={d} label={d} selected={step.difficulty === d} onPress={() => onChange({ ...step, difficulty: d })} />
            ))}
          </View>
          <View style={styles.rowBetween}>
            <Text style={text.body}>Problems</Text>
            <Stepper
              value={step.problems}
              min={MATH_PROBLEMS_RANGE.min}
              max={MATH_PROBLEMS_RANGE.max}
              onChange={(problems) => onChange({ ...step, problems })}
            />
          </View>
        </>
      );
    case 'steps':
      return (
        <View style={styles.rowBetween}>
          <Text style={text.body}>Steps</Text>
          <Stepper
            value={step.count}
            min={STEPS_RANGE.min}
            max={STEPS_RANGE.max}
            step={10}
            onChange={(count) => onChange({ ...step, count })}
          />
        </View>
      );
    case 'qr':
    case 'barcode': {
      const noun = step.type === 'qr' ? 'QR code' : 'barcode';
      return (
        <>
          <TextInput
            style={styles.input}
            value={step.label}
            onChangeText={(label) => onChange({ ...step, label })}
            placeholder={step.type === 'qr' ? 'Where is it? e.g. Bathroom mirror' : 'What is it? e.g. Toothpaste'}
            placeholderTextColor={colors.muted}
          />
          <Text style={step.code ? text.muted : text.error}>
            {step.code ? `Registered: ${step.code.length > 40 ? `${step.code.slice(0, 40)}…` : step.code}` : `No ${noun} registered yet`}
          </Text>
          <Button label={step.code ? `Re-scan ${noun}` : `Scan ${noun} to register`} variant="secondary" onPress={onScan} />
          {step.type === 'qr' ? (
            <Button
              label="Make a printable QR code"
              variant="secondary"
              onPress={() => {
                const code = `wakey-${randomUUID()}`;
                onChange({ ...step, code });
                Linking.openURL(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(code)}`);
              }}
            />
          ) : null}
        </>
      );
    }
  }
}


const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerButtons: { flexDirection: 'row', gap: 6 },
  small: { paddingVertical: 6, paddingHorizontal: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { backgroundColor: colors.cardRaised, color: colors.text, borderRadius: 12, padding: 12, fontSize: 16 },
});
