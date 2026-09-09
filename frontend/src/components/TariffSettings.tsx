"use client";

import { useEffect, useState } from "react";

import { isDecimalInput, isIntegerInput, parseFiniteInput } from "@/lib/numericInput";
import { tariffSettingsSchema } from "@/lib/validation";
import { getTariffSettings, updateTariffSettings } from "@/services/electricityApi";
import type { ElectricitySlab } from "@/types/electricity";

const field = "mt-1 h-11 w-full rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm outline-none";

type SlabDraft = {
  min_units: string;
  max_units: string;
  rate_per_unit: string;
};

const toDraft = (slab: ElectricitySlab): SlabDraft => ({
  min_units: String(slab.min_units),
  max_units: slab.max_units === null ? "" : String(slab.max_units),
  rate_per_unit: String(slab.rate_per_unit),
});

export function TariffSettings() {
  const [slabs, setSlabs] = useState<SlabDraft[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getTariffSettings()
      .then((value) => setSlabs(value.slabs.map(toDraft)))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load tariff."));
  }, []);

  const update = (index: number, key: keyof SlabDraft, value: string) => {
    const valid = key === "rate_per_unit" ? isDecimalInput(value) : isIntegerInput(value);
    if (valid) {
      setSlabs((current) => current.map((slab, item) => item === index ? { ...slab, [key]: value } : slab));
    }
    setSaved(false);
  };

  const save = async () => {
    setError(null);
    const payload: ElectricitySlab[] = slabs.map((slab) => ({
      min_units: parseFiniteInput(slab.min_units) ?? Number.NaN,
      max_units: slab.max_units === "" ? null : parseFiniteInput(slab.max_units) ?? Number.NaN,
      rate_per_unit: parseFiniteInput(slab.rate_per_unit) ?? Number.NaN,
    }));
    const validated = tariffSettingsSchema.safeParse({ slabs: payload });
    if (!validated.success) {
      setError(validated.error.issues[0]?.message ?? "Enter valid tariff values.");
      return;
    }

    const normalized: ElectricitySlab[] = validated.data.slabs.map((slab) => ({
      ...slab,
      max_units: slab.max_units ?? null,
    }));
    try {
      await updateTariffSettings({ slabs: normalized });
      setSlabs(normalized.map(toDraft));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save tariff.");
    }
  };

  return <div className="space-y-5">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Tariff settings</p>
      <h2 className="mt-1 text-2xl font-bold">Rates &amp; slabs</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Configure the rates used by new bills. Tax and extra charges are not part of the calculation.</p>
    </div>
    <section className="rounded-xl border border-[var(--border)] bg-white p-5 sm:p-7">
      <div className="space-y-3">
        {slabs.map((slab, index) => <div key={index} className="grid gap-3 rounded-xl border border-[var(--border)] p-4 sm:grid-cols-3">
          <label className="text-xs font-semibold text-[var(--text-secondary)]">From units
            <input type="text" inputMode="numeric" value={slab.min_units} onChange={(event) => update(index, "min_units", event.target.value)} className={field} />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">To units
            <input type="text" inputMode="numeric" value={slab.max_units} onChange={(event) => update(index, "max_units", event.target.value)} placeholder="No limit" className={field} />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">Rate per unit
            <input type="text" inputMode="decimal" value={slab.rate_per_unit} onChange={(event) => update(index, "rate_per_unit", event.target.value)} className={field} />
          </label>
        </div>)}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--error)]">{error}</p>}
      {saved && <p role="status" className="mt-4 text-sm text-[var(--success-text)]">Tariff saved.</p>}
      <button type="button" onClick={() => void save()} className="mt-5 min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white">Save tariff</button>
    </section>
  </div>;
}

export default TariffSettings;
