"use client";

import { Building2, FileText, LayoutDashboard, LoaderCircle, Search, Users, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchRecords, type RecordSearchResult } from "@/services/searchApi";

export type SearchPage = { kind: "page"; id: string; title: string; secondary: string };
export type SearchSelection = SearchPage | RecordSearchResult;
const groups = ["page", "property", "submitter", "invoice"] as const;
const labels = { page: "Pages", property: "Properties / rooms", submitter: "Submitters", invoice: "Invoices" };
const icons = { page: LayoutDashboard, property: Building2, submitter: Users, invoice: FileText };

export function GlobalSearch({ pages, onSelect }: { pages: SearchPage[]; onSelect: (result: SearchSelection) => void }) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<RecordSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const id = useId();
  const normalized = query.trim();
  const eligible = normalized.length >= 2;
  const results: SearchSelection[] = eligible ? [
    ...pages.filter((page) => page.title.toLowerCase().includes(normalized.toLowerCase())), ...records,
  ] : [];
  const expanded = open && eligible;

  function change(value: string) {
    revision.current += 1;
    controller.current?.abort();
    setQuery(value);
    setRecords([]);
    setError(false);
    setLoading(value.trim().length >= 2);
    setActive(-1);
    setOpen(value.trim().length >= 2);
  }

  useEffect(() => {
    if (normalized.length < 2) return;
    const current = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    const timer = window.setTimeout(() => {
      void searchRecords(normalized, abort.signal).then((response) => {
        if (!abort.signal.aborted && current === revision.current) setRecords(response.items);
      }).catch(() => {
        if (!abort.signal.aborted && current === revision.current) setError(true);
      }).finally(() => {
        if (!abort.signal.aborted && current === revision.current) setLoading(false);
      });
    }, 300);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [query, normalized]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) { setOpen(false); setActive(-1); }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, expanded, id]);

  const select = (result: SearchSelection) => { change(""); onSelect(result); };
  return <div ref={container} className="relative w-full min-w-0" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setActive(-1); }
  }}>
    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-muted)]" />
    <input ref={input} role="combobox" aria-label="Search PowerManage" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={`${id}-results`} aria-activedescendant={expanded && active >= 0 && results[active] ? `${id}-option-${active}` : undefined}
      autoComplete="off" maxLength={100} value={query} onChange={(event) => change(event.target.value)}
      onFocus={() => setOpen(true)} placeholder="Search anything..."
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          if (results.length) setActive((index) => event.key === "ArrowDown" ? (index + 1) % results.length : (index <= 0 ? results.length - 1 : index - 1));
        }
        if (event.key === "Enter" && expanded && results[active]) { event.preventDefault(); select(results[active]); }
      }}
      className="h-11 w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--surface)] pl-9 pr-11 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)] lg:text-sm" />
    {query && <button type="button" aria-label="Clear search" onClick={() => { change(""); input.current?.focus(); }} className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"><X aria-hidden="true" className="h-4 w-4" /></button>}
    {expanded && <div className="shell-popover absolute left-0 top-full z-50 mt-2 max-h-[min(65vh,28rem)] w-full min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text-primary)] shadow-xl lg:w-96 lg:max-w-[calc(100vw-2rem)]">
      <div role="status" aria-live="polite" className="text-sm text-[var(--text-secondary)]">
        {loading && <p className="flex items-center gap-2 p-3"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Searching records…</p>}
        {error && <p className="p-3">Unable to search records. Please try again. Page links are still available.</p>}
        {!loading && !error && results.length === 0 && <p className="p-3">No results found.</p>}
      </div>
      <ul role="listbox" id={`${id}-results`} aria-label="Search results" aria-busy={loading}>
        {groups.map((kind) => {
          const items = results.filter((result) => result.kind === kind);
          const Icon = icons[kind];
          return items.length > 0 && <li key={kind} role="presentation"><ul role="group" aria-label={labels[kind]}>
            <li role="presentation" className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{labels[kind]}</li>
            {items.map((result) => {
              const index = results.indexOf(result);
              return <li key={`${result.kind}-${result.id}`} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
                onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => select(result)}
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-3 ${active === index ? "bg-[var(--active-bg)] ring-2 ring-inset ring-[var(--primary)]" : "hover:bg-[var(--hover-bg)]"}`}>
                <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="block text-sm font-semibold">{result.title}</span><span className="block text-xs text-[var(--text-secondary)]">{result.secondary}</span></span>
              </li>;
            })}
          </ul></li>;
        })}
      </ul>
    </div>}
  </div>;
}
