import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  LayoutChangeEvent,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { goBack } from '../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Button } from './Button';
import { LiveMap } from './map/LiveMap';
import { MapSheet } from './map/MapSheet';
import type { MapScene } from './map/map-types';
import { useTranslation } from '../hooks/useTranslation';
import { useDebouncedCallback } from '../hooks/useDebounce';
import { useNearbyCars } from '../hooks/useNearbyCars';
import * as locationService from '../services/location-service';
import { getRecentPlaces, RecentPlace } from '../services/user-service';
import { Place, placeHasCoordinates } from '../types/place';
import { FemColors } from '../constants/theme';

interface PlacePickerProps {
  mode: 'pickup' | 'destination';
  /** Where the map starts, e.g. the currently chosen place. */
  initial: Place | null;
  /** Fallback start point when `initial` is empty (e.g. pickup for destination). */
  fallback?: Place | null;
  onConfirm: (place: Place) => void;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

const PIN_ZOOM = 17;

/**
 * Pick a place the way Uber/Bolt do: a full-screen map under a fixed centre
 * pin. Drag the map (or tap a spot to glide there); when it settles, the
 * address under the pin is looked up and shown in the card with Confirm.
 * Search sits on top; for pickup a result moves the pin there so the exact
 * entrance can still be adjusted, for destination it's chosen directly.
 * Design picked with TypeSafe's Jev (centre pin + tap, 0.64).
 */
export function PlacePicker({ mode, initial, fallback, onConfirm }: PlacePickerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // ---- camera: only moves when the app decides (start, GPS, tap, search) ----
  const start = placeHasCoordinates(initial ?? { address: '' })
    ? initial
    : placeHasCoordinates(fallback ?? { address: '' })
      ? fallback
      : null;
  const [cameraTarget, setCameraTarget] = useState<LatLng>(
    start ? { latitude: start.latitude!, longitude: start.longitude! } : locationService.MapDefaults
  );
  const [cameraToken, setCameraToken] = useState(0);
  const moveCamera = useCallback((to: LatLng) => {
    setCameraTarget(to);
    setCameraToken((n) => n + 1);
  }, []);

  // ---- what's under the pin ----
  const [center, setCenter] = useState<LatLng | null>(null);
  const [candidate, setCandidate] = useState<Place | null>(
    start && placeHasCoordinates(start) ? { ...start } : null
  );
  const [resolving, setResolving] = useState(false);
  const [moving, setMoving] = useState(false);
  const lookupId = useRef(0);
  const skipNextLookup = useRef(Boolean(start && initial)); // keep an already chosen label

  const resolveAddress = useDebouncedCallback(async (pos: LatLng) => {
    const id = ++lookupId.current;
    setResolving(true);
    try {
      const place = await locationService.reverseGeocode(pos);
      if (id !== lookupId.current) return; // a newer spot was chosen meanwhile
      const generic = !place.address || place.address === 'Current location' || place.address === 'Unknown location';
      setCandidate({ ...place, ...pos, address: generic ? t('pinnedLocation') : place.address });
    } catch {
      if (id === lookupId.current) setCandidate({ address: t('pinnedLocation'), ...pos });
    } finally {
      if (id === lookupId.current) setResolving(false);
    }
  }, 350);

  const onCenterChanged = useCallback(
    (latitude: number, longitude: number) => {
      setMoving(false);
      const pos = { latitude, longitude };
      setCenter(pos);
      if (skipNextLookup.current) {
        skipNextLookup.current = false;
        return;
      }
      setCandidate((c) => (c ? { ...c, ...pos } : { address: t('findingAddress'), ...pos }));
      resolveAddress(pos);
    },
    [resolveAddress, t]
  );

  // Start at the rider's GPS position when nothing was chosen yet (pickup).
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const locate = useCallback(async () => {
    setLocating(true);
    setGpsError(null);
    try {
      const perm = await locationService.checkPermission();
      if (perm !== 'granted') {
        const req = await locationService.requestPermission();
        if (req !== 'granted') {
          setGpsError('Location permission was not granted.');
          return;
        }
      }
      const here = await locationService.getCurrentPlace();
      skipNextLookup.current = false;
      moveCamera({ latitude: here.latitude!, longitude: here.longitude! });
    } catch (err) {
      setGpsError(err instanceof Error ? err.message : null);
    } finally {
      setLocating(false);
    }
  }, [moveCamera]);
  useEffect(() => {
    if (!start && mode === 'pickup') locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- search ----
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const searchId = useRef(0);
  useEffect(() => {
    if (mode === 'destination') getRecentPlaces().then(setRecent).catch(() => {});
  }, [mode]);
  const runSearch = useDebouncedCallback(async (q: string) => {
    const id = ++searchId.current;
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const found = await locationService.searchLocations(q);
      if (id === searchId.current) setResults(found);
    } catch {
      if (id === searchId.current) setResults([]);
    } finally {
      if (id === searchId.current) setSearching(false);
    }
  }, 350);

  function chooseResult(place: Place) {
    Keyboard.dismiss();
    setFocused(false);
    setQuery('');
    setResults([]);
    if (!placeHasCoordinates(place)) return;
    if (mode === 'destination') {
      onConfirm(place);
      return;
    }
    // Pickup: move the pin there so the exact entrance can still be adjusted.
    skipNextLookup.current = true;
    setCandidate(place);
    moveCamera({ latitude: place.latitude!, longitude: place.longitude! });
  }

  const showList = focused && (query.trim().length >= 2 || (mode === 'destination' && recent.length > 0));
  const list: Place[] = query.trim().length >= 2
    ? results
    : recent.map((r) => ({ address: r.address, latitude: r.latitude, longitude: r.longitude }));

  // ---- layout: keep the map's visible centre (and the pin) between the
  // search bar and the bottom card ----
  const [headerHeight, setHeaderHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const measured = headerHeight > 0 && sheetHeight > 0;
  const padding = { top: headerHeight, bottom: sheetHeight, left: 0, right: 0 };
  const pinTop = headerHeight + (windowHeight - headerHeight - sheetHeight) / 2;

  const pickupPoint = center ?? cameraTarget;
  const { cars, serverTimeOffsetMs } = useNearbyCars(
    mode === 'pickup'
      ? { latitude: Number(pickupPoint.latitude.toFixed(3)), longitude: Number(pickupPoint.longitude.toFixed(3)) }
      : null
  );

  const scene = useMemo<MapScene>(
    () => ({
      camera: { mode: 'center', center: cameraTarget, zoom: PIN_ZOOM, token: cameraToken, padding },
      reportCenter: true,
      cars,
      serverTimeOffsetMs,
    }),
    // padding only matters once measured; cars update the scene on their own
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cameraTarget, cameraToken, measured, cars, serverTimeOffsetMs]
  );

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(moving ? -12 : 0, { damping: 14, stiffness: 260 }) }],
  }));

  function confirm() {
    if (!candidate || resolving || !placeHasCoordinates(candidate)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onConfirm(candidate);
  }

  return (
    <View style={styles.fill}>
      {measured ? (
        <LiveMap
          scene={scene}
          onCenterChanged={onCenterChanged}
          onUserGesture={() => setMoving(true)}
          onPress={(latitude, longitude) => {
            setMoving(true);
            moveCamera({ latitude, longitude });
          }}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
          retryLabel={t('tryAgain')}
        />
      ) : (
        <View style={[styles.fill, styles.mapPlaceholder]} />
      )}

      {/* Fixed centre pin (the map moves under it). */}
      {measured ? (
        <View pointerEvents="none" style={[styles.pinWrap, { top: pinTop - 46 }]}>
          <Animated.View style={[styles.pin, pinStyle]}>
            <View style={[styles.pinHead, mode === 'destination' && styles.pinHeadSquare]}>
              <View style={styles.pinDot} />
            </View>
            <View style={styles.pinStem} />
          </Animated.View>
          <View style={[styles.pinShadow, { opacity: moving ? 0.35 : 0.6 }]} />
        </View>
      ) : null}

      {/* Header: back + search. */}
      <View
        onLayout={(e: LayoutChangeEvent) => setHeaderHeight(Math.round(e.nativeEvent.layout.height))}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <View style={styles.searchRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => goBack()} hitSlop={8} style={styles.roundButton}>
            <Ionicons name="arrow-back" size={22} color={FemColors.ink} />
          </Pressable>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={FemColors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={mode === 'pickup' ? t('searchOrTypeAddress') : t('searchDestination')}
              placeholderTextColor={FemColors.textSecondary}
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                runSearch(text);
              }}
              onFocus={() => setFocused(true)}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? <ActivityIndicator size="small" color={FemColors.primary} /> : null}
            {query ? (
              <Pressable hitSlop={8} onPress={() => { setQuery(''); setResults([]); }}>
                <Ionicons name="close-circle" size={18} color={FemColors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {showList ? (
          <View style={[styles.results, { maxHeight: windowHeight * 0.5 }]}>
            {query.trim().length < 2 ? <Text style={styles.resultsTitle}>{t('recentDestinations')}</Text> : null}
            <ScrollView keyboardShouldPersistTaps="handled">
              {list.map((place, i) => (
                <Pressable key={`${place.address}-${i}`} onPress={() => chooseResult(place)} style={styles.resultRow}>
                  <Ionicons name={query.trim().length < 2 ? 'time-outline' : 'location-outline'} size={18} color={FemColors.textSecondary} />
                  <Text numberOfLines={2} style={styles.resultText}>{place.address}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/* Locate me, just above the card. */}
      {measured ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('useCurrentLocation')}
          onPress={locate}
          disabled={locating}
          style={[styles.roundButton, styles.locate, { bottom: sheetHeight + 12 }]}
        >
          {locating ? <ActivityIndicator color={FemColors.primary} /> : <Ionicons name="locate" size={22} color={FemColors.primary} />}
        </Pressable>
      ) : null}

      <MapSheet
        collapsible={false}
        onHeightChange={setSheetHeight}
        header={
          <Text style={styles.sheetTitle}>{mode === 'pickup' ? t('setPickup') : t('chooseDestination')}</Text>
        }
        footer={
          <Button
            title={mode === 'pickup' ? t('confirmPickup') : t('confirmDestination')}
            onPress={confirm}
            disabled={!candidate || resolving || moving}
          />
        }
      >
        <View style={styles.addressRow}>
          <View style={[styles.addressIcon, mode === 'destination' && styles.addressIconSquare]} />
          <Text numberOfLines={2} style={styles.addressText}>
            {moving ? t('movePinHint') : resolving || !candidate ? t('findingAddress') : candidate.address}
          </Text>
        </View>
        {gpsError ? <Text style={styles.error}>{gpsError}</Text> : null}
      </MapSheet>
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  mapPlaceholder: { backgroundColor: '#eef0f2' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  searchBox: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    ...shadow,
  },
  searchInput: { flex: 1, fontSize: 15, color: FemColors.ink, paddingVertical: 0, outlineWidth: 0 },
  results: { marginTop: 8, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6, ...shadow },
  resultsTitle: { paddingHorizontal: 14, paddingVertical: 6, fontSize: 12, fontWeight: '600', color: FemColors.textSecondary },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  resultText: { flex: 1, fontSize: 14, color: FemColors.ink },
  pinWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pin: { alignItems: 'center' },
  pinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: FemColors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  pinHeadSquare: { borderRadius: 6 },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  pinStem: { width: 3, height: 16, backgroundColor: FemColors.ink, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow: { width: 12, height: 5, borderRadius: 6, backgroundColor: '#000', marginTop: 1 },
  locate: { position: 'absolute', right: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: FemColors.ink, marginBottom: 10 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  addressIcon: { width: 12, height: 12, borderRadius: 6, backgroundColor: FemColors.ink },
  addressIconSquare: { borderRadius: 2 },
  addressText: { flex: 1, fontSize: 15, fontWeight: '500', color: FemColors.ink },
  error: { marginTop: 6, fontSize: 13, color: FemColors.error },
});
