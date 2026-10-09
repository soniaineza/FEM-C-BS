import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { perf, perfEnabled, type PerfSnapshot } from '../utils/perf';

/**
 * The on-device readout for the performance recorder.
 *
 * Collapsed it is a small badge showing live frames per second; tapping it
 * opens the detail — dropped frames, the worst frame since the last reset,
 * and how long recent screens and map loads took. It renders nothing at all
 * unless the recorder is switched on, so release builds never see it.
 */
export function PerfOverlay() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    if (!perfEnabled) return;
    perf.start();
    return perf.subscribe(setSnap);
  }, []);

  if (!perfEnabled || !snap) return null;

  // Green while it is smooth, amber when frames start slipping, red when the
  // app is visibly stuttering.
  const tone = snap.fps >= 50 ? '#0E7C4A' : snap.fps >= 35 ? '#D97706' : '#DC2626';
  const slowest = [...snap.events].sort((a, b) => b.ms - a.ms).slice(0, 8);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', right: 8, top: insets.top + 8, alignItems: 'flex-end' }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Performance"
        onPress={() => setOpen((o) => !o)}
        style={{
          backgroundColor: 'rgba(17,17,17,0.82)',
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 5,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone, marginRight: 6 }} />
        <Text style={{ color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {snap.fps} fps
        </Text>
      </Pressable>

      {open ? (
        <View
          style={{
            marginTop: 6,
            width: 236,
            maxHeight: 320,
            backgroundColor: 'rgba(17,17,17,0.92)',
            borderRadius: 12,
            padding: 10,
          }}
        >
          <Row label="Dropped frames" value={String(snap.jankCount)} />
          <Row label="Freezes (250ms+)" value={String(snap.freezeCount)} />
          <Row label="Worst frame" value={`${snap.worstFrameMs} ms`} />

          <Text style={{ color: '#9CA3AF', fontSize: 10, marginTop: 8, marginBottom: 4, letterSpacing: 0.4 }}>
            SLOWEST STEPS
          </Text>
          <ScrollView style={{ maxHeight: 150 }}>
            {slowest.length ? (
              slowest.map((e, i) => (
                <Row
                  key={`${e.name}-${i}`}
                  label={e.name}
                  value={`${e.ms} ms`}
                  dim={e.ms < 300}
                />
              ))
            ) : (
              <Text style={{ color: '#6B7280', fontSize: 11 }}>Nothing recorded yet.</Text>
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={() => perf.reset()}
            style={{ marginTop: 8, paddingVertical: 6, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' }}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Reset</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value, dim = false }: { label: string; value: string; dim?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text numberOfLines={1} style={{ color: dim ? '#9CA3AF' : '#E5E7EB', fontSize: 11, flex: 1, marginRight: 8 }}>
        {label}
      </Text>
      <Text style={{ color: dim ? '#9CA3AF' : '#fff', fontSize: 11, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
