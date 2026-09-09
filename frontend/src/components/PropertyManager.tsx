"use client";

import { Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PropertyBilling } from "@/components/PropertyBilling";
import { listUsers } from "@/services/authApi";
import { getTariffSettings } from "@/services/electricityApi";
import {
  assignSubmitterAccount,
  createProperty,
  createSubmitter,
  deleteProperty,
  deleteSubmitter,
  updateProperty,
  type PropertyInput,
} from "@/services/propertyApi";
import type { UserResponse } from "@/types/auth";
import type {
  Bill,
  ElectricitySlab,
  PersistedMeterReading,
  Property,
  PropertyListResponse,
} from "@/types/electricity";

const inputClass = "mt-1 h-11 w-full rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)]";

function PropertyForm({ initial, onCancel, onSaved }: { initial?: Property; onCancel?: () => void; onSaved: (property: Property) => void }) {
  const [values, setValues] = useState<PropertyInput>({ name: initial?.name ?? "", place: initial?.place ?? "", unit: initial?.unit ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (Object.values(values).some((value) => !value.trim())) {
      setError("Name, place, and unit are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(initial ? await updateProperty(initial.id, values) : await createProperty(values));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save property.");
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--subtle-teal)] p-4">
    <div className="grid gap-3 sm:grid-cols-3">
      {(["name", "place", "unit"] as const).map((key) => <label key={key} className="text-xs font-semibold capitalize text-[var(--text-secondary)]">
        {key === "unit" ? "Unit / apartment" : key}
        <input required maxLength={key === "place" ? 200 : 120} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className={inputClass} />
      </label>)}
    </div>
    {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)]">Cancel</button><button disabled={busy} className="min-h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : initial ? "Save changes" : "Add property"}</button></div>
  </form>;
}

export function PropertyManager({
  data,
  searchTarget,
  onClearSearchTarget,
  searchQuery = "",
  onDataChange,
  initialAction,
  meterReadings = [],
  onBillGenerated,
  onOpenBilling,
}: {
  data: PropertyListResponse;
  searchTarget?: { propertyId: number; submitterId?: number } | null;
  onClearSearchTarget?: () => void;
  searchQuery?: string;
  onDataChange: (data: PropertyListResponse) => void;
  initialAction?: "property" | "submitter" | null;
  meterReadings?: PersistedMeterReading[];
  onBillGenerated?: (bill: Bill) => void;
  onOpenBilling?: () => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitterProperty, setSubmitterProperty] = useState<number | null>(null);
  const [submitterName, setSubmitterName] = useState("");
  const [accounts, setAccounts] = useState<UserResponse[]>([]);
  const [tariff, setTariff] = useState<ElectricitySlab[]>([]);
  const [error, setError] = useState<string | null>(null);
  const handledInitialAction = useRef<string | null>(null);

  useEffect(() => {
    void listUsers().then((items) => setAccounts(items.filter((item) => item.role === "user" && item.is_active))).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    void getTariffSettings().then((value) => setTariff(value.slabs)).catch(() => setTariff([]));
  }, []);

  useEffect(() => {
    if (initialAction === "property" && handledInitialAction.current !== "property") {
      setAdding(true);
      setEditing(null);
      handledInitialAction.current = "property";
    }
    if (initialAction === "submitter" && data.items[0] && handledInitialAction.current !== "submitter") {
      setSubmitterProperty(data.items[0].id);
      setEditing(null);
      handledInitialAction.current = "submitter";
    }
  }, [data.items, initialAction]);

  const replace = (property: Property) => onDataChange({
    ...data,
    items: data.items.some((item) => item.id === property.id) ? data.items.map((item) => item.id === property.id ? property : item) : [property, ...data.items],
    total: data.items.some((item) => item.id === property.id) ? data.total : data.total + 1,
  });

  const remove = async (property: Property) => {
    if (!window.confirm(`Delete ${property.name}? Its submitters will also be deleted.`)) return;
    try {
      await deleteProperty(property.id);
      onDataChange({ items: data.items.filter((item) => item.id !== property.id), total: data.total - 1, submitter_total: data.submitter_total - property.submitter_count });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete property.");
    }
  };

  const addSubmitter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!submitterName.trim() || submitterProperty === null) return;
    try {
      const submitter = await createSubmitter(submitterProperty, submitterName.trim());
      onDataChange({ ...data, items: data.items.map((item) => item.id === submitterProperty ? { ...item, submitters: [...item.submitters, submitter], submitter_count: item.submitter_count + 1 } : item), submitter_total: data.submitter_total + 1 });
      setSubmitterName("");
      setSubmitterProperty(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add submitter.");
    }
  };

  const removeSubmitter = async (property: Property, submitterId: number) => {
    try {
      await deleteSubmitter(property.id, submitterId);
      onDataChange({ ...data, items: data.items.map((item) => item.id === property.id ? { ...item, submitters: item.submitters.filter((submitter) => submitter.id !== submitterId), submitter_count: item.submitter_count - 1 } : item), submitter_total: data.submitter_total - 1 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove submitter.");
    }
  };

  const updateAccount = async (property: Property, submitterId: number, userId: number | null) => {
    try {
      const updated = await assignSubmitterAccount(property.id, submitterId, userId);
      onDataChange({ ...data, items: data.items.map((item) => item.id === property.id ? { ...item, submitters: item.submitters.map((submitter) => submitter.id === updated.id ? updated : submitter) } : item) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the linked account.");
    }
  };

  const isAlreadyAssigned = (accountId: number, ownSubmitterId: number) => data.items.some((property) => property.submitters.some((submitter) => submitter.id !== ownSubmitterId && submitter.user_id === accountId));
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProperties = data.items.filter((property) => (!searchTarget || property.id === searchTarget.propertyId) && (!normalizedQuery || [property.name, property.place, property.unit, ...property.submitters.flatMap((submitter) => [submitter.name, submitter.id, submitter.user_id])].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery))));

  return <div className="space-y-5">
    {searchTarget && <button type="button" onClick={onClearSearchTarget} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--primary)] focus-visible:outline">Show all properties</button>}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Properties</p><h2 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">Manage properties and submitters</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{data.total} properties · {data.submitter_total} submitters</p></div><button type="button" onClick={() => { setAdding(true); setEditing(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add property</button></div>
    {error && <p role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</p>}
    {adding && <PropertyForm onCancel={() => setAdding(false)} onSaved={(property) => { replace(property); setAdding(false); }} />}
    {filteredProperties.length === 0 && !adding && <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-10 text-center">{normalizedQuery ? <p className="text-sm text-[var(--text-muted)]">No results found for &apos;{searchQuery}&apos;.</p> : <><h3 className="font-semibold text-[var(--text-primary)]">No properties yet</h3><p className="mt-1 text-sm text-[var(--text-muted)]">Add a property, then add its submitters.</p></>}</div>}
    {filteredProperties.map((property) => <section key={property.id} className="rounded-xl border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-[var(--text-primary)]">{property.name}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{property.place} · {property.unit}</p><p className="mt-2 text-xs font-semibold text-[var(--primary)]">{property.submitter_count} submitter{property.submitter_count === 1 ? "" : "s"}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setEditing(property.id); setAdding(false); }} aria-label={`Edit ${property.name}`} className="grid h-11 w-11 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void remove(property)} aria-label={`Delete ${property.name}`} className="grid h-11 w-11 place-items-center rounded-lg text-[var(--error)] hover:bg-[var(--error-bg)]"><Trash2 className="h-4 w-4" /></button></div></div>
      {editing === property.id && <div className="mt-4"><PropertyForm initial={property} onCancel={() => setEditing(null)} onSaved={(updated) => { replace(updated); setEditing(null); }} /></div>}
      <div className="mt-4 border-t border-[var(--border)] pt-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-[var(--text-secondary)]">Submitters</p><button type="button" onClick={() => setSubmitterProperty(property.id)} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[var(--primary)]"><UserPlus className="h-3.5 w-3.5" />Add submitter</button></div>{property.submitters.length > 0 && <div className="mt-2 space-y-2">{property.submitters.map((submitter) => <div key={submitter.id} aria-label={searchTarget?.submitterId === submitter.id ? "Selected submitter" : undefined} className={` ${searchTarget?.submitterId === submitter.id ? "ring-2 ring-[var(--primary)]" : ""} flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--hover-bg)] px-3 py-3 text-sm`}><span className="font-semibold text-[var(--text-primary)]">{submitter.name}</span><div className="flex min-w-0 items-center gap-2"><select aria-label={`Linked account for ${submitter.name}`} value={submitter.user_id ?? ""} onChange={(event) => void updateAccount(property, submitter.id, event.target.value ? Number(event.target.value) : null)} className="h-10 max-w-48 rounded-lg border border-[var(--input-border)] bg-white px-2 text-xs text-[var(--text-secondary)]"><option value="">No linked account</option>{accounts.map((account) => <option key={account.id} value={account.id} disabled={isAlreadyAssigned(account.id, submitter.id)}>{account.name} · {account.email}</option>)}</select><button type="button" aria-label={`Remove ${submitter.name}`} onClick={() => void removeSubmitter(property, submitter.id)} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--error-bg)] hover:text-[var(--error)]"><X className="h-4 w-4" /></button></div></div>)}</div>}{submitterProperty === property.id && <form onSubmit={addSubmitter} className="mt-3 flex flex-col gap-2 sm:flex-row"><input autoFocus required maxLength={120} value={submitterName} onChange={(event) => setSubmitterName(event.target.value)} placeholder="Submitter name" className={inputClass} /><button className="min-h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white">Save</button></form>}</div>
      <PropertyBilling property={property} readings={meterReadings} tariff={tariff} onBillGenerated={onBillGenerated} onOpenBilling={onOpenBilling} />
    </section>)}
  </div>;
}
