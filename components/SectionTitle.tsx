import { memo } from 'react';

import { Text } from './ui/Text';

/** In-page section heading (title-3). For list group labels use ListSection's title. */
export const SectionTitle = memo(function SectionTitle({ children, className }: { children: string; className?: string }) {
  return (
    <Text variant="title-3" accessibilityRole="header" className={className}>
      {children}
    </Text>
  );
});

SectionTitle.displayName = 'SectionTitle';
