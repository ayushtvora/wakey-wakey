import { validateAlarm, type Weekday } from '@wakey/core';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import AlarmKit from '../../../modules/alarm-kit';
import { ChainEditor } from '../../components/ChainEditor';
import { Button, Chip, SectionTitle, Stepper, colors, text } from '../../components/ui';
import { deleteAlarm, getAlarm, newAlarm, saveAlarm, toSpec, type StoredAlarm } from '../../lib/store';
import { reportTestAlarm } from '../../lib/watchdog';
import { afterAlarmChange } from '../../lib/wake';

const DAY_LABELS: [Weekday, string][] = [
  [1, 'M'],
  [2, 'T'],
  [3, 'W'],
  [4, 'T'],
  [5, 'F'],
  [6, 'S'],
  [0, 'S'],
];

export default function EditAlarm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = id && id !== 'new' ? getAlarm(id) : undefined;
  const [alarm, setAlarm] = useState<StoredAlarm>(() => existing ?? newAlarm());
  const [errors, setErrors] = useState<string[]>([]);

  const set = (patch: Partial<StoredAlarm>) => setAlarm((a) => ({ ...a, ...patch }));
  const time = new Date(2000, 0, 1, alarm.hour, alarm.minute);

  const toggleDay = (d: Weekday) =>
    set({ days: alarm.days.includes(d) ? alarm.days.filter((x) => x !== d) : [...alarm.days, d].sort() });

  const save = async () => {
    const problems = validateAlarm(alarm);
    setErrors(problems);
    if (problems.length > 0) return;
    await saveAlarm({ ...alarm, enabled: existing ? alarm.enabled : true });
    void afterAlarmChange();
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete alarm?', alarm.label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteAlarm(alarm.id);
          void afterAlarmChange();
          router.back();
        },
      },
    ]);

  const test = async () => {
    const problems = validateAlarm(alarm);
    setErrors(problems);
    if (problems.length > 0) return;
    // Save first so the challenge screen finds this exact chain when the test alarm rings.
    await saveAlarm(alarm);
    void afterAlarmChange();
    await AlarmKit.scheduleTestAlarm(toSpec(alarm), 60);
    await reportTestAlarm(alarm, Date.now() + 60_000);
    Alert.alert('Test alarm set', 'It will ring in about 1 minute. Lock your phone to try the full flow.');
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <DateTimePicker
          value={time}
          mode="time"
          display="spinner"
          themeVariant="dark"
          onChange={(_, d) => d && set({ hour: d.getHours(), minute: d.getMinutes() })}
        />

        <SectionTitle>Label</SectionTitle>
        <TextInput
          style={styles.input}
          value={alarm.label}
          onChangeText={(label) => set({ label })}
          placeholder="Alarm"
          placeholderTextColor={colors.muted}
        />

        <SectionTitle>Repeat</SectionTitle>
        <View style={styles.days}>
          {DAY_LABELS.map(([d, label]) => (
            <Chip key={d} label={label} selected={alarm.days.includes(d)} onPress={() => toggleDay(d)} />
          ))}
        </View>
        <Text style={text.muted}>{alarm.days.length === 0 ? 'Rings once.' : ''}</Text>

        <SectionTitle>Snooze while doing the challenge</SectionTitle>
        <Stepper
          value={alarm.snoozeMinutes}
          min={1}
          max={30}
          format={(v) => `${v} min`}
          onChange={(snoozeMinutes) => set({ snoozeMinutes })}
        />

        <SectionTitle>Challenges (in order)</SectionTitle>
        <ChainEditor chain={alarm.chain} onChange={(chain) => set({ chain })} />

        {errors.length > 0 ? (
          <View>
            {errors.map((e) => (
              <Text key={e} style={text.error}>
                • {e}
              </Text>
            ))}
          </View>
        ) : null}

        <Button label="Save" onPress={save} />
        <Button label="Test: ring in 1 minute" variant="secondary" onPress={test} />
        {existing ? <Button label="Delete alarm" variant="danger" onPress={remove} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 64 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 14, fontSize: 16 },
  days: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});
