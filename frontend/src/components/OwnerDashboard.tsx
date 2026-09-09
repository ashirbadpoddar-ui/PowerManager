"use client";

import { CheckCircle2, ExternalLink, FilePlus2, Plus, Trash, X } from "lucide-react";
import { useEffect, useState } from "react";

import { createDefaultBillingRunMetadata, isValidBillingDateRange } from "@/lib/billingDates";
import { isDecimalInput, parseFiniteInput, parseNonNegativeInput } from "@/lib/numericInput";
import { calculateDetailedBill, generateDetailedBills } from "@/services/electricityApi";
import type { Bill, BillingRunMetadata, DetailedBillGenerationResponse, DetailedBillRequest, DetailedBillResponse, PropertyListResponse, SubmitterReading } from "@/types/electricity";

type MeterDraft = { previous_reading: string; current_reading: string; rate_per_unit: string };
const defaultMainMeter: MeterDraft = { previous_reading: "", current_reading: "", rate_per_unit: "" };
const defaultSubmitter = (submitter_id: number, name: string): MeterDraft & { submitter_id: number; name: string } => ({ submitter_id, name, previous_reading: "", current_reading: "", rate_per_unit: "" });
type OwnerDashboardProps = { properties?: PropertyListResponse; onBillsGenerated?: (bills: Bill[]) => void; onOpenBilling?: () => void };
const inputClass = "mt-1 w-full rounded-xl border border-[var(--input-border)] bg-white p-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)]";
const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OwnerDashboard({ properties = { items: [], total: 0, submitter_total: 0 }, onBillsGenerated, onOpenBilling }: OwnerDashboardProps) {
  const [mainMeter, setMainMeter] = useState<MeterDraft>(defaultMainMeter);
  const [propertyId, setPropertyId] = useState<number>(properties.items[0]?.id ?? 0);
  const selectedProperty = properties.items.find((property) => property.id === propertyId) ?? null;
  const eligibleSubmitters = selectedProperty?.submitters.filter((submitter) => submitter.user_id !== null) ?? [];
  const [submitters, setSubmitters] = useState<Array<MeterDraft & { submitter_id: number; name: string }>>([]);
  const [response, setResponse] = useState<DetailedBillResponse | null>(null);
  const [previewRequest, setPreviewRequest] = useState<DetailedBillRequest | null>(null);
  const [metadata, setMetadata] = useState<BillingRunMetadata>(() => createDefaultBillingRunMetadata());
  const [generationResult, setGenerationResult] = useState<DetailedBillGenerationResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setResponse(null); setPreviewRequest(null); setGenerationResult(null); }, [mainMeter, submitters]);
  const updateSubmitter = (index: number, values: Partial<MeterDraft & { submitter_id: number; name: string }>) => setSubmitters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  const changeProperty = (id: number) => { setPropertyId(id); setSubmitters([]); setResponse(null); setPreviewRequest(null); setGenerationResult(null); };
  const addSubmitter = () => { const available = eligibleSubmitters.find((candidate) => !submitters.some((item) => item.submitter_id === candidate.id)); if (available) setSubmitters((current) => [...current, defaultSubmitter(available.id, available.name)]); };

  const handleCalculate = async () => {
    setIsSubmitting(true); setError(null);
    const mainPrevious = parseNonNegativeInput(mainMeter.previous_reading);
    const mainCurrent = parseNonNegativeInput(mainMeter.current_reading);
    const mainRate = parseFiniteInput(mainMeter.rate_per_unit);
    if (mainPrevious === undefined || mainCurrent === undefined || mainRate === undefined || mainRate <= 0 || mainCurrent < mainPrevious) {
      setError("Enter valid main meter readings and a rate greater than zero."); setIsSubmitting(false); return;
    }
    const numericSubmitters: SubmitterReading[] = [];
    for (const submitter of submitters) {
      const previous = parseNonNegativeInput(submitter.previous_reading);
      const current = parseNonNegativeInput(submitter.current_reading);
      const rate = parseFiniteInput(submitter.rate_per_unit);
      if (!submitter.name.trim() || previous === undefined || current === undefined || rate === undefined || rate <= 0 || current < previous) {
        setError("Enter a name, valid readings, and a rate greater than zero for every submitter."); setIsSubmitting(false); return;
      }
      numericSubmitters.push({ submitter_id: submitter.submitter_id, name: submitter.name, previous_reading: previous, current_reading: current, rate_per_unit: rate });
    }
    const request: DetailedBillRequest = { main_meter: { previous_reading: mainPrevious, current_reading: mainCurrent, rate_per_unit: mainRate }, submitters: numericSubmitters };
    try { setResponse(await calculateDetailedBill(request)); setPreviewRequest(request); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to calculate electricity bill."); }
    finally { setIsSubmitting(false); }
  };

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null);
    if (!previewRequest) { setError("Calculate a preview before generating invoices."); return; }
    if (!isValidBillingDateRange(metadata)) { setError("Billing dates must be ordered from period start through due date."); return; }
    setIsGenerating(true);
    try {
      const result = await generateDetailedBills({ idempotency_key: globalThis.crypto.randomUUID(), property_id: propertyId, calculation: previewRequest, metadata: { ...metadata, owner_recipient_label: "Main Meter" } });
      setGenerationResult(result); onBillsGenerated?.(result.invoices);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to generate invoices."); }
    finally { setIsGenerating(false); }
  };

  const updateMetadata = <Key extends keyof BillingRunMetadata>(key: Key, value: BillingRunMetadata[Key]) => { setMetadata((current) => ({ ...current, [key]: value })); setGenerationResult(null); };
  const openBilling = () => { setGenerationResult(null); onOpenBilling?.(); };

  return <div className="min-w-0 space-y-5 sm:space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-bold sm:text-2xl">Meter Billing</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Calculate each meter normally with its own rate.</p></div><button type="button" onClick={handleCalculate} disabled={isSubmitting} className="min-h-11 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">{isSubmitting ? "Calculating..." : "Calculate"}</button></div>

    <section className="rounded-xl border border-[var(--border)] bg-white p-5"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">1. Property and Main Meter</p><h3 className="mt-1 text-lg font-semibold">Main meter reading</h3></div><div className="grid gap-3 sm:grid-cols-4"><label className="text-xs font-semibold text-[var(--text-secondary)]">Property<select value={propertyId} onChange={(e) => changeProperty(Number(e.target.value))} className={inputClass}><option value={0} disabled>Select property</option>{properties.items.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.unit}</option>)}</select></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Previous reading<input type="text" inputMode="decimal" value={mainMeter.previous_reading} onChange={(e) => { if (isDecimalInput(e.target.value)) setMainMeter({ ...mainMeter, previous_reading: e.target.value }); }} className={inputClass} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Current reading<input type="text" inputMode="decimal" value={mainMeter.current_reading} onChange={(e) => { if (isDecimalInput(e.target.value)) setMainMeter({ ...mainMeter, current_reading: e.target.value }); }} className={inputClass} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Rate per unit<input type="text" inputMode="decimal" value={mainMeter.rate_per_unit} onChange={(e) => { if (isDecimalInput(e.target.value)) setMainMeter({ ...mainMeter, rate_per_unit: e.target.value }); }} className={inputClass} /></label></div></section>

    <section className="rounded-xl border border-[var(--border)] bg-white p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">2. Submitters</p><h3 className="mt-1 text-lg font-semibold">Linked submitter readings</h3></div><button type="button" onClick={addSubmitter} disabled={!eligibleSubmitters.some((candidate) => !submitters.some((item) => item.submitter_id === candidate.id))} className="inline-flex items-center gap-1 rounded-xl bg-[var(--active-bg)] px-3 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-60"><Plus className="h-4 w-4" /> Add</button></div><div className="space-y-3">{submitters.map((submitter, index) => <div key={submitter.submitter_id} className="rounded-xl border border-[var(--border)] p-3"><div className="mb-3 flex items-center justify-between"><label className="text-sm font-semibold text-[var(--text-primary)]">Submitter {index + 1}<select value={submitter.submitter_id} onChange={(e) => { const next = eligibleSubmitters.find((candidate) => candidate.id === Number(e.target.value)); if (next) updateSubmitter(index, { submitter_id: next.id, name: next.name }); }} className="ml-2 rounded-lg border border-[var(--border)] px-2 py-1 text-sm font-normal">{eligibleSubmitters.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={submitters.some((item, itemIndex) => itemIndex !== index && item.submitter_id === candidate.id)}>{candidate.name}</option>)}</select></label><button type="button" aria-label={`Remove submitter ${index + 1}`} onClick={() => setSubmitters(submitters.filter((_, itemIndex) => itemIndex !== index))} className="text-[var(--error)]"><Trash className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-[var(--text-secondary)]">Previous<input type="text" inputMode="decimal" value={submitter.previous_reading} onChange={(e) => { if (isDecimalInput(e.target.value)) updateSubmitter(index, { previous_reading: e.target.value }); }} className={inputClass} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Current<input type="text" inputMode="decimal" value={submitter.current_reading} onChange={(e) => { if (isDecimalInput(e.target.value)) updateSubmitter(index, { current_reading: e.target.value }); }} className={inputClass} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Rate per unit<input type="text" inputMode="decimal" value={submitter.rate_per_unit} onChange={(e) => { if (isDecimalInput(e.target.value)) updateSubmitter(index, { rate_per_unit: e.target.value }); }} className={inputClass} /></label></div></div>)}{submitters.length === 0 && <p className="rounded-xl bg-[var(--hover-bg)] p-4 text-sm text-[var(--text-secondary)]">Select active linked submitters to generate user invoices. The main meter can still be calculated.</p>}</div></section>

    {error && <div role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</div>}
    {response && <section className="rounded-xl border border-[var(--success)] bg-[var(--success-bg)]/60 p-5"><h3 className="text-lg font-semibold">Calculation results</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white p-4"><p className="text-xs font-semibold uppercase text-[var(--text-muted)]">Main meter</p><p className="mt-2 text-sm">{response.main_meter.units} units × {money(response.main_meter.rate_per_unit)}</p><p className="mt-1 text-2xl font-bold text-[var(--primary)]">{money(response.main_meter.total_amount)}</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-semibold uppercase text-[var(--text-muted)]">Submitter total</p><p className="mt-2 text-sm">{response.submitter_total_units} units</p><p className="mt-1 text-2xl font-bold text-[var(--primary)]">{money(response.submitter_total_amount)}</p></div></div><div className="mt-4 divide-y rounded-xl bg-white">{response.submitters.map((item) => <div key={item.name} className="flex items-center justify-between p-3 text-sm"><span><strong>{item.name}</strong><span className="ml-2 text-[var(--text-muted)]">{item.units} units × {money(item.rate_per_unit)}</span></span><strong>{money(item.total_amount)}</strong></div>)}</div></section>}

    {response && previewRequest && <form onSubmit={handleGenerate} className="space-y-4 rounded-xl border border-[var(--success)] bg-[var(--success-bg)]/60 p-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--success-text)]">Save this preview</p><h3 className="mt-1 text-lg font-semibold">Generate invoices</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">This creates one normal invoice for the full main meter and one invoice per submitter. No extra charges or GST are added.</p></div>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-[var(--text-secondary)] sm:col-span-3">Property (optional)<input value={metadata.property_label ?? ""} onChange={(e) => updateMetadata("property_label", e.target.value)} disabled={isGenerating} className={inputClass} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Period start<input required type="date" value={metadata.period_start} onChange={(e) => updateMetadata("period_start", e.target.value)} disabled={isGenerating} className={inputClass} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Period end<input required type="date" min={metadata.period_start} value={metadata.period_end} onChange={(e) => updateMetadata("period_end", e.target.value)} disabled={isGenerating} className={inputClass} /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Due date<input required type="date" min={metadata.period_end} value={metadata.due_date} onChange={(e) => updateMetadata("due_date", e.target.value)} disabled={isGenerating} className={inputClass} /></label></div>
      {generationResult && <div role="status" className="flex items-start gap-3 rounded-xl border border-[var(--success)] bg-white p-3 text-sm"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success-text)]" /><div className="min-w-0 flex-1"><p className="font-semibold text-[var(--success-text)]">Bill Generated Successfully</p><p className="mt-0.5 text-[var(--text-secondary)]">Billing run #{generationResult.billing_run.id} generated {generationResult.invoices.length} invoice{generationResult.invoices.length === 1 ? "" : "s"}.</p><p className="mt-1 text-[var(--text-secondary)]">Email notifications scheduled: {generationResult.invoices.filter((invoice) => invoice.email_status === "scheduled").length}. Unavailable: {generationResult.invoices.filter((invoice) => invoice.email_status === "not_available").length}.{generationResult.invoices.every((invoice) => !invoice.email_status) && " Existing invoices returned; no new email notification scheduled."}</p></div><div className="flex shrink-0 gap-1"><button type="button" aria-label="Open Billing & Invoices" title="View Billing & Invoices" onClick={openBilling} className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] text-[var(--success-text)] transition duration-150 hover:bg-[var(--hover-bg)] hover:text-[var(--primary)] sm:h-9 sm:w-9"><ExternalLink className="h-5 w-5" /></button><button type="button" aria-label="Dismiss generated bill message" title="Dismiss" onClick={() => setGenerationResult(null)} className="grid h-11 w-11 place-items-center rounded-lg border border-transparent text-[var(--text-muted)] transition duration-150 hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] sm:h-9 sm:w-9"><X className="h-4 w-4" /></button></div></div>}
      <button type="submit" disabled={isGenerating || Boolean(generationResult)} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--success)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">{isGenerating ? "Generating..." : <><FilePlus2 className="h-4 w-4" /> Generate invoices</>}</button>
    </form>}
  </div>;
}

export default OwnerDashboard;
