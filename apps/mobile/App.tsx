import React, { useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(hour: number, minute: number) {
  const normalizedHour = hour.toString().padStart(2, '0');
  const normalizedMinute = minute.toString().padStart(2, '0');
  return `${normalizedHour}:${normalizedMinute}`;
}

export default function App() {
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(30);

  const increaseHour = () => setHour((currentHour) => (currentHour + 1) % 24);
  const decreaseHour = () => setHour((currentHour) => (currentHour + 23) % 24);
  const increaseMinute = () => setMinute((currentMinute) => (currentMinute + 5) % 60);
  const decreaseMinute = () => setMinute((currentMinute) => (currentMinute + 55) % 60);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hero}>
        <Text style={styles.kicker}>Wakey Wakey</Text>
        <Text style={styles.title}>Smart alarms that still wake you up.</Text>
        <Text style={styles.description}>
          The server stores your users, schedules, and challenges. The phone keeps the next alarm ready so it can ring even if the server is unavailable.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Set alarm day and time</Text>
        <Text style={styles.cardBody}>Pick a day of the week and adjust the time below.</Text>

        <View style={styles.daySelector}>
          {DAYS_OF_WEEK.map((day) => {
            const isSelected = day === selectedDay;
            return (
              <Pressable
                key={day}
                onPress={() => setSelectedDay(day)}
                style={[styles.dayButton, isSelected && styles.dayButtonSelected]}
              >
                <Text style={[styles.dayButtonText, isSelected && styles.dayButtonTextSelected]}>{day.slice(0, 3)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.timeEditor}>
          <View style={styles.timeColumn}>
            <Text style={styles.timeLabel}>Hour</Text>
            <View style={styles.timeStepper}>
              <Pressable style={styles.stepperButton} onPress={decreaseHour}>
                <Text style={styles.stepperButtonText}>-</Text>
              </Pressable>
              <Text style={styles.timeValue}>{hour.toString().padStart(2, '0')}</Text>
              <Pressable style={styles.stepperButton} onPress={increaseHour}>
                <Text style={styles.stepperButtonText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.timeColumn}>
            <Text style={styles.timeLabel}>Minute</Text>
            <View style={styles.timeStepper}>
              <Pressable style={styles.stepperButton} onPress={decreaseMinute}>
                <Text style={styles.stepperButtonText}>-</Text>
              </Pressable>
              <Text style={styles.timeValue}>{minute.toString().padStart(2, '0')}</Text>
              <Pressable style={styles.stepperButton} onPress={increaseMinute}>
                <Text style={styles.stepperButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.selectionSummary}>Alarm set for {selectedDay} at {formatTime(hour, minute)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Planned challenge types</Text>
        <Text style={styles.cardBody}>QR scan, math, reading comprehension, and puzzle unlocks.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reliability model</Text>
        <Text style={styles.cardBody}>Server-first data, local trigger backup, and sync when connectivity returns.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0d1321',
    padding: 24,
    gap: 16
  },
  hero: {
    marginTop: 24,
    padding: 24,
    borderRadius: 28,
    backgroundColor: '#1d2d44'
  },
  kicker: {
    color: '#f4d35e',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12
  },
  title: {
    color: '#f8f9fa',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    marginBottom: 12
  },
  description: {
    color: '#d9e2ec',
    fontSize: 16,
    lineHeight: 24
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#102a43',
    borderWidth: 1,
    borderColor: '#243b53'
  },
  cardTitle: {
    color: '#f8f9fa',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  cardBody: {
    color: '#bcccdc',
    fontSize: 15,
    lineHeight: 22
  },
  daySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16
  },
  dayButton: {
    width: 46,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#486581',
    backgroundColor: '#243b53',
    alignItems: 'center'
  },
  dayButtonSelected: {
    backgroundColor: '#f4d35e',
    borderColor: '#f4d35e'
  },
  dayButtonText: {
    color: '#d9e2ec',
    fontSize: 13,
    fontWeight: '700'
  },
  dayButtonTextSelected: {
    color: '#102a43'
  },
  timeEditor: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16
  },
  timeColumn: {
    flex: 1,
    gap: 8
  },
  timeLabel: {
    color: '#d9e2ec',
    fontSize: 14,
    fontWeight: '600'
  },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#486581',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#243b53'
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#102a43',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepperButtonText: {
    color: '#f8f9fa',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700'
  },
  timeValue: {
    color: '#f8f9fa',
    fontSize: 22,
    fontWeight: '700'
  },
  selectionSummary: {
    color: '#f4d35e',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16
  }
});
