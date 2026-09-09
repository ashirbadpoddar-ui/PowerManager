"use client";

import { AlertCircle, ArrowRight, FileText, Gauge, IndianRupee, LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

import { getMyConsumption, getMySubmitter, listMyBills } from "@/services/portalApi";
import type { MyBill, MyConsumption, MySubmitterContext } from "@/types/portal";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function EmptyAssignment({ onMeter }: { onMeter: () => void }) {
  return <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-7 text-center shadow-[var(--shadow-card)] sm:p-10"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--active-bg)] text-[var(--primary)]"><Gauge className="h-6 w-6" /></div><h2 className="mt-4 font-display text-xl font-bold text-[var(--text-primary)]">No meter has been assigned</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">Ask your administrator to link your account to a submitter before you can see meter readings or bills.</p><button type="button" onClick={onMeter} className="mt-5 min-h-11 rounded-xl border border-[var(--input-border)] px-4 text-sm font-semibold text-[var(--text-secondary)]">View My Meter</button></div>;
}

export function UserDashboard({ name, onNavigate }: { name: string; onNavigate: (view: "my-meter" | "my-bills" | "consumption") => void }) {
  const [context, setContext] = useState<MySubmitterContext | null>(null);
  const [bills, setBills] = useState<MyBill[]>([]);
  const [consumption, setConsumption] = useState<MyConsumption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const submitted = await getMySubmitter();
        if (!active) return;
        setContext(submitted);
        if (!submitted.assigned) return;
        const [billResponse, usage] = await Promise.all([listMyBills(), getMyConsumption()]);
        if (!active) return;
        setBills(billResponse.items); setConsumption(usage);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load your account details.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="grid min-h-[360px] place-items-center text-sm text-[var(--text-secondary)]"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" /> Loading your workspace…</div>;
  if (error) return <div role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-4 text-sm text-[var(--error)]">{error}</div>;
  if (!context?.assigned) return <EmptyAssignment onMeter={() => onNavigate("my-meter")} />;

  const latestBill = bills[0];
  const status = latestBill?.status ?? "pending";
  const statusClass = status === "paid" ? "bg-[var(--success-bg)] text-[var(--success)]" : status === "overdue" ? "bg-[var(--error-bg)] text-[var(--error)]" : "bg-[var(--active-bg)] text-[var(--primary)]";
  const firstName = name.split(" ")[0] || name;

  return <div className="space-y-6"><section className="rounded-xl bg-[var(--panel-dark)] px-5 py-6 text-white shadow-[var(--shadow-premium)] sm:px-7 sm:py-8"><p className="text-sm text-white/70">Welcome back, {firstName}</p><h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Your electricity, at a glance.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/70">{context.property_name} · {context.unit} {context.property_place ? `· ${context.property_place}` : ""}</p></section>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Gauge} label="This month" value={`${consumption?.current_month_units ?? 0} units`} /><Metric icon={IndianRupee} label="Current bill" value={latestBill ? money(latestBill.total_amount) : "No bill yet"} /><Metric icon={FileText} label="Bill status" value={latestBill ? latestBill.status[0].toUpperCase() + latestBill.status.slice(1) : "No bill"} tone={latestBill?.status} /><Metric icon={MapPin} label="Meter" value={context.meter_name ?? "Main Meter"} /></div>
    <div className="grid gap-5 xl:grid-cols-[1.25fr,0.75fr]"><section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Current bill</p><h2 className="mt-1 font-display text-xl font-bold text-[var(--text-primary)]">{latestBill ? latestBill.invoice_number : "No invoice generated"}</h2></div>{latestBill && <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass}`}>{latestBill.status}</span>}</div>{latestBill ? <div className="mt-5 grid gap-4 sm:grid-cols-3"><Detail label="Amount" value={money(latestBill.total_amount)} /><Detail label="Period" value={`${dateLabel(latestBill.billing_period_start)} – ${dateLabel(latestBill.billing_period_end)}`} /><Detail label="Due date" value={dateLabel(latestBill.due_date)} /></div> : <p className="mt-5 text-sm leading-6 text-[var(--text-secondary)]">Your administrator has not generated a bill for the current period yet.</p>}<button type="button" onClick={() => onNavigate("my-bills")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]">View my bills <ArrowRight className="h-4 w-4" /></button></section>
      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Latest meter reading</p>{context.latest_reading ? <><p className="mt-3 font-display text-3xl font-bold text-[var(--text-primary)]">{context.latest_reading.units_used} <span className="text-base text-[var(--text-muted)]">units</span></p><p className="mt-1 text-sm text-[var(--text-secondary)]">{context.latest_reading.previous_reading} → {context.latest_reading.current_reading} on {dateLabel(context.latest_reading.reading_date)}</p></> : <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">No readings have been submitted for this meter.</p>}<button type="button" onClick={() => onNavigate("my-meter")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--input-border)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Submit a reading <ArrowRight className="h-4 w-4" /></button></section></div>
    <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]"><div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-[var(--primary)]" /><h2 className="font-bold text-[var(--text-primary)]">Personal alerts</h2></div><div className="mt-3 text-sm text-[var(--text-secondary)]">{latestBill?.status === "overdue" ? `Your bill of ${money(latestBill.total_amount)} was due on ${dateLabel(latestBill.due_date)}.` : latestBill ? `Your current bill is ${latestBill.status}. Due ${dateLabel(latestBill.due_date)}.` : "You will see bill and due-date updates here when available."}</div></section></div>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Gauge; label: string; value: string; tone?: string }) { return <article className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Icon className="h-4 w-4" /><p className="text-xs font-semibold">{label}</p></div><p className={`mt-3 text-xl font-bold ${tone === "overdue" ? "text-[var(--error)]" : "text-[var(--text-primary)]"}`}>{value}</p></article>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p><p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">{value}</p></div>; }
