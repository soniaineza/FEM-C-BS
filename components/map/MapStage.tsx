import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { LiveMap } from './LiveMap';
import { mapStageController, useMapStageStore } from '../../stores/useMapStageStore';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * The persistent map behind the ride-flow screens. Mounted once by the
 * (main) layout, so it is already warm (scripts parsed, tiles cached) when
 * the rider reaches vehicle choice, and never reloads between steps.
 *
 * It takes no touches itself: screens above it are overlays, and touches
 * don't pass through native screen containers on every platform. The screen
 * on top reads drags and pinches (MapGestureLayer) and sends them here as
 * camera commands, so the map still moves and zooms under the rider's
 * fingers. The pickup screen, where dragging the map is the interaction,
 * embeds its own interactive LiveMap instead.
 */
export function MapStage() {
  const scene = useMapStageStore((s) => s.scene);
  const owner = useMapStageStore((s) => s.owner);
  const recenterToken = useMapStageStore((s) => s.recenterToken);
  const { t } = useTranslation();
  // A new camera token re-applies the scene's framing after the rider has
  // moved the map away from it.
  const staged = useMemo(
    () =>
      scene
        ? { ...scene, interactive: false, camera: { ...scene.camera, token: (scene.camera.token ?? 0) + recenterToken } }
        : null,
    [scene, recenterToken]
  );
  // Home renders its own live fleet map. Keeping this persistent ride-flow
  // canvas mounted underneath it creates a second WebGL context and delays
  // the map the rider actually sees. Mount the warm shared canvas only on
  // screens designed to display it. Ride screens publish their scene while
  // focused, so no active owner means there is no stage to render.
  if (!staged || !owner) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LiveMap
        scene={staged}
        controllerRef={mapStageController}
        loadingLabel={t('mapLoading')}
        errorLabel={t('mapError')}
        retryLabel={t('tryAgain')}
      />
    </View>
  );
}
