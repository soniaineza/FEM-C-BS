import { goBack } from '../../../utils/navigation';

import { PlacePicker } from '../../../components/PlacePicker';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';

// Pickup is a sub-screen pushed from home (the hub): the chosen place is
// written to the wizard store and we go back.
export default function PickupScreen() {
  const pickup = useRideWizardStore((s) => s.pickup);
  const setPickup = useRideWizardStore((s) => s.setPickup);
  return (
    <PlacePicker
      mode="pickup"
      initial={pickup}
      onConfirm={(place) => {
        setPickup(place);
        goBack();
      }}
    />
  );
}
