"use client";

import { Check, CircleOff, Eye, ReceiptIndianRupee, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { DocumentPreview } from "@/components/documents/BillingDocument";
import { documentBill } from "@/lib/billingDocument";
import { useDemoPayments } from "@/hooks/useDemoPayments";
import { getEffectivePaymentStatus, paymentMethodLabel } from "@/services/demoPaymentStorage";
import { markBillPaid, updateBillDueDate, voidBill } from "@/services/electricityApi";
import type { Bill, BillStatus } from "@/types/electricity";
import type { DemoPaymentRecord, DemoPaymentStatus } from "@/types/payment";

type RecentBillsProps = {
  bills: Bill[];
  initialInvoice?: Bill | null;
  total: number;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  isLoading?: boolean;
  loadError?: string | null;
  onRefresh?: () => void | Promise<void>;
  onBillUpdated?: (bill: Bill) => void;
  lastRefreshedAt?: Date | null;
};

type DetailKind = "invoice" | "payment" | "receipt";

const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const billStatusStyles: Record<BillStatus, string> = {
  pending: "bg-[var(--warning-bg)] text-[var(--warning)] ring-[var(--warning)]",
  overdue: "bg-[var(--error-bg)] text-[var(--error)] ring-[var(--error)]",
  paid: "bg-[var(--success-bg)] text-[var(--success-text)] ring-[var(--success)]",
  void: "bg-[var(--hover-bg)] text-[var(--text-secondary)] ring-[var(--border)]",
};
const paymentStatusStyles: Record<DemoPaymentStatus, string> = {
  pending: "bg-[var(--warning-bg)] text-[var(--warning)]",
  failed: "bg-[var(--error-bg)] text-[var(--error)]",
  paid: "bg-[var(--success-bg)] text-[var(--success)]",
};

function formatDate(value: string, dateOnly = false) {
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}


function statusLabel(status: string) { return status.charAt(0).toUpperCase() + status.slice(1); }

function PaymentBadge({ status }: { status: DemoPaymentStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${paymentStatusStyles[status]}`}>Payment {statusLabel(status)}</span>;
}

function authoritativePayment(bill: Bill, fallback: DemoPaymentRecord | null | undefined): DemoPaymentRecord | null {
  if (bill.status !== "paid") return fallback?.status === "failed" ? fallback : null;
  return {
    billId: bill.id,
    invoiceNumber: bill.bill_number,
    status: "paid",
    method: bill.payment_method ?? null,
    transactionId: bill.transaction_id ?? null,
    paidAmount: bill.total_amount,
    paidAt: bill.paid_at ?? null,
    failedAt: null,
  };
}

export function RecentBills({ initialInvoice, bills, total, searchQuery: externalSearchQuery, onSearchQueryChange, isLoading = false, loadError, onRefresh, onBillUpdated, lastRefreshedAt }: RecentBillsProps) {
  const payments = useDemoPayments();
  const [updatingBillId, setUpdatingBillId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState("");
  const query = externalSearchQuery ?? localQuery;
  const updateQuery = onSearchQueryChange ?? setLocalQuery;
  const [filter, setFilter] = useState<"all" | BillStatus>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | DemoPaymentStatus>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "high" | "low">("newest");
  const [detail, setDetail] = useState<{ bill: Bill; kind: DetailKind } | null>(null);
  useEffect(() => {
    if (initialInvoice) setDetail({ bill: initialInvoice, kind: "invoice" });
  }, [initialInvoice]);
  useEffect(() => {
    setDetail((current) => {
      const refreshed = current ? bills.find((bill) => bill.id === current.bill.id) : null;
      return refreshed && current ? { ...current, bill: refreshed } : null;
    });
  }, [bills]);
  const visibleBills = [...bills]
    .filter((bill) => {
      const paymentStatus = getEffectivePaymentStatus(bill, authoritativePayment(bill, payments[String(bill.id)]));
      const normalizedQuery = query.trim().toLowerCase();
      const billingPeriod = `${bill.period_start} ${bill.period_end} ${formatDate(bill.period_start, true)} ${formatDate(bill.period_end, true)}`;
      return (filter === "all" || bill.status === filter)
        && (paymentFilter === "all" || paymentStatus === paymentFilter)
        && (!normalizedQuery || [bill.id, bill.bill_number, bill.recipient_label, bill.property_label, bill.unit_label, billingPeriod, bill.status, paymentStatus]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)));
    })
    .sort((a, b) => sort === "high" ? b.total_amount - a.total_amount : sort === "low" ? a.total_amount - b.total_amount : sort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));

  const updateStatus = async (bill: Bill, action: "paid" | "void") => {
    if (action === "void" && !window.confirm(`Void invoice ${bill.bill_number}? This cannot be undone.`)) return;
    setUpdatingBillId(bill.id);
    setActionError(null);
    try {
      const updatedBill = action === "paid" ? await markBillPaid(bill.id) : await voidBill(bill.id);
      onBillUpdated?.(updatedBill);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : `Unable to mark the invoice as ${action}.`);
    } finally {
      setUpdatingBillId(null);
    }
  };

  const editDueDate = async (bill: Bill) => {
    const dueDate = window.prompt("Due date (YYYY-MM-DD)", bill.due_date);
    if (!dueDate || dueDate === bill.due_date) return;
    try {
      onBillUpdated?.(await updateBillDueDate(bill.id, dueDate));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to update due date.");
    }
  };

  return <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-card)]">
    {lastRefreshedAt && <p className="px-5 pt-3 text-right text-xs text-[var(--text-muted)]">Last refreshed {lastRefreshedAt.toLocaleTimeString()}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Persisted records</p><h2 className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">Billing &amp; invoices</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{total} invoice{total === 1 ? "" : "s"} visible to your account</p></div>{onRefresh && <button type="button" onClick={() => void onRefresh()} disabled={isLoading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover-bg)] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh</button>}</div>
    {(loadError || actionError) && <div role="alert" className="m-5 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{actionError ?? loadError}</div>}
    <div className="grid gap-3 border-b border-[var(--border)] px-5 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:px-6"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input aria-label="Search invoices" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search invoice or submitter" className="h-11 w-full rounded-xl border border-[var(--input-border)] bg-white pl-9 pr-11 text-base outline-none sm:text-sm" />{query && <button type="button" aria-label="Clear invoice search" onClick={() => updateQuery("")} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"><X className="h-4 w-4" /></button>}</label><select aria-label="Filter invoices" value={filter} onChange={(event) => setFilter(event.target.value as "all" | BillStatus)} className="h-11 rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm"><option value="all">All bill statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Draft / void</option></select><select aria-label="Filter payment status" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as "all" | DemoPaymentStatus)} className="h-11 rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm"><option value="all">All payment statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option></select><select aria-label="Sort invoices" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-11 rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="high">Amount high to low</option><option value="low">Amount low to high</option></select></div>
    {isLoading && bills.length === 0 ? <div className="grid min-h-[260px] place-items-center p-8 text-sm text-[var(--text-muted)]"><span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading invoices...</span></div> : visibleBills.length === 0 ? <div className="grid min-h-[280px] place-items-center p-8 text-center"><div className="max-w-sm">{query.trim() ? <p className="text-sm text-[var(--text-muted)]">No results found for &apos;{query}&apos;.</p> : <><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--success-bg)] text-[var(--success-text)]"><ReceiptIndianRupee className="h-5 w-5" /></div><h3 className="mt-4 text-lg font-bold text-[var(--text-primary)]">No invoices yet</h3><p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">Calculate a bill first, then use its Generate invoice action to save it here.</p></>}</div></div> : <div className="divide-y divide-[var(--border)]">{visibleBills.map((bill) => {
      const payment = authoritativePayment(bill, payments[String(bill.id)]);
      const paymentStatus = getEffectivePaymentStatus(bill, payment);
      const isUpdating = updatingBillId === bill.id;
      const canUpdate = bill.status === "pending" || bill.status === "overdue";
      return <article key={bill.id} data-testid="invoice-card" className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-display text-base font-bold text-[var(--text-primary)]">{bill.bill_number}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${billStatusStyles[bill.status]}`}>{bill.status}</span><PaymentBadge status={paymentStatus} /></div><p className="mt-2 truncate text-sm font-semibold text-[var(--text-secondary)]">{bill.recipient_label}</p><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{[bill.property_label, bill.unit_label].filter(Boolean).join(" · ") || "No property or unit label"}</p></div><div className="grid grid-cols-2 gap-3 text-xs text-[var(--text-muted)]"><div><p className="font-semibold text-[var(--text-secondary)]">Billing period</p><p className="mt-1">{formatDate(bill.period_start, true)} – {formatDate(bill.period_end, true)}</p></div><div><p className="font-semibold text-[var(--text-secondary)]">Due date</p><p className="mt-1">{formatDate(bill.due_date, true)}</p></div><div><p className="font-semibold text-[var(--text-secondary)]">Usage</p><p className="mt-1">{bill.total_units.toLocaleString("en-IN")} kWh</p></div><div><p className="font-semibold text-[var(--text-secondary)]">Paid date</p><p className="mt-1">{payment?.paidAt ? formatDate(payment.paidAt) : bill.paid_at ? formatDate(bill.paid_at) : "—"}</p></div><div><p className="font-semibold text-[var(--text-secondary)]">Method</p><p className="mt-1 truncate">{paymentMethodLabel(payment?.method)}</p></div></div><div className="flex flex-col items-stretch gap-3 sm:items-start lg:items-end"><p className="font-display text-xl font-bold text-[var(--text-primary)]">{currencyFormatter.format(bill.total_amount)}</p><div className="flex flex-wrap gap-2 sm:justify-end"><button type="button" onClick={() => setDetail({ bill, kind: "invoice" })} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]"><Eye className="h-3.5 w-3.5" />View invoice</button><button type="button" onClick={() => setDetail({ bill, kind: "payment" })} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">Payment</button>{paymentStatus === "paid" && <button type="button" onClick={() => setDetail({ bill, kind: "receipt" })} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">Receipt</button>}</div>{canUpdate && <div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => void updateStatus(bill, "paid")} disabled={isUpdating} aria-label={`Mark ${bill.bill_number} as paid`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[38px]"><Check className="h-3.5 w-3.5" /> Mark paid</button><button type="button" onClick={() => void updateStatus(bill, "void")} disabled={isUpdating} aria-label={`Void ${bill.bill_number}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--error)] hover:bg-[var(--error-bg)] hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[38px]"><CircleOff className="h-3.5 w-3.5" /> Void</button><button type="button" onClick={() => void editDueDate(bill)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">Edit due date</button></div>}</div></article>;
    })}</div>}
    {detail && <AdminBillDetail bill={detail.bill} kind={detail.kind} payment={authoritativePayment(detail.bill, payments[String(detail.bill.id)])} onClose={() => setDetail(null)} />}
  </section>;
}

export function AdminBillDetail({ bill, kind, payment, onClose }: { bill: Bill; kind: DetailKind; payment: DemoPaymentRecord | null; onClose: () => void }) {
  const paymentStatus = getEffectivePaymentStatus(bill, payment);
  const closeOnOverlay = (event: React.MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose(); };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-2 sm:p-4" onClick={closeOnOverlay}><div role="dialog" aria-modal="true" aria-label={kind === "receipt" ? "Receipt preview" : "Invoice preview"} className="w-full max-w-4xl overflow-y-auto rounded-xl bg-[var(--background)] p-3 sm:p-5">
    <DocumentPreview bill={documentBill(bill)} kind={kind === "receipt" ? "receipt" : "invoice"} actions={<button type="button" onClick={onClose} aria-label="Close invoice details"><X size={16} />Close</button>} />
    {kind === "payment" && paymentStatus !== "paid" && <p className="mt-4 text-sm text-[var(--text-secondary)]">No successful demo payment has been recorded for this invoice.</p>}
  </div></div>;
}

export default RecentBills;
