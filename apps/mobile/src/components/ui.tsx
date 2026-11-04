import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#0f1115',
  card: '#1a1d24',
  cardRaised: '#232731',
  border: '#2d323d',
  text: '#f2f3f5',
  muted: '#9aa1ad',
  accent: '#ff9f43',
  accentText: '#1a1205',
  danger: '#ff5c5c',
  success: '#4cd38a',
};

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'danger' && styles.btnDanger,
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
        style,
      ]}
    >
      <Text style={[styles.btnText, variant !== 'primary' && { color: variant === 'danger' ? colors.danger : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = String,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <View style={styles.stepper}>
      <Button label="−" variant="secondary" style={styles.stepperBtn} disabled={value <= min} onPress={() => onChange(Math.max(min, value - step))} />
      <Text style={styles.stepperValue}>{format(value)}</Text>
      <Button label="+" variant="secondary" style={styles.stepperBtn} disabled={value >= max} onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export const text = StyleSheet.create({
  h1: { color: colors.text, fontSize: 28, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '600' },
  body: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 12 },
  btn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnSecondary: { backgroundColor: colors.cardRaised },
  btnDanger: { backgroundColor: colors.cardRaised },
  btnText: { color: colors.accentText, fontWeight: '700', fontSize: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.cardRaised },
  chipSelected: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  stepperValue: { color: colors.text, fontSize: 18, fontWeight: '600', minWidth: 56, textAlign: 'center' },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
});
