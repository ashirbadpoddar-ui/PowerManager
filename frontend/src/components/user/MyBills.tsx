"use client";
import { RequestError } from "@/components/RequestError";

import { FileText, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DocumentPreview } from "@/components/documents/BillingDocument";
import { documentBill } from "@/lib/billingDocument";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useDemoPayments } from "@/hooks/useDemoPayments";
import { getEffectivePaymentStatus } from "@/services/demoPaymentStorage";
import { getMyBill, listMyBills } from "@/services/portalApi";
import type { MyBill, MyBillStatus } from "@/types/portal";
import type { DemoPaymentRecord, DemoPaymentStatus } from "@/types/payment";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const billStatusStyles: Record<MyBillStatus, string> = {
  paid: "bg-[var(--success-bg)] text-[var(--success)]",
  pending: "bg-[var(--active-bg)] text-[var(--primary)]",
  overdue: "bg-[var(--error-bg)] text-[var(--error)]",
};

const paymentStatusStyles: Record<DemoPaymentStatus, string> = {
  paid: "bg-[var(--success-bg)] text-[var(--success)]",
  pending: "bg-[var(--warning-bg)] text-[var(--warning)]",
  failed: "bg-[var(--error-bg)] text-[var(--error)]",
};

function Status({ status, label }: { status: MyBillStatus | DemoPaymentStatus; label?: string }) {
  const styles = status in billStatusStyles ? billStatusStyles[status as MyBillStatus] : paymentStatusStyles[status as DemoPaymentStatus];
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${styles}`}>{label ?? status}</span>;
}

type MyBillsProps = {
  onOpen: (billId: number) => void;
  onPay?: (bill: MyBill) => void;
  onReceipt?: (billId: number) => void;
};

export function MyBills({ onOpen, onPay, onReceipt }: MyBillsProps) {
  const payments = useDemoPayments();
  const [bills, setBills] = useState<MyBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | MyBillStatus>("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | DemoPaymentStatus>("all");

  useEffect(() => {
    let active = true;
    const load = () => {
      setError(null);
      void listMyBills()
        .then((response) => { if (active) setBills(response.items); })
        .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load your bills."); })
        .finally(() => { if (active) setLoading(false); });
    };
    load();
    window.addEventListener("powermanage-bill-change", load);
    return () => { active = false; window.removeEventListener("powermanage-bill-change", load); };
  }, []);

  const visible = useMemo(() => bills.filter((bill) => {
    const effectivePaymentStatus = getEffectivePaymentStatus(bill, payments[String(bill.id)]);
    const matchesSearch = `${bill.invoice_number} ${bill.property_name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return (status === "all" || bill.status === status) && (paymentStatus === "all" || effectivePaymentStatus === paymentStatus) && matchesSearch;
  }), [bills, payments, paymentStatus, query, status]);

  if (loading) return <div className="grid min-h-[360px] place-items-center text-sm text-[var(--text-secondary)]"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" /> Loading your bills…</div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">My bills</p><h1 className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">Your electricity invoices</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Only invoices assigned to your account are shown here.</p></div><span className="rounded-full bg-[var(--active-bg)] px-3 py-1.5 text-xs font-bold text-[var(--primary)]">{bills.length} invoice{bills.length === 1 ? "" : "s"}</span></div>
    {error && <p role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</p>}
    <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-card)] sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice" className="h-11 w-full rounded-xl border border-[var(--input-border)] pl-9 pr-3 text-sm outline-none focus:border-[var(--primary)]" /></label>
      <select aria-label="Filter bill status" value={status} onChange={(event) => setStatus(event.target.value as "all" | MyBillStatus)} className="h-11 rounded-xl border border-[var(--input-border)] px-3 text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--primary)]"><option value="all">All bill statuses</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="paid">Paid</option></select>
      <select aria-label="Filter payment status" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as "all" | DemoPaymentStatus)} className="h-11 rounded-xl border border-[var(--input-border)] px-3 text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--primary)]"><option value="all">All payment statuses</option><option value="pending">Payment pending</option><option value="failed">Payment failed</option><option value="paid">Payment paid</option></select>
    </div>

    {visible.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-10 text-center"><FileText className="mx-auto h-8 w-8 text-[var(--primary)]" /><h2 className="mt-3 font-bold text-[var(--text-primary)]">No bills found</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{bills.length ? "Try a different search or status filter." : "Your administrator has not generated a bill for you yet."}</p></div> : <>
      <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-card)] md:block"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-[var(--hover-bg)] text-xs uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-4">Invoice</th><th className="px-5 py-4">Period</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Due date</th><th className="px-5 py-4">Bill status</th><th className="px-5 py-4">Payment status</th><th className="px-5 py-4"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((bill) => <BillRow key={bill.id} bill={bill} payment={payments[String(bill.id)]} onOpen={onOpen} onPay={onPay} onReceipt={onReceipt} />)}</tbody></table></div>
      <div className="space-y-3 md:hidden">{visible.map((bill) => <BillCard key={bill.id} bill={bill} payment={payments[String(bill.id)]} onOpen={onOpen} onPay={onPay} onReceipt={onReceipt} />)}</div>
    </>}
  </div>;
}

type PaymentForBill = ReturnType<typeof import("@/services/demoPaymentStorage")["getDemoPayment"]>;

function authoritativePayment(bill: MyBill, fallback: PaymentForBill): DemoPaymentRecord | null {
  if (bill.status !== "paid") return fallback?.status === "failed" ? fallback : null;
  return {
    billId: bill.id,
    invoiceNumber: bill.invoice_number,
    status: "paid",
    method: bill.payment_method ?? null,
    transactionId: bill.transaction_id ?? null,
    paidAmount: bill.total_amount,
    paidAt: bill.paid_at ?? null,
    failedAt: null,
  };
}

function BillRow({ bill, payment, onOpen, onPay, onReceipt }: { bill: MyBill; payment?: PaymentForBill; onOpen: (billId: number) => void; onPay?: (bill: MyBill) => void; onReceipt?: (billId: number) => void }) {
  const currentPaymentStatus = getEffectivePaymentStatus(bill, payment);
  const canPay = bill.status !== "paid" && currentPaymentStatus !== "paid";
  return <tr className="border-t border-[var(--border)]"><td className="px-5 py-4 font-semibold text-[var(--text-primary)]">{bill.invoice_number}</td><td className="px-5 py-4 text-[var(--text-secondary)]">{dateLabel(bill.billing_period_start)} – {dateLabel(bill.billing_period_end)}</td><td className="px-5 py-4 font-semibold text-[var(--text-primary)]">{money(bill.total_amount)}</td><td className="px-5 py-4 text-[var(--text-secondary)]">{dateLabel(bill.due_date)}</td><td className="px-5 py-4"><Status status={bill.status} /></td><td className="px-5 py-4"><Status status={currentPaymentStatus} label={currentPaymentStatus === "paid" ? "Paid" : currentPaymentStatus === "failed" ? "Failed" : "Pending"} /></td><td className="px-5 py-4"><div className="flex flex-wrap justify-end gap-1"><button type="button" onClick={() => onOpen(bill.id)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--active-bg)]">View invoice</button>{canPay && onPay && <button type="button" onClick={() => onPay(bill)} className="min-h-11 rounded-xl bg-[var(--primary)] px-3 text-sm font-semibold text-white">Pay now</button>}{currentPaymentStatus === "paid" && onReceipt && <button type="button" onClick={() => onReceipt(bill.id)} className="min-h-11 rounded-xl border border-[var(--input-border)] px-3 text-sm font-semibold text-[var(--text-secondary)]">Receipt</button>}</div></td></tr>;
}

function BillCard({ bill, payment, onOpen, onPay, onReceipt }: { bill: MyBill; payment?: PaymentForBill; onOpen: (billId: number) => void; onPay?: (bill: MyBill) => void; onReceipt?: (billId: number) => void }) {
  const currentPaymentStatus = getEffectivePaymentStatus(bill, payment);
  const canPay = bill.status !== "paid" && currentPaymentStatus !== "paid";
  return <article className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]"><div className="flex justify-between gap-3"><div><h2 className="font-bold text-[var(--text-primary)]">{bill.invoice_number}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{dateLabel(bill.billing_period_start)} – {dateLabel(bill.billing_period_end)}</p></div><Status status={currentPaymentStatus} label={`Payment ${currentPaymentStatus}`} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-[var(--text-muted)]">Bill status</p><div className="mt-1"><Status status={bill.status} /></div></div><div><p className="text-xs text-[var(--text-muted)]">Due</p><p className="mt-1 font-semibold text-[var(--text-secondary)]">{dateLabel(bill.due_date)}</p></div></div><div className="mt-4 flex flex-wrap items-end justify-between gap-3"><p className="text-lg font-bold text-[var(--text-primary)]">{money(bill.total_amount)}</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onOpen(bill.id)} className="min-h-11 rounded-xl border border-[var(--input-border)] px-3 text-sm font-semibold text-[var(--text-secondary)]">View invoice</button>{canPay && onPay && <button type="button" onClick={() => onPay(bill)} className="min-h-11 rounded-xl bg-[var(--primary)] px-3 text-sm font-semibold text-white">Pay now</button>}{currentPaymentStatus === "paid" && onReceipt && <button type="button" onClick={() => onReceipt(bill.id)} className="min-h-11 rounded-xl border border-[var(--input-border)] px-3 text-sm font-semibold text-[var(--text-secondary)]">Receipt</button>}</div></div></article>;
}

export function MyInvoiceDetail({ billId, onBack, onPay, onReceipt }: { billId: number; onBack: () => void; onPay?: (bill: MyBill) => void; onReceipt?: (billId: number) => void }) {
  const payments = useDemoPayments();
  const [bill, setBill] = useState<MyBill | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; const load = () => { void getMyBill(billId).then((response) => { if (active) { setBill(response); setError(null); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load this invoice."); }); }; load(); window.addEventListener("powermanage-bill-change", load); return () => { active = false; window.removeEventListener("powermanage-bill-change", load); }; }, [billId]);
  const requestNotice = <RequestError message={error} retry={() => window.dispatchEvent(new Event("powermanage-bill-change"))} />;
  if (!bill && error) return <section><h1>Invoice</h1><button type="button" onClick={onBack}>Back to bills</button>{requestNotice}</section>;
  if (!bill) return <div className="grid min-h-[360px] place-items-center text-sm text-[var(--text-secondary)]"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" /> Loading invoice…</div>;

  const payment = authoritativePayment(bill, payments[String(bill.id)]);
  const currentPaymentStatus = getEffectivePaymentStatus(bill, payment);
  const canPay = bill.status !== "paid" && currentPaymentStatus !== "paid";
  return <>{requestNotice}<DocumentPreview bill={documentBill(bill)} kind="invoice" actions={<><button type="button" onClick={onBack}>Back to bills</button>{canPay && onPay && <button type="button" onClick={() => onPay(bill)}>Pay now</button>}{currentPaymentStatus === "paid" && onReceipt && <button type="button" onClick={() => onReceipt(bill.id)}>View receipt</button>}</>} />{currentPaymentStatus === "failed" && <p role="status" className="document-export-error">The last demo payment failed. You can try again.</p>}</>;
}

export function MyReceiptDetail({ billId, onBack }: { billId: number; onBack: () => void }) {
  const payments = useDemoPayments();
  const [bill, setBill] = useState<MyBill | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; const load = () => { void getMyBill(billId).then((response) => { if (active) { setBill(response); setError(null); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load this receipt."); }); }; load(); window.addEventListener("powermanage-bill-change", load); return () => { active = false; window.removeEventListener("powermanage-bill-change", load); }; }, [billId]);
  const requestNotice = <RequestError message={error} retry={() => window.dispatchEvent(new Event("powermanage-bill-change"))} />;
  if (!bill && error) return <section><h1>Receipt</h1><button type="button" onClick={onBack}>Back to bills</button>{requestNotice}</section>;
  if (!bill) return <div className="grid min-h-[360px] place-items-center text-sm text-[var(--text-secondary)]"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" /> Loading receipt…</div>;
  return <>{requestNotice}<PaymentReceipt bill={bill} payment={payments[String(bill.id)] ?? null} onBack={onBack} /></>;
}

