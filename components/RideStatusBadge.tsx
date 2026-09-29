import { useTranslation } from '../hooks/useTranslation';
import { RideStatus, rideStatusKey } from '../types/ride';
import { Badge } from './ui/Badge';

/** Ride status as text + color (never color alone). */
export function rideStatusTone(status: RideStatus): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'scheduled') return 'info';
  if (status === 'searchingDriver' || status === 'paymentPending') return 'warning';
  return 'info';
}

export function RideStatusBadge({ status }: { status: RideStatus }) {
  const { t } = useTranslation();
  return <Badge label={t(rideStatusKey(status))} tone={rideStatusTone(status)} dot={status !== 'completed' && status !== 'cancelled'} />;
}
