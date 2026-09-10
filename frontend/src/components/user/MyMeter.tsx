"use client";
import { RequestError } from "@/components/RequestError";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Gauge, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { isDecimalInput, parseNonNegativeInput } from "@/lib/numericInput";
import { getMySubmitter, listMyMeterReadings, submitMyMeterReading } from "@/services/portalApi";
import type { MyMeterReading, MySubmitterContext } from "@/types/portal";

const finiteNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : value;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const schema = z.object({
  current_reading: z.preprocess(
    finiteNumber,
    z.number({ invalid_type_error: "Enter a current meter reading." })
      .finite("Enter a valid current meter reading.")
      .min(0, "Reading cannot be negative."),
  ),
  reading_date: z.string().min(1, "Choose the reading date."),
});
type Values = z.infer<typeof schema>;
const today = () => new Date().toISOString().slice(0, 10);
const inputClass = "mt-2 h-11 w-full rounded-xl border border-[var(--input-border)] px-3 text-[var(--text-primary)] outline-none focus:border-[var(--primary)]";

function MeterDetails({ context, readings }: { context: MySubmitterContext; readings: MyMeterReading[] }) {
  const previous = context.latest_reading?.current_reading ?? 0;
  const date = context.latest_reading ? new Date(`${context.latest_reading.reading_date}T00:00:00`).toLocaleDateString("en-IN") : "No prior reading";
  const tariff = context.tariff.length ? context.tariff.map((slab) => `${slab.min_units}${slab.max_units ? `–${slab.max_units}` : "+"}: ₹${slab.rate_per_unit}`).join(" · ") : "Configured by administrator";
  return <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]"><h2 className="font-bold text-[var(--text-primary)]">Meter details</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><Item label="Previous reading" value={String(previous)} /><Item label="Last reading date" value={date} /><Item label="Last units" value={context.latest_reading ? `${context.latest_reading.units_used} units` : "—"} /><Item label="Tariff" value={tariff} /></dl><div className="mt-6 border-t border-[var(--border)] pt-5"><h3 className="font-semibold text-[var(--text-primary)]">Recent readings</h3>{readings.length ? <div className="mt-3 space-y-2">{readings.slice(0, 4).map((reading) => <div key={reading.id} className="flex justify-between gap-3 rounded-xl bg-[var(--hover-bg)] px-3 py-3 text-sm"><span>{new Date(`${reading.reading_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><span className="font-semibold">{reading.previous_reading} → {reading.current_reading} <span className="text-[var(--text-muted)]">({reading.units_used} units)</span></span></div>)}</div> : <p className="mt-2 text-sm text-[var(--text-muted)]">No readings submitted yet.</p>}</div></section>;
}

export function MyMeter() {
  const [context, setContext] = useState<MySubmitterContext | null>(null);
  const [readings, setReadings] = useState<MyMeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Values | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draftReading, setDraftReading] = useState("");
  const { control, register, handleSubmit, setError: setFieldError, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { current_reading: undefined, reading_date: today() } });
  const previous = context?.latest_reading?.current_reading ?? 0;
  const parsedDraftReading = parseNonNegativeInput(draftReading);
  const units = parsedDraftReading !== undefined && parsedDraftReading >= previous ? parsedDraftReading - previous : null;

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const details = await getMySubmitter();
      setContext(details);
      setReadings(details.assigned ? await listMyMeterReadings() : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load your meter."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openPreview = (values: Values) => {
    if (values.current_reading < previous) {
      setFieldError("current_reading", { message: `Current reading cannot be lower than ${previous}.` });
      return;
    }
    setPreview(values); setMessage(null);
  };
  const confirm = async () => {
    if (!preview) return;
    setSubmitting(true); setError(null);
    try {
      const response = await submitMyMeterReading(preview);
      setMessage(response.high_usage_warning ?? "Reading submitted successfully.");
      setPreview(null); setDraftReading(""); reset({ current_reading: undefined, reading_date: today() });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit your reading."); }
    finally { setSubmitting(false); }
  };

  if (loading && !context) return <div className="grid min-h-[360px] place-items-center text-sm text-[var(--text-secondary)]"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" /> Loading your meter…</div>;
  if (!context && error) return <section><h1>My meter</h1><RequestError message={error} retry={() => void load()} /></section>;
  if (!context?.assigned) return <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center"><Gauge className="mx-auto h-8 w-8 text-[var(--primary)]" /><h2 className="mt-3 text-xl font-bold text-[var(--text-primary)]">No meter has been assigned</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">Your administrator must link your account before you can submit readings.</p></div>;

  return <div className="space-y-6"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">My meter</p><h1 className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">{context.meter_name}</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">{context.property_name} · {context.unit}</p></div>{error && <p role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</p>}{message && <p role="status" className={`rounded-xl p-3 text-sm ${message.startsWith("This reading") ? "bg-[var(--warning-bg)] text-[var(--warning)]" : "bg-[var(--success-bg)] text-[var(--success)]"}`}>{message}</p>}<div className="grid gap-5 lg:grid-cols-[1fr,0.9fr]"><MeterDetails context={context} readings={readings} /><section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]"><h2 className="font-bold text-[var(--text-primary)]">Submit current reading</h2><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Your previous reading and tariff stay protected on the server.</p>{preview ? <div className="mt-5 space-y-4"><div className="rounded-xl bg-[var(--subtle-teal)] p-4"><p className="text-xs font-semibold text-[var(--text-muted)]">Please confirm</p><p className="mt-2 text-lg font-bold text-[var(--text-primary)]">{previous} → {preview.current_reading}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{preview.current_reading - previous} units on {new Date(`${preview.reading_date}T00:00:00`).toLocaleDateString("en-IN")}</p></div>{preview.current_reading - previous >= 100 && <p className="flex gap-2 rounded-xl bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning)]"><AlertTriangle className="h-4 w-4 shrink-0" />This is a high-usage reading. You can still submit it if it is correct.</p>}<div className="flex gap-3"><button type="button" onClick={() => setPreview(null)} className="min-h-11 flex-1 rounded-xl border border-[var(--input-border)] text-sm font-semibold text-[var(--text-secondary)]">Edit</button><button type="button" disabled={submitting} onClick={() => void confirm()} className="min-h-11 flex-1 rounded-xl bg-[var(--primary)] text-sm font-semibold text-white disabled:opacity-60">{submitting ? "Submitting…" : "Confirm reading"}</button></div></div> : <form onSubmit={handleSubmit(openPreview)} className="mt-5 space-y-4"><label className="block text-sm font-semibold text-[var(--text-secondary)]">Current reading<Controller name="current_reading" control={control} render={({ field }) => <input type="text" inputMode="decimal" value={typeof field.value === "number" ? String(field.value) : field.value ?? ""} onBlur={field.onBlur} onChange={(event) => { if (!isDecimalInput(event.target.value)) return; field.onChange(event.target.value); setDraftReading(event.target.value); }} className={inputClass} />} /></label>{errors.current_reading && <p className="text-sm text-[var(--error)]">{errors.current_reading.message}</p>}<label className="block text-sm font-semibold text-[var(--text-secondary)]">Reading date<input type="date" {...register("reading_date")} className={inputClass} /></label>{errors.reading_date && <p className="text-sm text-[var(--error)]">{errors.reading_date.message}</p>}<p className="rounded-xl bg-[var(--hover-bg)] p-3 text-sm text-[var(--text-secondary)]">Previewed usage: <strong>{units === null ? "—" : `${units} units`}</strong></p><button className="min-h-11 w-full rounded-xl bg-[var(--primary)] text-sm font-semibold text-white hover:bg-[var(--primary-hover)]">Preview reading</button></form>}</section></div></div>;
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{value}</dd></div>; }
