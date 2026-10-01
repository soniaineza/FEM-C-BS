// QA-only stand-in for the 'use dom' MapEngine, which Expo Go cannot run.
// Prints what the real map would draw so the scene data can be checked.
import { useEffect } from 'react';
import { View, Text } from 'react-native';
const f = (n: number) => n.toFixed(4);
export default function MapEngineStub({ scene, onReady }: { scene?: any; onReady?: () => void }) {
  useEffect(() => { onReady?.(); }, []);
  const cars = scene?.cars ?? [];
  const pins = scene?.markers ?? [];
  const routes = scene?.routes ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: '#dbe7d4', padding: 8, justifyContent: 'center' }}>
      <Text style={{ color: '#2c3b27', fontWeight: '700' }}>[QA map] camera: {scene?.camera?.mode}</Text>
      {cars.map((c: any) => <Text key={c.id} style={{ color: '#2c3b27' }}>CAR {c.id} {f(c.latitude)},{f(c.longitude)}</Text>)}
      {pins.map((m: any) => <Text key={m.id} style={{ color: '#2c3b27' }}>PIN {m.kind} {f(m.latitude)},{f(m.longitude)}</Text>)}
      {routes.map((r: any, i: number) => <Text key={i} style={{ color: '#2c3b27' }}>ROUTE {r.coordinates.length} pts from {f(r.coordinates[0][1])},{f(r.coordinates[0][0])} to {f(r.coordinates[r.coordinates.length-1][1])},{f(r.coordinates[r.coordinates.length-1][0])}</Text>)}
    </View>
  );
}
