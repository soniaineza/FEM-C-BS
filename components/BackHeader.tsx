import { memo } from 'react';

import { ScreenHeader } from './ui/ScreenHeader';

interface BackHeaderProps {
  title?: string;
  onBack?: () => void;
  // Set when the screen sits on a colored background so the control stays legible.
  light?: boolean;
  className?: string;
}

/** Back button nav row with an optional inline title. Prefer ScreenHeader for new screens. */
export const BackHeader = memo(function BackHeader({ title, onBack, light = false, className }: BackHeaderProps) {
  return <ScreenHeader back={onBack ?? true} title={title} size="inline" light={light} className={className} />;
});

BackHeader.displayName = 'BackHeader';
