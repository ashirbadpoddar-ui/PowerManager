"use client";

import { AlertCircle, Banknote, CheckCircle2, CreditCard, LoaderCircle, ShieldCheck, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { createDemoTransactionId, paymentMethodLabel, saveDemoPayment } from "@/services/demoPaymentStorage";
import type { MyBill } from "@/types/portal";
import type { DemoPaymentMethod, DemoPaymentRecord } from "@/types/payment";

type DemoPaymentModalProps = {
  bill: MyBill;
  onClose: () => void;
  onPaymentSaved?: (payment: DemoPaymentRecord) => void | Promise<MyBill | void>;
  onReceipt: (billId: number) => void;
};

type PaymentPhase = "selection" | "processing" | "success" | "failed";

const methodOptions: Array<{ value: DemoPaymentMethod; label: string; description: string; icon: typeof Smartphone }> = [
  { value: "upi", label: "UPI", description: "demo@upi", icon: Smartphone },
  { value: "card", label: "Debit / Credit Card", description: "4242 4242 4242 4242", icon: CreditCard },
  { value: "net_banking", label: "Net Banking", description: "Demo Bank", icon: Banknote },
];

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function localDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function DemoPaymentModal({ bill, onClose, onPaymentSaved, onReceipt }: DemoPaymentModalProps) {
  const [method, setMethod] = useState<DemoPaymentMethod | null>(null);
  const [phase, setPhase] = useState<PaymentPhase>("selection");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [completedPayment, setCompletedPayment] = useState<DemoPaymentRecord | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const confirmPayment = () => {
    if (!method || phase === "processing") return;
    setPhase("processing");
    timer.current = window.setTimeout(() => {
      const now = new Date();
      const payment: DemoPaymentRecord = simulateFailure
        ? {
            billId: bill.id,
            invoiceNumber: bill.invoice_number,
            status: "failed",
            method,
            transactionId: null,
            paidAmount: null,
            paidAt: null,
            failedAt: now.toISOString(),
          }
        : {
            billId: bill.id,
            invoiceNumber: bill.invoice_number,
            status: "paid",
            method,
            transactionId: createDemoTransactionId(now),
            paidAmount: bill.total_amount,
            paidAt: now.toISOString(),
            failedAt: null,
          };

      const finish = (serverBill?: MyBill | void) => {
        const confirmedPayment: DemoPaymentRecord = serverBill
          ? {
              ...payment,
              status: serverBill.status === "paid" ? "paid" : "failed",
              method: serverBill.payment_method ?? payment.method,
              transactionId: serverBill.transaction_id ?? payment.transactionId,
              paidAmount: serverBill.status === "paid" ? serverBill.total_amount : null,
              paidAt: serverBill.paid_at ?? payment.paidAt,
            }
          : payment;
        saveDemoPayment(confirmedPayment);
        setCompletedPayment(confirmedPayment);
        setPhase(confirmedPayment.status === "paid" ? "success" : "failed");
      };
      if (payment.status === "paid" && onPaymentSaved) {
        void Promise.resolve(onPaymentSaved(payment)).then(finish).catch(() => setPhase("failed"));
      } else {
        finish();
      }
    }, 1_400);
  };

  const isProcessing = phase === "processing";
  const close = () => {
    if (!isProcessing) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--panel-dark)]/65 p-4 backdrop-blur-sm" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="demo-payment-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-[var(--surface)] p-5 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">PowerManage demo checkout</p>
            <h2 id="demo-payment-title" className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">
              {phase === "success" ? "Payment successful" : phase === "failed" ? "Payment failed" : "Pay your invoice"}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{bill.invoice_number} · {money(bill.total_amount)}</p>
          </div>
          <button type="button" onClick={close} disabled={isProcessing} aria-label="Close payment dialog" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] disabled:cursor-not-allowed disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {phase === "processing" && (
          <div className="grid min-h-[260px] place-items-center py-8 text-center">
            <div>
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[var(--primary)]" />
              <h3 className="mt-4 font-display text-xl font-bold text-[var(--text-primary)]">Processing demo payment</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Please wait while we confirm your payment.</p>
            </div>
          </div>
        )}

        {phase === "selection" && (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning)]">
              Demo payment only. Do not enter real payment details.
            </div>

            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Choose a payment method</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {methodOptions.map(({ value, label, description, icon: Icon }) => (
                  <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)} className={`min-h-[92px] rounded-xl border p-3 text-left transition ${method === value ? "border-[var(--primary)] bg-[var(--active-bg)]" : "border-[var(--border)] bg-[var(--card-secondary)] hover:border-[var(--primary)]"}`}>
                    <Icon className={`h-5 w-5 ${method === value ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}`} />
                    <span className="mt-3 block text-xs font-bold text-[var(--text-primary)]">{label}</span>
                    <span className="mt-1 block truncate text-[10px] text-[var(--text-muted)]">{description}</span>
                  </button>
                ))}
              </div>
            </div>

            {method && <div className="rounded-xl border border-[var(--border)] bg-[var(--card-secondary)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Demo details</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <DemoDetail label="Method" value={paymentMethodLabel(method)} />
                <DemoDetail label="Reference" value={method === "upi" ? "demo@upi" : method === "card" ? "4242 4242 4242 4242" : "Demo Bank"} />
                {method === "card" && <><DemoDetail label="Expiry" value="MM/YY" /><DemoDetail label="CVV" value="***" /></>}
              </div>
            </div>}

            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              Simulate failed payment for testing
            </label>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[var(--input-border)] px-5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button type="button" disabled={!method} onClick={confirmPayment} className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">Confirm demo payment</button>
            </div>
          </div>
        )}

        {phase === "success" && (
          <div className="mt-7 space-y-5">
            <div className="grid place-items-center rounded-xl bg-[var(--success-bg)] p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-[var(--success)]" />
              <h3 className="mt-3 font-display text-2xl font-bold text-[var(--text-primary)]">Payment Successful</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{money(bill.total_amount)} received for {bill.invoice_number}.</p>
            </div>
            <div className="grid gap-3 rounded-xl border border-[var(--border)] p-4 text-sm sm:grid-cols-2">
              <DemoDetail label="Amount paid" value={money(bill.total_amount)} />
              <DemoDetail label="Payment method" value={paymentMethodLabel(method)} />
              <DemoDetail label="Transaction ID" value={completedPayment?.transactionId ?? "—"} />
              <DemoDetail label="Date and time" value={localDateTime(completedPayment?.paidAt ?? new Date().toISOString())} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => onReceipt(bill.id)} className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:bg-[var(--primary-hover)]">View receipt</button>
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[var(--input-border)] px-5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Back to My Bills</button>
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div className="mt-7 space-y-5">
            <div className="grid place-items-center rounded-xl bg-[var(--error-bg)] p-6 text-center">
              <AlertCircle className="h-12 w-12 text-[var(--error)]" />
              <h3 className="mt-3 font-display text-2xl font-bold text-[var(--text-primary)]">Payment Failed</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">The demo payment was not completed. Your bill remains unpaid.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[var(--input-border)] px-5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button type="button" onClick={() => setPhase("selection")} className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:bg-[var(--primary-hover)]">Try again</button>
            </div>
          </div>
        )}

        <p className="mt-6 flex items-center gap-2 text-[10px] text-[var(--text-muted)]"><ShieldCheck className="h-3.5 w-3.5" />This is a simulated checkout. No real payment is processed.</p>
      </div>
    </div>
  );
}

function DemoDetail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{value}</p></div>;
}
