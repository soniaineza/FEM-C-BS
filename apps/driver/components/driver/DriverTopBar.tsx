import { ReactNode } from 'react';

import { KimuTopBar } from '@kimu/shared/components/KimuTopBar';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useDriverDrawerStore } from '../../stores/useDriverDrawerStore';

/**
 * The shared green bar wired to the driver's side menu. `code` prints the
 * driver's own identifier under the title, the way the reference app keeps a
 * driver's number visible at a glance for radio and dispatch.
 *
 * The bar applies the top safe-area inset itself, so screens using it wrap in
 * SafeAreaView with edges={['left','right']} and never 'top'.
 */
export function DriverTopBar({
  title = 'Kimu',
  code,
  right,
  back = false,
}: {
  title?: string;
  code?: string | null;
  right?: ReactNode;
  back?: boolean;
}) {
  const { t } = useTranslation();
  const setOpen = useDriverDrawerStore((s) => s.setOpen);

  return (
    <KimuTopBar
      title={title}
      subtitle={code ? `${t('driverCodeLabel')} : ${code}` : null}
      onMenu={back ? undefined : () => setOpen(true)}
      back={back}
      right={right}
      menuLabel={t('menu')}
      backLabel={t('back')}
    />
  );
}
