"use client";
import { RequestError } from "@/components/RequestError";

import { BarChart3, LoaderCircle, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

import { getMyConsumption } from "@/services/portalApi";
import type { MyConsumption } from "@/types/portal";

export function Consumption() {
  const [data, setData] = useState<MyConsumption | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getMyConsumption().then((response) => { if (active) setData(response); }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load your consumption history."); });
    return () => { active = false; };
  }, []);
  if (!data && error) return <section><h1>Your energy usage</h1><RequestError message={error} /></section>;
  if (!data) return <div className="grid min-h-[360px] place-items-center text-sm text-[var(--text-secondary)]"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" /> Loading consumption…</div>;
  const increase = data.absolute_change >= 0;
  const max = Math.max(...data.history.map((point) => point.units), 1);
  return <div className="min-w-0 space-y-5 pb-28 lg:space-y-6 lg:pb-6">
    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Consumption</p><h1 className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">Your energy usage</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">A personal view of readings submitted for your assigned meter.</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><Card label="Current month" value={`${data.current_month_units} units`} /><Card label="Previous month" value={`${data.previous_month_units} units`} /><article className="min-w-0 rounded-xl border border-[var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-card)]"><p className="text-xs font-semibold text-[var(--text-muted)]">Change</p><div className={`mt-3 flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl ${increase ? "text-[var(--error)]" : "text-[var(--success)]"}`}>{increase ? <TrendingUp className="h-5 w-5 shrink-0" /> : <TrendingDown className="h-5 w-5 shrink-0" />}{Math.abs(data.absolute_change)} units</div><p className="mt-1 text-xs text-[var(--text-muted)]">{data.percentage_change === null ? "No prior comparison" : `${Math.abs(data.percentage_change).toFixed(1)}% ${increase ? "higher" : "lower"}`}</p></article></div>
    <section className="min-w-0 rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Recent trend</p><h2 className="mt-1 font-bold text-[var(--text-primary)]">Last 12 months</h2></div>{data.history.length === 0 ? <div className="grid min-h-60 place-items-center text-center"><div><BarChart3 className="mx-auto h-9 w-9 text-[var(--primary)]" /><h3 className="mt-3 font-semibold text-[var(--text-primary)]">No consumption history yet</h3><p className="mt-1 text-sm text-[var(--text-muted)]">Your chart will appear after readings are submitted.</p></div></div> : <div className="mt-5 flex h-64 min-w-0 items-end gap-2 overflow-x-auto pb-5">{data.history.map((point) => <div key={point.month} className="flex h-full min-w-12 flex-1 flex-col justify-end text-center"><span className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">{point.units}</span><div title={`${point.label}: ${point.units} units`} className="min-h-1 rounded-t bg-[var(--chart-fill)]" style={{ height: `${Math.max((point.units / max) * 100, 3)}%` }} /><span className="mt-2 text-[10px] text-[var(--text-muted)]">{point.label.split(" ")[0]}</span></div>)}</div>}</section>
  </div>;
}

function Card({ label, value }: { label: string; value: string }) {
  return <article className="min-w-0 rounded-xl border border-[var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-card)]"><p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p><p className="mt-3 truncate text-xl font-bold text-[var(--text-primary)]">{value}</p></article>;
}
