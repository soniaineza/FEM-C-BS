// The on-device database for the standalone (server-free) build. One JSON
// document held in memory and persisted to the phone's AsyncStorage, so
// accounts, rides, wallet, tickets etc. survive app restarts exactly like rows
// in the real backend would. No React Native imports except the lazily-loaded
// storage adapter, so the whole backend can be exercised from plain Node tests.

import type { LatLng } from './geo';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const STORAGE_KEY = 'femcabs.offline.db.v1';
let store: KeyValueStore | null = null;

export function setStore(next: KeyValueStore | null): void {
  store = next;
  db = null;
}

function kv(): KeyValueStore {
  if (!store) store = require('@react-native-async-storage/async-storage').default as KeyValueStore;
  return store;
}

// ---------------------------------------------------------------- records

export interface OtpRec {
  /** Empty when `via` is 'verify': the hosted service holds the code. */
  code: string;
  issuedAt: number;
  attempts: number;
  via?: 'verify';
}

export interface PassengerRec {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  photoUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  isProfileComplete: boolean;
  verifiedAt: string | null;
  passHash: string;
  createdAt: string;
  otp: { signup?: OtpRec; reset?: OtpRec };
}

export type DriverStatus = 'offline' | 'active' | 'busy' | 'suspended';

export interface DriverRec {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  photoUrl: string | null;
  licenseNumber: string | null;
  verified: boolean;
  status: DriverStatus;
  vehicleId: string | null;
  rating: number | null;
  totalTrips: number;
  isProfileComplete: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferredLanguage: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  passHash: string;
  createdAt: string;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  /** When the next simulated ride request may be offered to this driver. */
  nextOfferAt: number;
}

export type RideStatus =
  | 'scheduled'
  | 'searchingDriver'
  | 'driverAssigned'
  | 'driverArriving'
  | 'driverArrived'
  | 'pinVerified'
  | 'inProgress'
  | 'arrived'
  | 'paymentPending'
  | 'completed'
  | 'cancelled';

export interface PlaceRec {
  address: string;
  latitude: number;
  longitude: number;
}

export interface RideDriverInfo {
  name: string;
  phone: string;
  rating: number;
  vehicleModel: string;
  vehicleColor: string;
  licensePlate: string;
}

/** Timeline of a passenger-booked ride whose driver is simulated. */
export interface RideSim {
  t0: number; // when the search starts (creation time, or the scheduled time)
  approachStart: LatLng; // where the simulated car begins driving from
  tripMs: number;
  seed: string;
  /** Ids of OS-level local notifications scheduled for this ride. */
  alertIds: string[];
  /** The road geometry this ride drives, [lng, lat] pairs, kept so it survives a restart. */
  approachCoords?: [number, number][];
  tripCoords?: [number, number][];
}

export interface RideRec {
  id: string;
  /** Rider's phone for electronic billing, entered by the driver. */
  ebillPhone?: string | null;
  /** Set when the rider scanned the driver's pairing code. */
  pairedAt?: string | null;
  pairedTerminal?: string | null;
  /** 'passenger': booked by a passenger account, driver simulated.
   *  'demoRider': offered to a driver account, passenger simulated. */
  source: 'passenger' | 'demoRider';
  passengerId: string | null;
  driverId: string | null;
  riderName: string | null;
  rideType: 'private' | 'shared';
  note: string | null;
  pickup: PlaceRec;
  destination: PlaceRec;
  vehicleId: string;
  paymentMethodId: string;
  status: RideStatus;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  fareBreakdown: unknown | null;
  surgeMultiplier: number;
  finalFare: number | null;
  appliedDiscount: number | null;
  driver: RideDriverInfo | null;
  pin: string;
  cancellationReason: string | null;
  cancelledBy: string | null;
  scheduledFor: string | null;
  createdAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  rating: number | null;
  ratingComment: string | null;
  sim: RideSim | null;
  /** Statuses whose notification has already been issued. */
  notified: string[];
}

export interface PaymentRec {
  id: string;
  rideId: string;
  passengerId: string | null;
  driverId: string | null;
  amount: number;
  method: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';
  state: string;
  provider: string | null;
  reference: string;
  createdAt: string;
  updatedAt: string;
  /** Cash a simulated driver collects at this time (passenger-booked rides). */
  cashConfirmAt: number | null;
}

export interface NotificationRec {
  id: string;
  role: 'passenger' | 'driver';
  ownerId: string;
  title: string;
  body: string;
  type: string;
  rideId: string | null;
  read: boolean;
  createdAt: string;
}

export interface TicketRec {
  id: string;
  role: 'passenger' | 'driver';
  ownerId: string;
  rideId: string | null;
  category: string;
  subject: string;
  message: string;
  status: 'open' | 'closed' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessageRec {
  id: string;
  ticketId: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

export interface WalletTxnRec {
  id: string;
  passengerId: string;
  amount: number;
  type: 'credit' | 'debit';
  source: string;
  reference: string | null;
  createdAt: string;
}

export interface TopupRec {
  id: string;
  passengerId: string;
  amount: number;
  phone: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  state: string;
  provider: string | null;
  reference: string;
  createdAt: string;
  updatedAt: string;
}

export interface EarningRec {
  id: string;
  driverId: string;
  rideId: string;
  grossAmount: number;
  commission: number;
  netAmount: number;
  paymentMethod: string;
  status: 'pending' | 'settled' | 'refunded';
  pickupAddress: string;
  destAddress: string;
  distanceKm: number;
  rideType: string;
  createdAt: string;
  settledAt: string | null;
}

export interface RatingRec {
  id: string;
  driverId: string;
  rideId: string;
  rating: number;
  comment: string | null;
  passengerName: string;
  createdAt: string;
}

export interface DocumentRec {
  id: string;
  driverId: string;
  docType: string;
  fileName: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
}

export interface SavedPlaceRec {
  id: string;
  passengerId: string;
  type: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface RecentPlaceRec {
  passengerId: string;
  address: string;
  latitude: number;
  longitude: number;
  timesUsed: number;
  lastUsedAt: string;
}

export interface ShareRec {
  token: string;
  rideId: string;
  passengerId: string;
  expiresAt: string;
}

export interface EmergencyRec {
  id: string;
  role: 'passenger' | 'driver';
  ownerId: string;
  rideId: string | null;
  reference: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  details: string | null;
  createdAt: string;
}

export interface Db {
  seq: number;
  passengers: PassengerRec[];
  drivers: DriverRec[];
  rides: RideRec[];
  payments: PaymentRec[];
  notifications: NotificationRec[];
  tickets: TicketRec[];
  ticketMessages: TicketMessageRec[];
  walletTxns: WalletTxnRec[];
  topups: TopupRec[];
  earnings: EarningRec[];
  ratings: RatingRec[];
  documents: DocumentRec[];
  savedPlaces: SavedPlaceRec[];
  recentPlaces: RecentPlaceRec[];
  shares: ShareRec[];
  emergencies: EmergencyRec[];
  /** Last GPS fix each passenger reported during a ride. */
  passengerLocations: Record<string, { latitude: number; longitude: number; heading: number | null; at: number }>;
}

function emptyDb(): Db {
  return {
    seq: 0,
    passengers: [],
    drivers: [],
    rides: [],
    payments: [],
    notifications: [],
    tickets: [],
    ticketMessages: [],
    walletTxns: [],
    topups: [],
    earnings: [],
    ratings: [],
    documents: [],
    savedPlaces: [],
    recentPlaces: [],
    shares: [],
    emergencies: [],
    passengerLocations: {},
  };
}

// ------------------------------------------------------------ persistence

let db: Db | null = null;
let loading: Promise<Db> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getDb(): Promise<Db> {
  if (db) return Promise.resolve(db);
  if (!loading) {
    loading = (async () => {
      let loaded = emptyDb();
      try {
        const raw = await kv().getItem(STORAGE_KEY);
        // Merge over an empty db so a file written by an older build still
        // gets every collection a newer build expects.
        if (raw) loaded = { ...loaded, ...JSON.parse(raw) };
      } catch {
        // Unreadable data: start fresh rather than brick the app.
      }
      db = loaded;
      loading = null;
      return loaded;
    })();
  }
  return loading;
}

const MIN_WRITE_GAP_MS = 4_000;
let lastWrite = 0;

/**
 * Schedules a write. The app polls every couple of seconds, so writes are
 * throttled to one per few seconds (the newest state always wins); the app
 * also flushes when it goes to the background.
 */
export function saveDb(): void {
  if (!db || saveTimer) return;
  const wait = Math.max(300, lastWrite + MIN_WRITE_GAP_MS - Date.now());
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushDb();
  }, wait);
}

export async function flushDb(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!db) return;
  lastWrite = Date.now();
  try {
    await kv().setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or unavailable: the in-memory state still serves this session.
  }
}

// ---------------------------------------------------------------- helpers

export function uid(prefix: string, d: Db): string {
  d.seq += 1;
  return `${prefix}_${Date.now().toString(36)}${d.seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const iso = (ms: number = Date.now()) => new Date(ms).toISOString();

/**
 * Passwords never leave the phone in this build, but they are still not kept
 * as plain text: a salted 53-bit string hash (cyrb53). This is obfuscation for
 * a local demo store, not a substitute for the real backend's bcrypt.
 */
export function hashPassword(password: string, salt: string): string {
  let h1 = 0xdeadbeef ^ salt.length;
  let h2 = 0x41c6ce57 ^ salt.length;
  const text = `${salt}:${password}`;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function randomDigits(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}

// -------------------------------------------------------------- catalogue

export interface VehicleRec {
  id: string;
  name: string;
  description: string;
  capacity: number;
  baseFare: number;
  farePerKm: number;
  etaMinutes: number;
  perMinute: number;
  minFare: number;
  bookingFee: number;
}

// Same catalogue and pricing constants the real backend seeds (schema.sql).
export const VEHICLES: VehicleRec[] = [
  { id: 'fem_economy', name: 'FEM Economy', description: 'Everyday rides at the best price.', capacity: 4, baseFare: 1800, farePerKm: 1080, etaMinutes: 5, perMinute: 40, minFare: 2000, bookingFee: 200 },
  { id: 'fem_comfort', name: 'FEM Comfort', description: 'Newer cars with extra legroom.', capacity: 4, baseFare: 1800, farePerKm: 1080, etaMinutes: 6, perMinute: 60, minFare: 3000, bookingFee: 250 },
  { id: 'fem_xl', name: 'FEM XL', description: 'Spacious vehicles for groups and luggage.', capacity: 6, baseFare: 1800, farePerKm: 1080, etaMinutes: 8, perMinute: 80, minFare: 4000, bookingFee: 300 },
];

export function walletBalance(d: Db, passengerId: string): number {
  return d.walletTxns
    .filter((t) => t.passengerId === passengerId)
    .reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);
}
