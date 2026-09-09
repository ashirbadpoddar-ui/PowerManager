"use client";

import { useEffect, useState } from "react";

import { listDemoPayments, subscribeToDemoPayments } from "@/services/demoPaymentStorage";
import type { DemoPaymentMap } from "@/types/payment";

export function useDemoPayments() {
  const [payments, setPayments] = useState<DemoPaymentMap>({});

  useEffect(() => {
    const refresh = () => setPayments(listDemoPayments());
    refresh();
    return subscribeToDemoPayments(refresh);
  }, []);

  return payments;
}
