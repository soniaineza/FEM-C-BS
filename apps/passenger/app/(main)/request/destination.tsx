import { goBack } from '@kimu/shared/utils/navigation';

import { PlacePicker } from '../../../components/PlacePicker';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { recordRecentPlace } from '../../../services/user-service';

// Destination: same centre-pin picker as pickup, starting from the current
// destination or else the pickup; chosen places join the rider's recents.
export default function DestinationScreen() {
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const setDestination = useRideWizardStore((s) => s.setDestination);
  return (
    <PlacePicker
      mode="destination"
      initial={destination}
      fallback={pickup}
      onConfirm={(place) => {
        setDestination(place);
        recordRecentPlace(place);
        goBack();
      }}
    />
  );
}
