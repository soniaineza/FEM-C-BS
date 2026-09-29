import { useEffect, useState } from 'react';

import { getAppConfig } from '../services/app-config';
import { BOOKABLE_PAYMENT_METHOD_IDS, DEFAULT_PAYMENT_METHODS, PaymentMethod } from '../types/payment';

/** Payment methods the server can charge now (card appears in demo mode). */
export function usePaymentMethods() {
  const [ids, setIds] = useState<string[]>(BOOKABLE_PAYMENT_METHOD_IDS);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let alive = true;
    getAppConfig().then((c) => {
      if (!alive) return;
      setIds(c.paymentMethods);
      setDemo(c.demoPayments);
    });
    return () => {
      alive = false;
    };
  }, []);
  const methods: PaymentMethod[] = DEFAULT_PAYMENT_METHODS.filter((m) => ids.includes(m.id));
  return { methods, demo };
}
