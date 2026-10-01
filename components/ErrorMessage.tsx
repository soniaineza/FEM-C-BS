import { memo } from 'react';

import { Banner } from './ui/Banner';

/** Inline request/form error; a danger Banner with optional retry. */
export const ErrorMessage = memo(function ErrorMessage({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return <Banner tone="danger" message={message} actionLabel={retryLabel} onAction={onRetry} />;
});

ErrorMessage.displayName = 'ErrorMessage';
