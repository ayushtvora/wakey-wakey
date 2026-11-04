import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, colors, text } from './ui';

export const QR_TYPES: BarcodeType[] = ['qr'];
/** 1D product/shipping barcodes. */
export const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar'];

/**
 * Full-screen camera that reports the first code of the given kind it sees.
 * Calls onScanned at most once per opening; the parent closes it (or keeps it open to retry).
 */
export function Scanner({
  visible,
  kind,
  title,
  onScanned,
  onClose,
  message,
}: {
  visible: boolean;
  kind: 'qr' | 'barcode';
  title: string;
  onScanned: (data: string) => void;
  onClose?: () => void;
  /** Shown over the camera, e.g. "Wrong code, try again". */
  message?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const lastScan = useRef<{ data: string; at: number } | null>(null);

  const handleScan = ({ data }: { data: string }) => {
    // The camera reports the same code many times per second; debounce repeats.
    const now = Date.now();
    if (lastScan.current && lastScan.current.data === data && now - lastScan.current.at < 2000) return;
    lastScan.current = { data, at: now };
    onScanned(data);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Text style={[text.h2, styles.title]}>{title}</Text>
        {!permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={[text.body, { textAlign: 'center' }]}>Camera access is needed to scan codes.</Text>
            <Button label="Allow camera" onPress={requestPermission} />
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: kind === 'qr' ? QR_TYPES : BARCODE_TYPES }}
              onBarcodeScanned={visible ? handleScan : undefined}
            />
            <View style={[styles.frame, kind === 'barcode' && styles.frameWide]} pointerEvents="none" />
          </View>
        )}
        {message ? <Text style={[text.body, styles.message]}>{message}</Text> : null}
        {onClose ? <Button label="Cancel" variant="secondary" onPress={onClose} /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, gap: 12 },
  title: { textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', gap: 16 },
  cameraWrap: { flex: 1, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: colors.accent, borderRadius: 16 },
  frameWide: { width: 300, height: 140 },
  message: { textAlign: 'center', color: colors.accent, fontWeight: '600' },
});
