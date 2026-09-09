"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo } from "react";

import type { Bill, PersistedMeterReading } from "@/types/electricity";

function numericValue(value: unknown) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUnits(value: number | null) {
  return value === null
    ? "—"
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function validReadingDate(value: unknown) {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : date;
}

type UsagePeriod = { date: string; units: number | null };

function getUsagePeriods(readings: PersistedMeterReading[]): UsagePeriod[] {
  const totals = new Map<string, { total: number; hasInvalidValue: boolean; hasValue: boolean }>();

  for (const reading of readings) {
    const date = validReadingDate(reading.reading_date);
    if (!date) continue;

    const period = totals.get(date) ?? { total: 0, hasInvalidValue: false, hasValue: false };
    const units = numericValue(reading.units_used);
    if (units === null) period.hasInvalidValue = true;
    else {
      period.total += units;
      period.hasValue = true;
    }
    totals.set(date, period);
  }

  return Array.from(totals, ([date, period]) => ({
    date,
    units: period.hasInvalidValue || !period.hasValue ? null : period.total,
  })).sort((left, right) => right.date.localeCompare(left.date));
}

function UsageMetricCard({ currentUnits, previousUnits, percentageChange }: { currentUnits: number | null; previousUnits: number | null; percentageChange: number | null }) {
  const hasCurrentUnits = currentUnits !== null;
  const hasPreviousUnits = previousUnits !== null;
  const isDecrease = percentageChange !== null && percentageChange < 0;
  const isIncrease = percentageChange !== null && percentageChange > 0;
  const TrendIcon = isDecrease ? ArrowDown : ArrowUp;
  const trendText = percentageChange === null
    ? "No prior period comparison"
    : `${formatUnits(Math.abs(percentageChange))}% vs previous period`;

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white p-5">
      <p className="text-xs text-[var(--text-muted)]">Units consumed</p>
      <div className="mt-2 min-w-0 max-w-full overflow-hidden">
        <p className="flex min-w-0 max-w-full items-baseline gap-1.5 truncate font-display text-2xl font-bold text-[var(--text-primary)]" title={hasCurrentUnits ? `${formatUnits(currentUnits)} kWh` : "—"}>
          <span className="min-w-0 truncate">{formatUnits(currentUnits)}</span>
          {hasCurrentUnits && <span className="shrink-0 text-sm font-semibold text-[var(--text-secondary)]">kWh</span>}
        </p>
        <p className="mt-2 min-w-0 max-w-full truncate text-xs text-[var(--text-secondary)]" title={hasPreviousUnits ? `${formatUnits(previousUnits)} kWh` : "No prior period data"}>
          <span className="text-[var(--text-muted)]">Previous period:</span>{" "}
          <span className="font-semibold">{hasPreviousUnits ? `${formatUnits(previousUnits)} kWh` : "—"}</span>
        </p>
        <p className={`mt-2 flex min-w-0 max-w-full items-center gap-1 truncate text-xs font-semibold ${isDecrease ? "text-[var(--success-text)]" : isIncrease ? "text-[var(--error)]" : "text-[var(--text-muted)]"}`} title={trendText}>
          {percentageChange !== null && percentageChange !== 0 && <TrendIcon className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{trendText}</span>
        </p>
      </div>
    </article>
  );
}

export function Reports({ bills, readings }: { bills: Bill[]; readings: PersistedMeterReading[] }) {
  const usagePeriods = useMemo(() => getUsagePeriods(readings), [readings]);
  const currentUnits = usagePeriods[0]?.units ?? null;
  const previousUnits = usagePeriods[1]?.units ?? null;
  const percentageChange = currentUnits !== null && previousUnits !== null && previousUnits !== 0
    ? ((currentUnits - previousUnits) / previousUnits) * 100
    : null;
  const totalAmount = bills.reduce((sum, item) => {
    const amount = numericValue(item.total_amount);
    return amount === null ? sum : sum + amount;
  }, 0);
  const bySubmitter = useMemo(() => [...bills].sort((a, b) => b.total_units - a.total_units).slice(0, 5), [bills]);

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-hidden">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Reports</p>
        <h2 className="mt-1 text-2xl font-bold">Billing overview</h2>
      </div>
      <div className="grid min-w-0 max-w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UsageMetricCard currentUnits={currentUnits} previousUnits={previousUnits} percentageChange={percentageChange} />
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white p-5">
          <p className="text-xs text-[var(--text-muted)]">Billing amount</p>
          <p className="mt-2 min-w-0 max-w-full truncate text-2xl font-bold text-[var(--text-primary)]" title={`₹${totalAmount.toLocaleString("en-IN")}`}>₹{totalAmount.toLocaleString("en-IN")}</p>
        </div>
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white p-5">
          <p className="text-xs text-[var(--text-muted)]">Paid bills</p>
          <p className="mt-2 truncate text-2xl font-bold text-[var(--text-primary)]">{bills.filter((bill) => bill.status === "paid").length.toLocaleString("en-IN")}</p>
        </div>
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white p-5">
          <p className="text-xs text-[var(--text-muted)]">Overdue bills</p>
          <p className="mt-2 truncate text-2xl font-bold text-[var(--text-primary)]">{bills.filter((bill) => bill.status === "overdue").length.toLocaleString("en-IN")}</p>
        </div>
      </div>
      <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white p-5 sm:p-7">
        <h3 className="font-bold">Highest consumption bills</h3>
        {bySubmitter.length === 0 ? <p className="mt-4 rounded-xl bg-[var(--subtle-teal)] p-4 text-sm text-[var(--text-secondary)]">Reports will appear after readings and bills are recorded.</p> : <div className="mt-4 space-y-3">{bySubmitter.map((bill) => { const units = numericValue(bill.total_units); const amount = numericValue(bill.total_amount); return <div key={bill.id} className="flex min-w-0 max-w-full flex-wrap justify-between gap-3 overflow-hidden border-b border-[var(--border)] pb-3 text-sm"><span className="min-w-0 truncate">{bill.recipient_label}</span><strong className="shrink-0">{units === null ? "—" : `${formatUnits(units)} kWh`} · ₹{amount === null ? "—" : amount.toLocaleString("en-IN")}</strong></div>; })}</div>}
      </section>
    </div>
  );
}

export default Reports;
