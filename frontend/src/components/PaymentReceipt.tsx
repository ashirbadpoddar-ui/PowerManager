"use client";

import { DocumentPreview } from "@/components/documents/BillingDocument";
import { documentBill } from "@/lib/billingDocument";
import type { MyBill } from "@/types/portal";
import type { DemoPaymentRecord } from "@/types/payment";

// Retain the public props; local payment metadata must not override the server invoice.
export function PaymentReceipt({ bill, onBack }: { bill: MyBill; payment: DemoPaymentRecord | null; onBack: () => void }) {
  return <DocumentPreview bill={documentBill(bill)} kind="receipt" actions={<button type="button" onClick={onBack}>Back to bills</button>} />;
}
