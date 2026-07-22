import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';

export default function App() {
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
  }
});
