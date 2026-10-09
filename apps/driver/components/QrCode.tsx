import { View } from 'react-native';
import { useMemo } from 'react';
import QRCode from 'qrcode';

/**
 * A QR code rendered as a grid of plain Views — no native module, so it works
 * the same on Android, iOS and web. `qrcode` only builds the module matrix
 * here (pure JS); we paint it. Used on the driver's screen for Pair Ride: the
 * rider scans it to pair and the driver then starts the trip.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const matrix = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    return { count: qr.modules.size, data: qr.modules.data as Uint8Array };
  }, [value]);

  const cell = Math.max(1, Math.floor(size / matrix.count));
  const dim = cell * matrix.count;

  return (
    <View style={{ padding: 14, backgroundColor: '#FFFFFF', borderRadius: 16 }}>
      <View style={{ width: dim, height: dim, backgroundColor: '#FFFFFF' }}>
        {Array.from({ length: matrix.count }).map((_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {Array.from({ length: matrix.count }).map((__, col) => (
              <View
                key={col}
                style={{ width: cell, height: cell, backgroundColor: matrix.data[row * matrix.count + col] ? '#0B0B0B' : '#FFFFFF' }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
