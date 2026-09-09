"use client";

import { useEffect, useMemo, useState } from "react";

import { isDecimalInput, isIntegerInput, parseFiniteInput, parseNonNegativeInput } from "@/lib/numericInput";
import { calculateElectricityBill, getTariffSettings } from "@/services/electricityApi";
import type { BillCalculationResponse, ElectricitySlab } from "@/types/electricity";

const field = "mt-1 h-11 w-full rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm outline-none";

export const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";

  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatUnits = (value: number | string | null | undefined) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";

  return num.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
};

export function AdminCalculator() {
  const [units, setUnits] = useState("");
  const [mode, setMode] = useState<"slab" | "manual">("slab");
  const [rate, setRate] = useState("");
  const [slabs, setSlabs] = useState<ElectricitySlab[]>([]);
  const [result, setResult] = useState<BillCalculationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getTariffSettings().then((settings) => setSlabs(settings.slabs)).catch(() => undefined);
  }, []);

  const parsedUnits = parseNonNegativeInput(units);
  const parsedRate = parseFiniteInput(rate);
  const activeSlabs = useMemo(
    () => mode === "manual" ? [{ min_units: 0, max_units: null, rate_per_unit: parsedRate ?? 0 }] : slabs,
    [mode, parsedRate, slabs],
  );

  const calculate = async () => {
    setError(null);
    if (parsedUnits === undefined || activeSlabs.length === 0) return setError("Enter valid units and configure a tariff first.");
    if (mode === "manual" && (parsedRate === undefined || parsedRate <= 0)) return setError("Enter a rate greater than zero.");

    try {
      setResult(await calculateElectricityBill({ units: parsedUnits, fixed_charge: 0, tax_rate: 0, slabs: activeSlabs }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to calculate this bill.");
    }
  };

  return <div className="space-y-5">
    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Calculator</p><h2 className="mt-1 text-2xl font-bold">Calculate a bill</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Only units and tariff rates are used for the final amount.</p></div>
    <section className="rounded-xl border border-[var(--border)] bg-white p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-[var(--text-secondary)]">Units consumed<input type="text" inputMode="numeric" value={units} onChange={(e) => { if (isIntegerInput(e.target.value)) setUnits(e.target.value); }} className={field} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Rate mode<select value={mode} onChange={(e) => setMode(e.target.value as "slab" | "manual")} className={field}><option value="slab">Auto slab</option><option value="manual">Manual rate</option></select></label></div>
      {mode === "manual" && <label className="mt-4 block text-xs font-semibold text-[var(--text-secondary)]">Per unit rate<input type="text" inputMode="decimal" value={rate} onChange={(e) => { if (isDecimalInput(e.target.value)) setRate(e.target.value); }} className={field} /></label>}
      <button type="button" onClick={() => void calculate()} className="mt-5 min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white">Calculate bill</button>
      {error && <p role="alert" className="mt-4 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</p>}
    </section>
    {result && <section className="rounded-xl border border-[var(--success)] bg-[var(--success-bg)] p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--success-text)]">Bill preview</p><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[var(--text-secondary)]">{formatUnits(result.total_units)} units</p><p className="mt-1 text-3xl font-bold">&#8377;{formatAmount(result.total_amount)}</p></div>{mode === "slab" && <div className="min-w-0 w-full sm:w-auto space-y-1 text-sm">{result.breakdown.map((item) => <div key={item.slab_label} className="flex justify-between gap-5"><span>{item.slab_label} &middot; {formatUnits(item.units_in_slab)} &times; &#8377;{formatAmount(item.rate_per_unit)}</span><strong>&#8377;{formatAmount(item.amount)}</strong></div>)}</div>}</div></section>}
  </div>;
}

export default AdminCalculator;
