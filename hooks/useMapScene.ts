import { useCallback, useEffect, useId, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

import type { MapScene } from '../components/map/map-types';
import { useMapStageStore } from '../stores/useMapStageStore';

/**
 * Shows `scene` on the shared ride-flow map while the calling screen is
 * focused. Pass a memoised scene: every new object is sent to the map.
 */
export function useMapScene(scene: MapScene | null) {
  const owner = useId();
  const focused = useRef(false);
  const latest = useRef(scene);
  latest.current = scene;
  const setScene = useMapStageStore((s) => s.setScene);
  const release = useMapStageStore((s) => s.release);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (latest.current) setScene(owner, latest.current);
      return () => {
        focused.current = false;
        release(owner);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [owner])
  );

  useEffect(() => {
    if (focused.current && scene) setScene(owner, scene);
  }, [owner, scene, setScene]);
}
