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
import { useLocationPermission } from '../hooks/useLocationPermission';
import { useDebouncedCallback } from '../hooks/useDebounce';
import { useNearbyCars } from '../hooks/useNearbyCars';
import * as locationService from '../services/location-service';
import { getRecentPlaces, RecentPlace } from '../services/user-service';
import { Place, placeHasCoordinates } from '../types/place';
import { KimuColors, Colors } from '../constants/theme';

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
const SAME_POINT_DEG = 1e-6; // ~0.1 m: the pin has not moved
const HEADER_PADDING_BOTTOM = 8;

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
  const { ensurePermission } = useLocationPermission();
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
  const alive = useRef(true);
  const intent = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; lookupId.current++; searchId.current++; intent.current++; }; }, []);
  const [cameraToken, setCameraToken] = useState(0);
  const moveCamera = useCallback((to: LatLng) => {
    setMoving(true);
    setResolving(true);
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
  // Where the label on screen was resolved (or chosen). The camera can settle
  // on that same point again without the pin moving (a layout change re-centres
  // it under the pin); looking it up again would only flicker the card.
  const resolvedAt = useRef<LatLng | null>(null);

  const resolveAddress = useDebouncedCallback(async (pos: LatLng, id: number) => {
    if (!alive.current || id !== lookupId.current) return;
    try {
      const place = await locationService.reverseGeocode(pos);
      if (id !== lookupId.current) return; // a newer spot was chosen meanwhile
      const generic = !place.address || place.address === 'Current location' || place.address === 'Unknown location';
      resolvedAt.current = pos;
      setCandidate({ ...place, ...pos, address: generic ? t('pinnedLocation') : place.address });
    } catch {
      if (id === lookupId.current) {
        resolvedAt.current = pos;
        setCandidate({ address: t('pinnedLocation'), ...pos });
      }
    } finally {
      if (id === lookupId.current) setResolving(false);
    }
  }, 350);

  const onCenterChanged = useCallback(
    (latitude: number, longitude: number) => {
      const id = ++lookupId.current;
      setMoving(false);
      const pos = { latitude, longitude };
      setCenter(pos);
      const settled = resolvedAt.current;
      const samePoint = settled != null
        && Math.abs(settled.latitude - latitude) < SAME_POINT_DEG
        && Math.abs(settled.longitude - longitude) < SAME_POINT_DEG;
      if (skipNextLookup.current || samePoint) {
        skipNextLookup.current = false;
        resolvedAt.current = pos;
        setCandidate((c) => c ? { ...c, ...pos } : { address: t('pinnedLocation'), ...pos });
        setResolving(false);
        return;
      }
      setCandidate((c) => (c ? { ...c, ...pos } : { address: t('findingAddress'), ...pos }));
      setResolving(true);
      resolveAddress(pos, id);
    },
    [resolveAddress, t]
  );

  // Start at the rider's GPS position when nothing was chosen yet (pickup).
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // interactive: the rider tapped the locate button, so re-asking after an
  // earlier "Not now" is wanted. The automatic call on open stays passive.
  const locate = useCallback(async (interactive = false) => {
    const generation = ++intent.current;
    setLocating(true);
    setGpsError(null);
    try {
      // Shared, single-flighted flow — the raw check/request pair this used to
      // run could open a second OS dialog on top of the app-start one.
      if (!(await ensurePermission({ interactive }))) {
        setGpsError(t('locationNotGranted'));
        return;
      }
      const here = await locationService.getCurrentPlace({ force: interactive });
      if (!alive.current || generation !== intent.current) return;
      if (here.latitude == null || here.longitude == null) return;
      skipNextLookup.current = false;
      moveCamera({ latitude: here.latitude, longitude: here.longitude });
    } catch {
      // Was surfacing raw English Error messages from the service straight into
      // the UI; these are rider-facing, so they come from the dictionary.
      if (alive.current && generation === intent.current) setGpsError(t('couldNotReadLocationSetManual'));
    } finally {
      // Only the newest request owns the spinner: a superseded one must not
      // clear it under a later locate().
      if (alive.current && generation === intent.current) setLocating(false);
    }
  }, [moveCamera, ensurePermission, t]);
  useEffect(() => {
    if (!start && mode === 'pickup') locate(false); // silent on open; the locate button explains denials
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
  const runSearch = useDebouncedCallback(async (q: string, id: number) => {
    if (!alive.current || id !== searchId.current) return;
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
    intent.current++;
    lookupId.current++;
    searchId.current++;
    setLocating(false);
    setResolving(false);
    setSearching(false);
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
    [cameraTarget, cameraToken, headerHeight, sheetHeight, cars, serverTimeOffsetMs]
  );

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(moving ? -12 : 0, { damping: 14, stiffness: 260 }) }],
  }));

  function confirm() {
    if (!candidate || resolving || moving || locating || !placeHasCoordinates(candidate)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onConfirm(candidate);
  }

  return (
    <View style={styles.fill}>
      {measured ? (
        <LiveMap
          scene={scene}
          onCenterChanged={onCenterChanged}
          onUserGesture={() => { skipNextLookup.current = false; intent.current++; lookupId.current++; setLocating(false); setMoving(true); setResolving(true); }}
          onPress={(latitude, longitude) => {
            skipNextLookup.current = false; intent.current++; lookupId.current++;
            setLocating(false);
            setMoving(true);
            setResolving(true);
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
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {/* Measured without the results list, which overlays the map: a list
            opening or closing must not move the pin or the camera. */}
        <View
          style={styles.searchRow}
          onLayout={(e: LayoutChangeEvent) =>
            setHeaderHeight(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height + HEADER_PADDING_BOTTOM))
          }
        >
          <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => goBack()} hitSlop={8} style={styles.roundButton}>
            <Ionicons name="arrow-back" size={22} color={KimuColors.ink} />
          </Pressable>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={KimuColors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={mode === 'pickup' ? t('searchOrTypeAddress') : t('searchDestination')}
              placeholderTextColor={KimuColors.textSecondary}
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setResults([]);
                setSearching(text.trim().length >= 2);
                runSearch(text, ++searchId.current);
              }}
              onFocus={() => setFocused(true)}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? <ActivityIndicator size="small" color={KimuColors.primary} /> : null}
            {query ? (
              <Pressable hitSlop={8} onPress={() => { searchId.current++; setQuery(''); setResults([]); setSearching(false); }}>
                <Ionicons name="close-circle" size={18} color={KimuColors.muted} />
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
                  <Ionicons name={query.trim().length < 2 ? 'time-outline' : 'location-outline'} size={18} color={KimuColors.textSecondary} />
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
          onPress={() => locate(true)}
          disabled={locating}
          style={[styles.roundButton, styles.locate, { bottom: sheetHeight + 12 }]}
        >
          {locating ? <ActivityIndicator color={KimuColors.primary} /> : <Ionicons name="locate" size={22} color={KimuColors.primary} />}
        </Pressable>
      ) : null}

      <MapSheet
        collapsible={false}
        onHeightChange={setSheetHeight}
        header={
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{mode === 'pickup' ? t('setPickup') : t('chooseDestination')}</Text>
            {mode === 'pickup' ? <Text style={styles.sheetHint}>{t('startingFromHint')}</Text> : null}
          </View>
        }
        footer={
          <Button
            title={mode === 'pickup' ? t('confirmPickup') : t('confirmDestination')}
            onPress={confirm}
            disabled={!candidate || resolving || moving || locating}
          />
        }
      >
        <View style={styles.addressRow}>
          <View style={[styles.addressIcon, mode === 'destination' && styles.addressIconSquare]} />
          <View style={styles.addressTextBox}>
            <Text numberOfLines={2} style={styles.addressText}>
              {moving ? t('movePinHint') : resolving || !candidate ? t('findingAddress') : candidate.address}
            </Text>
          </View>
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
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: HEADER_PADDING_BOTTOM },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  searchBox: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    ...shadow,
  },
  searchInput: { flex: 1, fontSize: 15, color: KimuColors.ink, paddingVertical: 0, outlineWidth: 0 },
  results: { marginTop: 8, backgroundColor: Colors.surface, borderRadius: 16, paddingVertical: 6, ...shadow },
  resultsTitle: { paddingHorizontal: 14, paddingVertical: 6, fontSize: 12, fontWeight: '600', color: KimuColors.textSecondary },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  resultText: { flex: 1, fontSize: 14, color: KimuColors.ink },
  pinWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pin: { alignItems: 'center' },
  pinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: KimuColors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  pinHeadSquare: { borderRadius: 6 },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.surface },
  pinStem: { width: 3, height: 16, backgroundColor: KimuColors.ink, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow: { width: 12, height: 5, borderRadius: 6, backgroundColor: '#000', marginTop: 1 },
  locate: { position: 'absolute', right: 16 },
  sheetHeader: { marginBottom: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: KimuColors.ink },
  sheetHint: { marginTop: 2, fontSize: 13, color: KimuColors.textSecondary },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  addressIcon: { width: 12, height: 12, borderRadius: 6, backgroundColor: KimuColors.ink },
  addressIconSquare: { borderRadius: 2 },
  // Two lines reserved: the hint, "Finding address..." and the address differ in
  // length, and a card that changed height with them moved the pin each time.
  addressTextBox: { flex: 1, minHeight: 40, justifyContent: 'center' },
  addressText: { fontSize: 15, lineHeight: 20, fontWeight: '500', color: KimuColors.ink },
  error: { marginTop: 6, fontSize: 13, color: KimuColors.error },
});
