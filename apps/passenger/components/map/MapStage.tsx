import { StyleSheet, View } from 'react-native';

import { LiveMap } from '@kimu/shared/components/map/LiveMap';
import { useMapStageStore } from '../../stores/useMapStageStore';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';

/**
 * The persistent map behind the ride-flow screens. Mounted once by the
 * (main) layout, so it is already warm (scripts parsed, tiles cached) when
 * the rider reaches vehicle choice, and never reloads between steps.
 *
 * Non-interactive by design: screens above it are overlays, and touches
 * don't pass through native screen containers on every platform. Screens
 * frame it with camera modes (fit / follow) and offer a recenter control;
 * the pickup screen, where dragging the map is the interaction, embeds its
 * own interactive LiveMap instead.
 */
export function MapStage() {
  const scene = useMapStageStore((s) => s.scene);
  const owner = useMapStageStore((s) => s.owner);
  const { t } = useTranslation();
  // Home renders its own live fleet map. Keeping this persistent ride-flow
  // canvas mounted underneath it creates a second WebGL context and delays
  // the map the rider actually sees. Mount the warm shared canvas only on
  // screens designed to display it. Ride screens publish their scene while
  // focused, so no active owner means there is no stage to render.
  if (!scene || !owner) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LiveMap
        scene={{ ...scene, interactive: false }}
        loadingLabel={t('mapLoading')}
        errorLabel={t('mapError')}
        retryLabel={t('tryAgain')}
      />
    </View>
  );
}
