"use client";

import { AlertTriangle, CheckCircle2, DatabaseZap, Moon, Sun } from "lucide-react";
import { useState } from "react";

import type { WorkspaceResetResponse } from "@/types/electricity";

export type ThemePreference = "dark" | "light";

export function SystemSettings({
  theme,
  onThemeChange,
  onResetWorkspace,
  isAdministrator,
}: {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onResetWorkspace?: () => Promise<WorkspaceResetResponse>;
  isAdministrator: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function reset() {
    if (confirmation !== "RESET" || !onResetWorkspace) return;
    setResetting(true);
    setError(null);
    try {
      const result = await onResetWorkspace();
      setSuccess(`Workspace reset: ${result.properties_cleared} properties, ${result.meter_readings_cleared} readings, and ${result.bills_cleared} bills cleared.`);
      setConfirming(false);
      setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset workspace.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="grid max-w-4xl gap-5">
      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--active-bg)] text-[var(--primary)]">{theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</span><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Appearance</p><h2 className="mt-1 font-display text-xl font-bold text-[var(--text-primary)]">Theme preference</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Saved to this browser and applied immediately.</p></div></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(["dark", "light"] as const).map((option) => <button key={option} type="button" onClick={() => onThemeChange(option)} aria-pressed={theme === option} className={`flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition ${theme === option ? "border-[var(--primary)] bg-[var(--active-bg)]" : "border-[var(--border)] bg-[var(--card-secondary)] hover:bg-[var(--hover-bg)]"}`}><span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--surface)] text-[var(--primary)]">{option === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</span><span><span className="block text-sm font-bold capitalize text-[var(--text-primary)]">{option} theme</span><span className="mt-1 block text-xs text-[var(--text-muted)]">{option === "dark" ? "Graphite workspace" : "Bright workspace"}</span></span></button>)}
        </div>
      </section>

      {isAdministrator && <section className="rounded-xl border border-[var(--error)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--error-bg)] text-[var(--error)]"><AlertTriangle className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--error)]">Danger zone</p><h2 className="mt-1 font-display text-xl font-bold text-[var(--text-primary)]">Reset all workspace data</h2><p className="mt-1 text-sm text-[var(--text-muted)]">This permanently clears properties, submitters, readings, invoices, and billing runs. User accounts remain intact.</p></div></div>
        {error && <p role="alert" className="mt-5 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</p>}
        {success && <p className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] p-3 text-sm text-[var(--success-text)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</p>}
        {!confirming ? <button type="button" onClick={() => { setError(null); setSuccess(null); setConfirming(true); }} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--error)] px-4 text-sm font-bold text-[var(--error)] transition hover:bg-[var(--error-bg)]"><DatabaseZap className="h-4 w-4" />Reset workspace data</button> : <div className="mt-5 rounded-xl bg-[var(--error-bg)] p-4"><p className="text-sm font-semibold text-[var(--text-primary)]">Type <strong>RESET</strong> to permanently clear workspace data.</p><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-3 h-11 w-full rounded-lg border border-[var(--input-border)] bg-white px-3 text-sm outline-none focus:border-[var(--error)]" aria-label="Type RESET to confirm" /><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void reset()} disabled={confirmation !== "RESET" || resetting} className="min-h-11 rounded-xl bg-[var(--error)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{resetting ? "Resetting…" : "Permanently reset data"}</button><button type="button" onClick={() => { setConfirming(false); setConfirmation(""); }} disabled={resetting} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button></div></div>}
      </section>}
    </div>
  );
}
