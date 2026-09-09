"use client";

import { CheckCircle2, ExternalLink, FilePlus2, Gauge, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createDefaultBillingDates } from "@/lib/billingDates";
import { isDecimalInput, parseFiniteInput, parseNonNegativeInput } from "@/lib/numericInput";
import { generateSubmitterBill } from "@/services/electricityApi";
import type { Bill, ElectricitySlab, PersistedMeterReading, Property } from "@/types/electricity";

const inputClass = "mt-1 h-11 w-full rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)]";
const money = (value: number) => `\u20b9${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateSlabTotal(units: number, slabs: ElectricitySlab[]) {
  if (units <= 0 || slabs.length === 0) return 0;

  let remaining = units;
  let total = 0;
  for (const slab of [...slabs].sort((left, right) => left.min_units - right.min_units)) {
    if (remaining <= 0) break;
    const upper = slab.max_units ?? Number.POSITIVE_INFINITY;
    const slabUnits = Math.min(remaining, Math.max(0, upper - slab.min_units));
    if (slabUnits <= 0) continue;
    total += slabUnits * slab.rate_per_unit;
    remaining -= slabUnits;
  }
  return roundMoney(total);
}

type PropertyBillingProps = {
  property: Property;
  readings: PersistedMeterReading[];
  tariff: ElectricitySlab[];
  onBillGenerated?: (bill: Bill) => void;
  onOpenBilling?: () => void;
};

export function PropertyBilling({ property, readings, tariff, onBillGenerated, onOpenBilling }: PropertyBillingProps) {
  const assignedSubmitters = useMemo(
    () => property.submitters.filter((submitter) => submitter.user_id !== null),
    [property.submitters],
  );
  const [submitterId, setSubmitterId] = useState<number | null>(assignedSubmitters[0]?.id ?? null);
  const selectedSubmitter = assignedSubmitters.find((submitter) => submitter.id === submitterId) ?? null;
  const latestReading = useMemo(() => readings
    .filter((reading) => reading.property_id === property.id && reading.submitter_id === selectedSubmitter?.id)
    .sort((left, right) => right.reading_date.localeCompare(left.reading_date) || right.id - left.id)[0], [property.id, readings, selectedSubmitter?.id]);
  const [previousReading, setPreviousReading] = useState(latestReading ? String(latestReading.previous_reading) : "");
  const [currentReading, setCurrentReading] = useState(latestReading ? String(latestReading.current_reading) : "");
  const [meterName, setMeterName] = useState(latestReading?.meter_name ?? "Main Meter");
  const [rateMode, setRateMode] = useState<"manual" | "slab">("manual");
  const [manualRate, setManualRate] = useState(tariff[0] ? String(tariff[0].rate_per_unit) : "");
  const [dates, setDates] = useState(createDefaultBillingDates);
  const [calculated, setCalculated] = useState(false);
  const [generated, setGenerated] = useState<Bill | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedReadingKey = useRef<string | null>(null);

  useEffect(() => {
    if (submitterId === null || !assignedSubmitters.some((submitter) => submitter.id === submitterId)) {
      setSubmitterId(assignedSubmitters[0]?.id ?? null);
    }
  }, [assignedSubmitters, submitterId]);

  useEffect(() => {
    const key = `${property.id}:${selectedSubmitter?.id ?? ""}`;
    if (initializedReadingKey.current === key) return;
    initializedReadingKey.current = key;

    setRateMode("manual");
    setManualRate(tariff[0] ? String(tariff[0].rate_per_unit) : "");
    setCalculated(false);
    setGenerated(null);
    setError(null);

    if (!latestReading) {
      setPreviousReading("");
      setCurrentReading("");
      setMeterName("Main Meter");
      return;
    }
    setPreviousReading(String(latestReading.previous_reading));
    setCurrentReading(String(latestReading.current_reading));
    setMeterName(latestReading.meter_name);
  // Initialize once per selected user meter. Parent refreshes must not replace
  // an administrator's in-progress edits for the same selection.
  }, [latestReading, property.id, selectedSubmitter?.id, tariff]);
  const parsedPreviousReading = parseNonNegativeInput(previousReading);
  const parsedCurrentReading = parseNonNegativeInput(currentReading);
  const parsedManualRate = parseFiniteInput(manualRate);
  const units = parsedPreviousReading !== undefined && parsedCurrentReading !== undefined
    ? Math.max(0, parsedCurrentReading - parsedPreviousReading)
    : null;
  const estimatedAmount = units === null ? null : rateMode === "manual"
    ? parsedManualRate === undefined ? null : roundMoney(units * parsedManualRate)
    : calculateSlabTotal(units, tariff);

  const updateValue = () => {
    setCalculated(false);
    setGenerated(null);
  };

  const calculate = () => {
    setError(null);
    setGenerated(null);
    if (!selectedSubmitter) {
      setError("Assign a user to this property before generating an invoice.");
      return;
    }
    if (parsedPreviousReading === undefined || parsedCurrentReading === undefined) {
      setError("Previous and current readings are required.");
      return;
    }
    if (parsedCurrentReading < parsedPreviousReading) {
      setError("Current reading cannot be lower than previous reading.");
      return;
    }
    if (rateMode === "manual" && (parsedManualRate === undefined || parsedManualRate <= 0)) {
      setError("Enter a manual rate greater than zero.");
      return;
    }
    if (rateMode === "slab" && tariff.length === 0) {
      setError("Configure a tariff before calculating this invoice.");
      return;
    }
    setCalculated(true);
  };

  const generate = async () => {
    if (!selectedSubmitter || !calculated) return;

    const previousReadingValue = Number(previousReading);
    const currentReadingValue = Number(currentReading);
    const ratePerUnitValue = Number(manualRate);
    if (
      previousReading.trim() === "" ||
      currentReading.trim() === "" ||
      !Number.isFinite(previousReadingValue) ||
      !Number.isFinite(currentReadingValue)
    ) {
      setError("Previous and current readings are required numeric values.");
      return;
    }
    if (currentReadingValue < previousReadingValue) {
      setError("Current reading cannot be lower than previous reading.");
      return;
    }
    if (rateMode === "manual" && (
      manualRate.trim() === "" ||
      !Number.isFinite(ratePerUnitValue) ||
      ratePerUnitValue <= 0
    )) {
      setError("Enter a manual rate greater than zero.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const bill = await generateSubmitterBill({
        idempotency_key: globalThis.crypto.randomUUID(),
        submitter_id: selectedSubmitter.id,
        previous_reading: previousReadingValue,
        current_reading: currentReadingValue,
        rate_mode: rateMode,
        rate_per_unit: rateMode === "manual" ? ratePerUnitValue : null,
        metadata: dates,
      });
      setGenerated(bill);
      onBillGenerated?.(bill);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate this invoice.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="mt-5 rounded-xl border border-[var(--primary)]/20 bg-[var(--subtle-teal)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Property billing</p>
        <h4 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Generate an invoice for this room</h4>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Use the assigned user and this property&apos;s meter reading to create one shared invoice.</p>
      </div>
      <Gauge className="h-5 w-5 text-[var(--primary)]" />
    </div>

    {assignedSubmitters.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-[var(--warning)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning)]">Assign a User / Submitter account above before generating an invoice for this property.</div> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Assigned user</p><p className="mt-1 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><UserRound className="h-4 w-4 text-[var(--primary)]" />{selectedSubmitter?.name}</p></div>
        <div className="rounded-xl border border-[var(--border)] bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Meter</p><p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{meterName}</p></div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-[var(--text-secondary)]">User / Submitter<select value={submitterId ?? ""} onChange={(event) => { setSubmitterId(Number(event.target.value)); updateValue(); }} className={inputClass}>{assignedSubmitters.map((submitter) => <option key={submitter.id} value={submitter.id}>{submitter.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-[var(--text-secondary)]">Previous reading<input type="text" inputMode="decimal" value={previousReading} onChange={(event) => { if (isDecimalInput(event.target.value)) { setPreviousReading(event.target.value); updateValue(); } }} className={inputClass} /></label>
        <label className="text-xs font-semibold text-[var(--text-secondary)]">Current reading<input type="text" inputMode="decimal" value={currentReading} onChange={(event) => { if (isDecimalInput(event.target.value)) { setCurrentReading(event.target.value); updateValue(); } }} className={inputClass} /></label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-[var(--text-secondary)]">Rate mode<select value={rateMode} onChange={(event) => { setRateMode(event.target.value as "manual" | "slab"); updateValue(); }} className={inputClass}><option value="manual">Manual per-unit rate</option><option value="slab">Auto slab tariff</option></select></label>
        {rateMode === "manual" ? <label className="text-xs font-semibold text-[var(--text-secondary)]">Rate per unit<input type="text" inputMode="decimal" value={manualRate} onChange={(event) => { if (isDecimalInput(event.target.value)) { setManualRate(event.target.value); updateValue(); } }} className={inputClass} /></label> : <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm text-[var(--text-secondary)]"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Configured slabs</p><p className="mt-1 font-semibold">{tariff.map((slab) => `${slab.min_units}${slab.max_units === null ? "+" : `\u2013${slab.max_units}`} @ \u20b9${slab.rate_per_unit}`).join(" \u00b7 ") || "Not configured"}</p></div>}
        <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm text-[var(--text-secondary)]"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Units consumed</p><p className={`mt-1 text-lg font-bold ${parsedCurrentReading !== undefined && parsedPreviousReading !== undefined && parsedCurrentReading < parsedPreviousReading ? "text-[var(--error)]" : "text-[var(--primary)]"}`}>{parsedCurrentReading !== undefined && parsedPreviousReading !== undefined && parsedCurrentReading < parsedPreviousReading ? "Invalid" : units === null ? "—" : `${units} units`}</p></div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-[var(--text-secondary)]">Billing period start<input type="date" value={dates.period_start} onChange={(event) => { setDates((current) => ({ ...current, period_start: event.target.value })); updateValue(); }} className={inputClass} /></label>
        <label className="text-xs font-semibold text-[var(--text-secondary)]">Billing period end<input type="date" min={dates.period_start} value={dates.period_end} onChange={(event) => { setDates((current) => ({ ...current, period_end: event.target.value })); updateValue(); }} className={inputClass} /></label>
        <label className="text-xs font-semibold text-[var(--text-secondary)]">Due date<input type="date" min={dates.period_end} value={dates.due_date} onChange={(event) => { setDates((current) => ({ ...current, due_date: event.target.value })); updateValue(); }} className={inputClass} /></label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/20 bg-white p-4"><div><p className="text-xs font-semibold text-[var(--text-muted)]">Estimated bill</p><p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{estimatedAmount === null ? "—" : money(estimatedAmount)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{units === null ? "Enter both readings" : `${units} units ${rateMode === "manual" && parsedManualRate !== undefined ? `\u00d7 ${money(parsedManualRate)}` : rateMode === "manual" ? "" : "using configured slabs"}`}</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><button type="button" onClick={calculate} className="min-h-11 rounded-xl border border-[var(--primary)] px-4 text-sm font-bold text-[var(--primary)] hover:bg-[var(--active-bg)]">Calculate</button><button type="button" onClick={() => void generate()} disabled={!calculated || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><FilePlus2 className="h-4 w-4" />{busy ? "Generating…" : "Generate Invoice"}</button></div></div>
    </>}

    {error && <p role="alert" className="mt-3 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</p>}
    {generated && <div role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--success)] bg-white p-3 text-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" /><p className="min-w-0 flex-1 font-semibold text-[var(--success-text)]">{generated.email_status === "scheduled" ? "Invoice created; email notification scheduled." : <><span>Invoice generated successfully.</span><span className="ml-1 font-normal text-[var(--text-secondary)]">{generated.email_status === "not_available" ? "Email notification unavailable." : "Email notification was not scheduled."}</span></>}<span className="ml-1 font-normal text-[var(--text-secondary)]">{generated.bill_number} is now available to {selectedSubmitter?.name} in My Bills.</span></p>{onOpenBilling && <button type="button" aria-label="Open Billing & Invoices" title="View Billing & Invoices" onClick={onOpenBilling} className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"><ExternalLink className="h-5 w-5" /></button>}</div>}
  </section>;
}
