export type DemoPaymentStatus = "pending" | "paid" | "failed";

export type DemoPaymentMethod = "upi" | "card" | "net_banking";

export type DemoPaymentRecord = {
  billId: number;
  invoiceNumber: string;
  status: DemoPaymentStatus;
  method: DemoPaymentMethod | null;
  transactionId: string | null;
  paidAmount: number | null;
  paidAt: string | null;
  failedAt: string | null;
};

export type DemoPaymentMap = Record<string, DemoPaymentRecord>;
