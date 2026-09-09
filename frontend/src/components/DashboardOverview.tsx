"use client";

import {
  AlertCircle,
  BarChart3,
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Gauge,
  Landmark,
  LoaderCircle,
  MoreHorizontal,
  ReceiptIndianRupee,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { quickActions } from "@/lib/dashboardData";
import type { DashboardBill, DashboardData, ElectricityUsagePoint, PersistedMeterReading, QuickAction, TopPropertyUsage } from "@/types/electricity";

const toneClasses = {
  teal: "bg-[var(--primary)] text-white",
  amber: "bg-[var(--warning-bg)] text-[var(--warning)]",
  violet: "bg-[var(--success-bg)] text-[var(--success-text)]",
  coral: "bg-[var(--error-bg)] text-[var(--error)]",
  slate: "bg-[var(--subtle-teal)] text-[var(--text-secondary)]",
};

const quickActionIcons = {
  property: Building2,
  submitter: Users,
  meter: Gauge,
  invoice: ReceiptIndianRupee,
  bulk: Landmark,
  tariff: MoreHorizontal,
  calculator: CircleDollarSign,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{eyebrow}</p>}
        <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">{title}</h2>
      </div>
      {action && <button className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] transition hover:text-[var(--primary-hover)]">{action}<ChevronRight className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

type UsageRange = "7d" | "30d" | "6m";

const usageRangeOptions: Array<{ value: UsageRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "6m", label: "Last 6 months" },
];

function formatUsage(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value));
}

function usageValue(point: ElectricityUsagePoint) {
  const value = Number(point.usage);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function parseUsageDate(point: ElectricityUsagePoint) {
  const parsed = new Date(point.date);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function getRangeBounds(latestDate: Date, range: UsageRange) {
  const currentEnd = new Date(latestDate);
  const currentStart = new Date(currentEnd);
  if (range === "6m") currentStart.setMonth(currentStart.getMonth() - 6);
  else currentStart.setDate(currentStart.getDate() - (range === "30d" ? 29 : 6));

  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  if (range === "6m") previousStart.setMonth(previousStart.getMonth() - 6);
  else previousStart.setDate(previousStart.getDate() - (range === "30d" ? 29 : 6));

  return { currentStart, currentEnd, previousStart, previousEnd };
}

function formatAxisDate(point: ElectricityUsagePoint, range: UsageRange) {
  const parsed = parseUsageDate(point);
  if (!parsed) return range === "7d" ? point.day : point.date;
  if (range === "6m") {
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(parsed).replace(" ", " '");
  }
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(parsed);
}

function UsageSummary({ currentUsage, previousUsage, hasPreviousData, percentageChange, rangeLabel }: {
  currentUsage: number;
  previousUsage: number;
  hasPreviousData: boolean;
  percentageChange: number | null;
  rangeLabel: string;
}) {
  const changeTone = percentageChange === null || percentageChange === 0
    ? "text-[var(--text-primary)]"
    : percentageChange > 0
      ? "text-[var(--error)]"
      : "text-[var(--success-text)]";
  const ChangeIcon = percentageChange !== null && percentageChange < 0 ? TrendingDown : TrendingUp;
  const changeCopy = percentageChange === null
    ? "No prior period data"
    : percentageChange === 0
      ? "No change vs previous"
      : `${formatUsage(Math.abs(percentageChange))}% ${percentageChange > 0 ? "increase" : "decrease"}`;

  return (
    <div className="mb-5 grid min-w-0 gap-3 sm:grid-cols-3">
      <article className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card-secondary)] p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Current usage</p>
        <p className="mt-2 truncate font-display text-xl font-bold tracking-tight text-[var(--text-primary)]" title={`${formatUsage(currentUsage)} kWh`}>{formatUsage(currentUsage)} <span className="text-xs font-semibold text-[var(--text-secondary)]">kWh</span></p>
        <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{rangeLabel}</p>
      </article>
      <article className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card-secondary)] p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Previous period usage</p>
        <p className="mt-2 truncate font-display text-xl font-bold tracking-tight text-[var(--text-primary)]" title={hasPreviousData ? `${formatUsage(previousUsage)} kWh` : "No prior period data"}>{hasPreviousData ? formatUsage(previousUsage) : "—"} {hasPreviousData && <span className="text-xs font-semibold text-[var(--text-secondary)]">kWh</span>}</p>
        <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">Same period before</p>
      </article>
      <article className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card-secondary)] p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Percentage change</p>
        <p className={`mt-2 flex items-center gap-1.5 truncate font-display text-xl font-bold tracking-tight ${changeTone}`} title={changeCopy}>
          {percentageChange !== null && percentageChange !== 0 && <ChangeIcon className="h-4 w-4 shrink-0" />}
          {percentageChange === null ? "—" : `${percentageChange > 0 ? "+" : ""}${formatUsage(percentageChange)}%`}
        </p>
        <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{changeCopy}</p>
      </article>
    </div>
  );
}

function UsageSummarySkeleton() {
  return <div className="mb-5 grid gap-3 sm:grid-cols-3" aria-hidden="true">{[1, 2, 3].map((item) => <div key={item} className="h-[92px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--card-secondary)]" />)}</div>;
}

function UsageChart({ points, isLoading = false, error = null, onRetry }: { points: ElectricityUsagePoint[]; isLoading?: boolean; error?: string | null; onRetry?: () => void }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<UsageRange>("7d");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(720);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    const updateWidth = () => setChartWidth(Math.max(container.clientWidth, 240));
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isLoading, points.length]);

  useEffect(() => {
    if (!rangeMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setRangeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRangeMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [rangeMenuOpen]);

  const datedPoints = useMemo(() => points.map((point) => ({ point, date: parseUsageDate(point) })), [points]);
  const latestDate = useMemo(() => {
    const timestamps = datedPoints.flatMap(({ date }) => date ? [date.getTime()] : []);
    return timestamps.length ? new Date(Math.max(...timestamps)) : null;
  }, [datedPoints]);
  const rangeBounds = latestDate ? getRangeBounds(latestDate, selectedRange) : null;
  const currentDatedPoints = rangeBounds
    ? datedPoints.filter(({ date }) => date && date >= rangeBounds.currentStart && date <= rangeBounds.currentEnd)
    : datedPoints;
  const previousDatedPoints = rangeBounds
    ? datedPoints.filter(({ date }) => date && date >= rangeBounds.previousStart && date <= rangeBounds.previousEnd)
    : [];
  const chartPoints = currentDatedPoints.map(({ point }) => point);
  const currentUsage = currentDatedPoints.reduce((total, { point }) => total + usageValue(point), 0);
  const previousUsage = previousDatedPoints.reduce((total, { point }) => total + usageValue(point), 0);
  const hasPreviousData = previousDatedPoints.length > 0;
  const percentageChange = hasPreviousData && previousUsage > 0 ? ((currentUsage - previousUsage) / previousUsage) * 100 : null;
  const selectedRangeLabel = usageRangeOptions.find((option) => option.value === selectedRange)?.label ?? "Last 7 days";

  if (isLoading) {
    return (
      <div className="dashboard-card min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6" aria-busy="true">
        <div className="mb-5 flex items-start justify-between gap-4"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Tracking</p><h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Electricity Usage Overview</h2></div><LoaderCircle className="h-5 w-5 animate-spin text-[var(--primary)]" aria-label="Loading usage" /></div>
        <UsageSummarySkeleton />
        <div className="h-[250px] animate-pulse rounded-xl bg-[var(--card-secondary)]" />
      </div>
    );
  }

  const hasData = points.length > 0;
  const hasChartData = chartPoints.length > 0;

  return (
    <div className="dashboard-card min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Tracking</p>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Electricity Usage Overview</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Daily usage measured in kWh</p>
        </div>
        <div ref={menuRef} className="relative shrink-0">
          <button type="button" aria-label="Usage chart options" aria-haspopup="menu" aria-expanded={rangeMenuOpen} onClick={() => setRangeMenuOpen((open) => !open)} className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><MoreHorizontal className="h-5 w-5" /></button>
          {rangeMenuOpen && <div role="menu" aria-label="Usage date range" className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl">
            {usageRangeOptions.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={selectedRange === option.value} onClick={() => { setSelectedRange(option.value); setActiveIndex(null); setRangeMenuOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${selectedRange === option.value ? "bg-[var(--active-bg)] text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"}`}><span>{option.label}</span>{selectedRange === option.value && <span aria-hidden="true">✓</span>}</button>)}
          </div>}
        </div>
      </div>

      {error && !hasData && <div role="alert" className="flex items-start gap-3 rounded-xl border border-[var(--error)]/30 bg-[var(--error-bg)] p-4 text-sm text-[var(--error)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-bold">Unable to load usage data</p><p className="mt-1 break-words text-xs text-[var(--text-secondary)]">{error}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--error)] px-3 py-2 text-xs font-bold text-white hover:opacity-90"><RefreshCw className="h-3.5 w-3.5" />Try again</button>}</div></div>}

      {!error || hasData ? <>
        <UsageSummary currentUsage={currentUsage} previousUsage={previousUsage} hasPreviousData={hasPreviousData} percentageChange={percentageChange} rangeLabel={selectedRangeLabel} />
        {error && hasData && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--error)]/30 bg-[var(--error-bg)] px-3 py-2 text-xs text-[var(--error)]"><AlertCircle className="h-4 w-4 shrink-0" />Showing the last available usage data. {onRetry && <button type="button" onClick={onRetry} className="ml-auto shrink-0 font-bold underline underline-offset-2">Retry</button>}</div>}
        {!hasData ? <div className="flex min-h-[250px] items-center justify-center rounded-xl bg-[var(--subtle-teal)] p-6 text-center"><div><BarChart3 className="mx-auto h-9 w-9 text-[var(--primary)]" /><p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">No meter reading usage recorded yet.</p><p className="mt-1 text-xs text-[var(--text-muted)]">Usage trends will appear after meter readings are saved.</p></div></div> : !hasChartData ? <div className="flex min-h-[250px] items-center justify-center rounded-xl bg-[var(--subtle-teal)] p-6 text-center"><div><BarChart3 className="mx-auto h-9 w-9 text-[var(--primary)]" /><p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">No usage in this period</p><p className="mt-1 text-xs text-[var(--text-muted)]">Try a wider date range or add a meter reading.</p></div></div> : <div ref={chartContainerRef} className="relative min-w-0 overflow-hidden" onMouseLeave={() => setActiveIndex(null)}>
          {(() => {
            const width = chartWidth;
            const height = 250;
            const chartTop = 22;
            const chartBottom = 204;
            const chartLeft = Math.min(42, Math.max(32, width * 0.12));
            const chartRight = width - Math.min(18, Math.max(12, width * 0.05));
            const maximumUsage = Math.max(...chartPoints.map(usageValue), 0);
            const scaleMaximum = maximumUsage > 0 ? Math.ceil(maximumUsage / 4) * 4 : 1;
            const tickValues = Array.from({ length: 5 }, (_, index) => Math.round((scaleMaximum * index) / 4));
            const x = (index: number) => chartPoints.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + (index * (chartRight - chartLeft)) / Math.max(chartPoints.length - 1, 1);
            const y = (value: number) => chartBottom - (value / scaleMaximum) * (chartBottom - chartTop);
            const linePath = chartPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(usageValue(point))}`).join(" ");
            const areaPath = `${linePath} L ${x(chartPoints.length - 1)} ${chartBottom} L ${x(0)} ${chartBottom} Z`;
            const selectedIndex = Math.min(activeIndex ?? chartPoints.length - 1, chartPoints.length - 1);
            const active = chartPoints[selectedIndex];
            const dateRange = `${chartPoints[0]?.date} to ${chartPoints[chartPoints.length - 1]?.date}`;
            const maxLabels = selectedRange === "7d" ? 7 : 6;
            const labelIndexes = new Set<number>();
            chartPoints.forEach((_, index) => {
              if (chartPoints.length <= maxLabels || index === 0 || index === chartPoints.length - 1 || index % Math.ceil((chartPoints.length - 1) / (maxLabels - 1)) === 0) labelIndexes.add(index);
            });
            const activeX = x(selectedIndex);
            const tooltipSide = activeX > width * 0.68 || selectedIndex === chartPoints.length - 1 ? "left" : activeX < width * 0.32 || selectedIndex === 0 ? "right" : "center";
            const tooltipTransform = tooltipSide === "left" ? "translateX(-100%)" : tooltipSide === "right" ? "translateX(0)" : "translateX(-50%)";

            return <>
              <svg viewBox={`0 0 ${width} ${height}`} className="block h-[250px] w-full max-w-full" role="img" aria-label={`Electricity usage from ${dateRange}`}>
                <defs><linearGradient id="usageFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".12" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
                <text x="0" y="12" fontSize="10" fontWeight="700" fill="var(--text-muted)">kWh</text>
                {tickValues.map((value) => <g key={value}><line x1={chartLeft} x2={chartRight} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeDasharray="4 5" strokeOpacity=".45" /><text x="0" y={y(value) + 4} fontSize="10" fill="var(--text-muted)">{formatUsage(value)}</text></g>)}
                <path d={areaPath} fill="url(#usageFill)" />
                <line x1={activeX} x2={activeX} y1={y(usageValue(active)) + 10} y2={chartBottom} stroke="var(--border)" strokeDasharray="3 4" strokeOpacity=".7" />
                <path d={linePath} fill="none" stroke="var(--primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                {chartPoints.map((point, index) => <g key={`${point.date}-${index}`} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} className="cursor-pointer" tabIndex={0} role="button" aria-label={`${point.date}: ${formatUsage(usageValue(point))} kWh`}><circle cx={x(index)} cy={y(usageValue(point))} r={index === selectedIndex ? 6 : chartPoints.length > 30 ? 2.5 : 4} fill="var(--card)" stroke="var(--primary)" strokeWidth="3" /><text x={x(index)} y="233" textAnchor="middle" fontSize="10" fill={index === selectedIndex ? "var(--text-primary)" : "var(--text-muted)"} fontWeight={index === selectedIndex ? 700 : 500}>{labelIndexes.has(index) ? formatAxisDate(point, selectedRange) : ""}</text></g>)}
              </svg>
              <div role="tooltip" className="pointer-events-none absolute top-2 z-10 w-max rounded-xl bg-[var(--text-primary)] px-3 py-2 text-center text-white shadow-lg" style={{ left: `${(activeX / width) * 100}%`, maxWidth: "calc(100% - 1rem)", transform: tooltipTransform }}><p className="truncate text-[10px] font-medium text-[var(--on-dark-muted)]">{active.day}, {active.date}</p><p className="mt-0.5 text-sm font-bold">{formatUsage(usageValue(active))} kWh</p></div>
            </>;
          })()}
        </div>}
      </> : null}
    </div>
  );
}

function StatusPill({ status }: { status: DashboardBill["status"] }) {
  const styles: Record<DashboardBill["status"], string> = {
    Paid: "bg-[var(--success-bg)] text-[var(--success-text)]",
    Pending: "bg-[var(--warning-bg)] text-[var(--warning)]",
    Overdue: "bg-[var(--error-bg)] text-[var(--error)]",
    Void: "bg-[var(--hover-bg)] text-[var(--text-secondary)]",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${styles[status]}`}>{status}</span>;
}

function RecentBills({ data, onInvoice }: { data: DashboardData; onInvoice: (bill: DashboardBill) => void }) {
  return (
    <div className="dashboard-card rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <SectionHeading eyebrow="Billing activity" title="Recent Bills" action="View all" />
      <div className="space-y-1">
        {data.bills.map((bill) => (
          <button key={bill.id} onClick={() => onInvoice(bill)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-[var(--hover-bg)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--subtle-teal)] text-[var(--primary)]">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold text-[var(--text-secondary)]">{bill.property}</p>
                <StatusPill status={bill.status} />
              </div>
              <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{bill.unit} · {bill.period}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-[var(--text-secondary)]">{formatCurrency(bill.amount)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PaymentStatus({ data }: { data: DashboardData }) {
  const totalBills = data.bills.length;
  const paidBills = data.bills.filter((bill) => bill.status === "Paid").length;
  const pendingBills = data.bills.filter((bill) => bill.status === "Pending").length;
  const overdueBills = data.bills.filter((bill) => bill.status === "Overdue").length;
  const collectionRate = totalBills ? Math.round((paidBills / totalBills) * 100) : 0;
  const percentage = (count: number) => totalBills ? Math.round((count / totalBills) * 100) : 0;
  return (
    <div className="dashboard-card rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <SectionHeading eyebrow="Collections" title="Payment Status" />
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--primary) 0 ${collectionRate}%, var(--border) ${collectionRate}% 100%)` }}>
          <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center">
            <div>
              <p className="font-display text-2xl font-bold text-[var(--text-primary)]">{totalBills}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Total Bills</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3 text-xs">
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--text-secondary)]"><i className="h-2 w-2 rounded-full bg-[var(--primary)]" /> Paid</span>
            <strong className="text-[var(--text-secondary)]">{paidBills} · {percentage(paidBills)}%</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--text-secondary)]"><i className="h-2 w-2 rounded-full bg-[var(--warning)]" /> Pending</span>
            <strong className="text-[var(--text-secondary)]">{pendingBills} · {percentage(pendingBills)}%</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--text-secondary)]"><i className="h-2 w-2 rounded-full bg-[var(--error)]" /> Overdue</span>
            <strong className="text-[var(--text-secondary)]">{overdueBills} · {percentage(overdueBills)}%</strong>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex justify-between text-xs">
          <span className="font-semibold text-[var(--text-secondary)]">Collection rate</span>
          <strong className="text-[var(--primary)]">{collectionRate}%</strong>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
          <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${collectionRate}%` }} />
        </div>
      </div>
    </div>
  );
}

function MeterReadings({ readings }: { readings: PersistedMeterReading[] }) {
  return (
    <div className="dashboard-card rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <SectionHeading eyebrow="Live log" title="Recent Meter Readings" action="See log" />
      <div className="space-y-1">
        {readings.length === 0 && <p className="rounded-xl bg-[var(--subtle-teal)] p-4 text-sm text-[var(--text-secondary)]">No meter readings recorded yet.</p>}
        {readings.map((reading) => (
          <div key={reading.id} className="flex items-center gap-3 border-b border-[var(--border)] py-3 last:border-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hover-bg)] text-[var(--text-secondary)]">
              <Gauge className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[var(--text-secondary)]">{reading.meter_name}</p>
              <p className="truncate text-[10px] text-[var(--text-muted)]">{reading.property_name} · {new Date(`${reading.reading_date}T00:00:00`).toLocaleDateString("en-IN")}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-[var(--text-secondary)]">{reading.current_reading} kWh</p>
              <p className="mt-1 text-[10px] font-bold text-[var(--primary)]">{reading.units_used} used</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopProperties({ properties }: { properties: TopPropertyUsage[] }) {
  const largestUsage = properties[0]?.units ?? 0;
  return (
    <div className="dashboard-card rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <SectionHeading eyebrow="Consumption" title="Top Properties by Usage" action="View report" />
      <div className="space-y-4">
        {properties.length === 0 && <p className="rounded-xl bg-[var(--subtle-teal)] p-4 text-sm text-[var(--text-secondary)]">No property usage recorded yet.</p>}
        {properties.map((property, index) => (
          <div key={property.name}>
            <div className="mb-1.5 flex justify-between gap-3 text-xs">
              <span className="truncate font-semibold text-[var(--text-secondary)]">
                <span className="mr-2 text-[var(--text-muted)]">{String(index + 1).padStart(2, "0")}</span>
                {property.name}
              </span>
              <strong className="text-[var(--text-secondary)]">{property.units} kWh</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
              <div className="h-full rounded-full" style={{ width: `${largestUsage ? (property.units / largestUsage) * 100 : 0}%`, backgroundColor: property.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview({
  data,
  onAction,
  onInvoice,
  recentMeterReadings,
  topProperties,
  electricityUsage,
  isLoadingUsage = false,
  usageError = null,
  onRetryUsage,
  administrator = true,
}: {
  data: DashboardData;
  onAction: (action: QuickAction) => void;
  onInvoice: (bill: DashboardBill) => void;
  recentMeterReadings: PersistedMeterReading[];
  topProperties: TopPropertyUsage[];
  electricityUsage: ElectricityUsagePoint[];
  isLoadingUsage?: boolean;
  usageError?: string | null;
  onRetryUsage?: () => void;
  administrator?: boolean;
}) {
  const totalUnits = electricityUsage.reduce((sum, point) => sum + Number(point.usage || 0), 0);
  const formattedTotalUnits = Number(totalUnits || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[1440px]:grid-cols-6">
        {([
          { label: "Total Submitters", value: data.stats.submitters.toLocaleString("en-IN"), icon: Users, tone: "amber" },
          { label: "Total Units", value: formattedTotalUnits, icon: Gauge, tone: "teal" },
          { label: "Bills Generated", value: data.stats.billsGenerated.toLocaleString("en-IN"), icon: FileText, tone: "violet" },
          { label: "Pending Bills", value: data.bills.filter((bill) => bill.status === "Pending").length.toLocaleString("en-IN"), icon: ReceiptIndianRupee, tone: "slate" },
          { label: "Overdue Bills", value: data.bills.filter((bill) => bill.status === "Overdue").length.toLocaleString("en-IN"), icon: CircleDollarSign, tone: "coral" },
          { label: "Current Month Billing", value: formatCurrency(data.bills.reduce((sum, bill) => sum + bill.amount, 0)), icon: Landmark, tone: "teal" },
        ] as const).map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="dashboard-card min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-3">
              <div className={`grid h-9 w-9 place-items-center rounded-xl ${toneClasses[tone]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold text-[var(--primary)]">Current</span>
            </div>
            <p className="mt-4 text-xs font-semibold text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 min-w-0 truncate font-display text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl" title={value}>{value}</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">vs last month</p>
          </div>
        ))}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Demo payment summary">
        {([
          { label: "Total Collected", value: formatCurrency(data.paymentSummary?.totalCollected ?? data.stats.totalCollection) },
          { label: "Pending Amount", value: formatCurrency(data.paymentSummary?.pendingAmount ?? data.stats.pendingPayments) },
          { label: "Paid Bills", value: (data.paymentSummary?.paidBills ?? 0).toLocaleString("en-IN") },
          { label: "Pending Payments", value: (data.paymentSummary?.pendingPayments ?? 0).toLocaleString("en-IN") },
        ] as const).map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--subtle-teal)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 font-display text-xl font-bold text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <UsageChart points={electricityUsage} isLoading={isLoadingUsage} error={usageError} onRetry={onRetryUsage} />
        <RecentBills data={data} onInvoice={onInvoice} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PaymentStatus data={data} />
        <MeterReadings readings={recentMeterReadings} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TopProperties properties={topProperties} />
        <div className="dashboard-card rounded-xl border border-[var(--border)] bg-[var(--panel-dark)] p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--on-dark-muted)]">Shortcuts</p>
              <h2 className="font-display text-lg font-bold">Quick Actions</h2>
            </div>
            <Zap className="h-5 w-5 text-[var(--warning)]" />
          </div>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {(administrator ? quickActions : quickActions.filter((action) => action.id === "meter" || action.id === "invoice")).map((action) => {
              const Icon = quickActionIcons[action.id];
              return <button key={action.id} onClick={() => onAction(action)} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.06] p-3 text-left transition hover:border-[var(--on-dark-muted)]/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--on-dark-muted)]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--panel-dark-hover)] text-[var(--on-dark-muted)] transition group-hover:bg-[var(--panel-dark-hover)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white">{action.label}</span><span className="mt-0.5 block truncate text-[10px] text-white/60">{action.description}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardOverview;
