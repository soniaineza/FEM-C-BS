import { StyleSheet, View } from 'react-native';

import { LiveMap } from './LiveMap';
import type { MapScene } from './map-types';
import { KIGALI_CENTER } from './map-types';
import { useMapStageStore } from '../../stores/useMapStageStore';
import { useTranslation } from '../../hooks/useTranslation';

const IDLE_SCENE: MapScene = {
  camera: { mode: 'center', center: KIGALI_CENTER, zoom: 13 },
};

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
  const { t } = useTranslation();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LiveMap
        scene={scene ? { ...scene, interactive: false } : IDLE_SCENE}
        loadingLabel={t('mapLoading')}
        errorLabel={t('mapError')}
        retryLabel={t('tryAgain')}
      />
    </View>
  );
}
