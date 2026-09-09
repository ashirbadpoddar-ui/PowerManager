"use client";

import {
  Bell,
  Building2,
  CircleDollarSign,
  ChevronDown,
  CircleHelp,
  FileBarChart,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  ReceiptIndianRupee,
  SlidersHorizontal,
  Users,
  User,
  X,
  Zap,
  Shield,
  Sliders
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlobalSearch, type SearchSelection } from "@/components/GlobalSearch";
import { apiRequest } from "@/services/apiClient";
import { OwnerDashboard } from "@/components/OwnerDashboard";
import { RecentBills } from "@/components/RecentBills";
import DashboardOverview from "@/components/DashboardOverview";
import { AuthGate, type AuthSession } from "@/components/AuthGate";
import { ProfileSettings as AccountProfileSettings } from "@/components/ProfileSettings";
import { SystemSettings, type ThemePreference } from "@/components/SystemSettings";
import { UserManagement } from "@/components/UserManagement";
import { PropertyManager } from "@/components/PropertyManager";
import { MeterReadingManager } from "@/components/MeterReadingManager";
import AdminCalculator from "@/components/AdminCalculator";
import TariffSettings from "@/components/TariffSettings";
import Reports from "@/components/Reports";
import { DemoPaymentModal } from "@/components/DemoPaymentModal";
import { UserDashboard } from "@/components/user/UserDashboard";
import { MyMeter } from "@/components/user/MyMeter";
import { MyBills, MyInvoiceDetail, MyReceiptDetail } from "@/components/user/MyBills";
import { Consumption } from "@/components/user/Consumption";
import { useDemoPayments } from "@/hooks/useDemoPayments";
import { dashboardData } from "@/lib/dashboardData";
import { listBills, markBillPaid, resetWorkspaceData } from "@/services/electricityApi";
import { getEffectivePaymentStatus } from "@/services/demoPaymentStorage";
import { completeDemoPayment } from "@/services/portalApi";
import { listProperties } from "@/services/propertyApi";
import { listMeterReadings } from "@/services/meterReadingApi";
import type {
  Bill,
  BillListResponse,
  DashboardBill,
  DashboardData,
  ElectricityUsagePoint,
  QuickAction,
  PropertyListResponse,
  PersistedMeterReading,
  TopPropertyUsage,
} from "@/types/electricity";
import type { UserResponse } from "@/types/auth";
import type { DemoPaymentMap } from "@/types/payment";
import type { MyBill } from "@/types/portal";
type View =
  | "Dashboard"
  | "properties"
  | "billing"
  | "readings"
  | "reports"
  | "owner"
  | "profile-settings"
  | "users-roles"
  | "system-settings"
  | "calculator"
  | "tariff-settings"
  | "my-meter"
  | "my-bills"
  | "consumption"
  | "invoice-details"
  | "payment-receipt"
  | "results";
type ModalAction = QuickAction["id"] | null;

type NavItem = { label: string; view: View; icon: typeof Building2 };
const manageNav: NavItem[] = [
  { label: "Overview", view: "Dashboard", icon: LayoutDashboard },
  { label: "Properties", view: "properties", icon: Building2 },
  { label: "Submitters", view: "owner", icon: Users },
  { label: "Meter readings", view: "readings", icon: Gauge },
];
const reportNav: NavItem[] = [
  { label: "Billing & invoices", view: "billing", icon: ReceiptIndianRupee },
  { label: "Reports", view: "reports", icon: FileBarChart },
  { label: "Calculator", view: "calculator", icon: CircleDollarSign },
  { label: "Tariff Settings", view: "tariff-settings", icon: Sliders },
];
const userNav: NavItem[] = [
  { label: "Dashboard", view: "Dashboard", icon: LayoutDashboard },
  { label: "My Meter", view: "my-meter", icon: Gauge },
  { label: "My Bills", view: "my-bills", icon: ReceiptIndianRupee },
  { label: "Consumption", view: "consumption", icon: FileBarChart },
  { label: "Profile", view: "profile-settings", icon: User },
];

const emptyDashboardData: DashboardData = {
  ...dashboardData,
  stats: {
    ...dashboardData.stats,
    properties: 0,
    submitters: 0,
    billsGenerated: 0,
    totalCollection: 0,
    pendingPayments: 0,
  },
  bills: [],
  paymentSummary: {
    totalCollected: 0,
    pendingAmount: 0,
    paidBills: 0,
    pendingPayments: 0,
  },
  collectionRate: 0,
};

function formatDateOnly(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function toDashboardBill(bill: Bill): DashboardBill {
  const status: DashboardBill["status"] = bill.status === "paid"
    ? "Paid"
    : bill.status === "overdue"
      ? "Overdue"
      : bill.status === "void"
        ? "Void"
        : "Pending";

  return {
    id: bill.bill_number,
    recordId: bill.id,
    property: bill.property_label || bill.recipient_label,
    unit: bill.unit_label || bill.recipient_label,
    period: `${formatDateOnly(bill.period_start)} - ${formatDateOnly(bill.period_end)}`,
    amount: bill.total_amount,
    status,
    issued: new Date(bill.issued_at).toLocaleDateString("en-IN"),
  };
}

function withPersistedBills(current: DashboardData, bills: Bill[], payments: DemoPaymentMap = {}): DashboardData {
  const activeBills = bills.filter((bill) => bill.status !== "void");
  const paidBills = activeBills.filter((bill) => getEffectivePaymentStatus(bill, payments[String(bill.id)]) === "paid");
  const outstandingBills = activeBills.filter((bill) => getEffectivePaymentStatus(bill, payments[String(bill.id)]) !== "paid");
  const totalCollected = paidBills.reduce((total, bill) => total + (payments[String(bill.id)]?.paidAmount ?? bill.total_amount), 0);
  const pendingAmount = outstandingBills.reduce((total, bill) => total + bill.total_amount, 0);

  return {
    ...current,
    stats: {
      ...current.stats,
      billsGenerated: bills.length,
      totalCollection: totalCollected,
      pendingPayments: pendingAmount,
    },
    bills: bills.slice(0, 4).map(toDashboardBill),
    paymentSummary: {
      totalCollected,
      pendingAmount,
      paidBills: paidBills.length,
      pendingPayments: outstandingBills.length,
    },
    collectionRate: activeBills.length ? Math.round((paidBills.length / activeBills.length) * 100) : 0,
  };
}

function withPropertyCounts(current: DashboardData, properties: PropertyListResponse): DashboardData {
  return { ...current, stats: { ...current.stats, properties: properties.total, submitters: properties.submitter_total } };
}

const propertyUsageColors = ["var(--primary)", "var(--blue-accent)", "var(--accent)", "var(--success)", "var(--secondary)"];

export function getTopPropertyUsage(readings: PersistedMeterReading[]): TopPropertyUsage[] {
  const totals = new Map<string, number>();
  for (const reading of readings) {
    totals.set(reading.property_name, (totals.get(reading.property_name) ?? 0) + reading.units_used);
  }
  return Array.from(totals, ([name, units]) => ({ name, units }))
    .sort((left, right) => right.units - left.units || left.name.localeCompare(right.name))
    .slice(0, 5)
    .map((property, index) => ({ ...property, color: propertyUsageColors[index] }));
}

export function getElectricityUsageOverview(readings: PersistedMeterReading[]): ElectricityUsagePoint[] {
  const totals = new Map<string, number>();
  for (const reading of readings) {
    totals.set(reading.reading_date, (totals.get(reading.reading_date) ?? 0) + reading.units_used);
  }

  return Array.from(totals)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([readingDate, usage]) => {
    const date = new Date(`${readingDate}T00:00:00`);
    return {
      day: Number.isNaN(date.getTime()) ? readingDate : date.toLocaleDateString("en-IN", { weekday: "short" }),
      date: Number.isNaN(date.getTime()) ? readingDate : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      usage,
    };
    });
}

function Button({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--on-dark-muted)] ${className}`}>{children}</button>;
}

function Sidebar({ activeView, onNavigate, collapsed, onCollapse, administrator }: { activeView: View; onNavigate: (view: View) => void; collapsed: boolean; onCollapse: () => void; administrator: boolean }) {
  const visibleManage = administrator ? manageNav : userNav;
  const visibleReports = administrator ? reportNav : [];
  const renderGroup = (title: string, items: NavItem[]) => <div className="mb-7"><p className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] ${collapsed ? "lg:hidden" : ""}`}>{title}</p>{items.map(({ label, view, icon: Icon }) => <Button key={label} aria-current={activeView === view ? "page" : undefined} onClick={() => onNavigate(view)} title={collapsed ? label : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold ${activeView === view ? "bg-[var(--primary)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]"}`}><Icon className="h-4 w-4 shrink-0" /><span className={collapsed ? "lg:hidden" : ""}>{label}</span></Button>)}</div>;
  return <aside className={`app-shell fixed inset-y-0 left-0 z-30 hidden h-screen overflow-y-auto flex-col border-r border-[var(--border)] px-3 py-4 transition-[width] duration-200 lg:flex ${collapsed ? "w-[64px]" : "w-[256px]"}`}><div className={`mb-9 flex items-center gap-3 px-2 ${collapsed ? "justify-center" : ""}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-white shadow-[var(--shadow-card)]"><Zap className="h-5 w-5" /></div><div className={collapsed ? "lg:hidden" : ""}><p className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)]">PowerManage</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{administrator ? "Admin workspace" : "Submitter workspace"}</p></div></div>{renderGroup(administrator ? "Manage" : "Workspace", visibleManage)}{renderGroup("Reports", visibleReports)}<div className="mt-auto rounded-xl bg-[var(--subtle-teal)] p-3.5"><div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white"><CircleHelp className="h-4 w-4" /></div><p className={`text-xs font-bold text-[var(--text-secondary)] ${collapsed ? "lg:hidden" : ""}`}>Need a hand?</p><p className={`mt-1 text-[10px] leading-4 text-[var(--text-secondary)] ${collapsed ? "lg:hidden" : ""}`}>Your billing workspace is ready.</p></div><Button onClick={onCollapse} className="mt-4 hidden items-center justify-center text-[var(--text-muted)] lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}><SlidersHorizontal className="h-4 w-4" /></Button></aside>;
}

export function MobileSidebar({ activeView, onNavigate, onClose, administrator = true }: { activeView: View; onNavigate: (view: View) => void; onClose: () => void; administrator?: boolean }) {
  const items = administrator ? [...manageNav, ...reportNav] : userNav;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);
  return <div className="fixed inset-0 z-40 bg-[var(--text-primary)]/35 lg:hidden" onClick={onClose}><div className="app-shell flex h-full w-[min(280px,calc(100vw-24px))] overflow-y-auto flex-col p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-8 flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white"><Zap className="h-5 w-5" /></div><p className="font-display text-lg font-bold text-[var(--text-primary)]">PowerManage</p></div><Button onClick={onClose} aria-label="Close navigation" className="grid h-11 w-11 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"><X className="h-5 w-5" /></Button></div><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Navigation</p><div className="space-y-1">{items.map(({ label, view, icon: Icon }) => <Button key={label} onClick={() => { onNavigate(view); onClose(); }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold ${activeView === view ? "bg-[var(--primary)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"}`}><Icon className="h-4 w-4" />{label}</Button>)}</div><div className="mt-auto rounded-xl bg-[var(--subtle-teal)] p-4"><p className="text-xs font-bold text-[var(--text-secondary)]">Need a hand?</p><p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">Our support team is here for you.</p></div></div></div>;
}

function UserMobileNavigation({ activeView, onNavigate, onLogout }: { activeView: View; onNavigate: (view: View) => void; onLogout: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);
  const tabs = [
    { label: "Home", view: "Dashboard" as View, icon: LayoutDashboard },
    { label: "My Bills", view: "my-bills" as View, icon: ReceiptIndianRupee },
    { label: "Meter", view: "my-meter" as View, icon: Gauge },
    { label: "Usage", view: "consumption" as View, icon: FileBarChart },
  ];
  const isMoreActive = activeView === "profile-settings";
  return <><nav aria-label="User navigation" className="app-shell fixed inset-x-0 bottom-0 z-40 border-t border-white/10  px-2 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] lg:hidden" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}><div className="mx-auto grid max-w-lg grid-cols-5">{tabs.map(({ label, view, icon: Icon }) => {
    const active = activeView === view || (view === "my-bills" && ["invoice-details", "payment-receipt"].includes(activeView));
    return <button key={view} type="button" aria-label={`${label} tab`} aria-current={active ? "page" : undefined} onClick={() => onNavigate(view)} className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold transition-colors duration-150 ${active ? "bg-[var(--primary)] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon className="h-5 w-5" aria-hidden="true" /><span>{label}</span></button>;
  })}<button type="button" aria-label="More tab" aria-current={isMoreActive ? "page" : undefined} aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold transition-colors duration-150 ${isMoreActive ? "bg-[var(--primary)] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><MoreHorizontal className="h-5 w-5" aria-hidden="true" /><span>More</span></button></div></nav>
    {moreOpen && <div className="fixed inset-0 z-50 bg-black/55 lg:hidden" onClick={() => setMoreOpen(false)}><section role="dialog" aria-modal="true" aria-label="More options" className="app-shell absolute inset-x-0 bottom-0 rounded-t-xl border-t border-white/10  p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-slate-100 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-600" /><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">More</p><button type="button" onClick={() => { onNavigate("profile-settings"); setMoreOpen(false); }} className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-white/5"><User className="h-5 w-5 text-[var(--error)]" />Profile</button><button type="button" onClick={() => { setMoreOpen(false); onLogout(); }} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-[var(--error)] hover:bg-white/5"><LogOut className="h-5 w-5" />Logout</button></section></div>}
  </>;
}

function AdminMobileNavigation({ activeView, onNavigate, onMore }: { activeView: View; onNavigate: (view: View) => void; onMore: () => void }) {
  const tabs = [manageNav[0], manageNav[1], manageNav[3], reportNav[0]];
  return <nav aria-label="Admin navigation" className="app-shell fixed inset-x-0 bottom-0 z-30 border-t border-white/10 px-2 pt-2 lg:hidden" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
    <div className="mx-auto grid max-w-lg grid-cols-5">{tabs.map(({ view, icon: Icon }, index) => <button key={view} aria-current={activeView === view ? "page" : undefined} onClick={() => onNavigate(view)} className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${activeView === view ? "bg-[var(--primary)] text-white" : "text-white/70 hover:bg-white/10"}`}><Icon className="h-5 w-5" /><span>{["Home", "Properties", "Readings", "Billing"][index]}</span></button>)}<button onClick={onMore} className="flex min-h-11 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-white/70"><MoreHorizontal className="h-5 w-5" /><span>More</span></button></div>
  </nav>;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AD";
}

function Header({
  user,
  activeView,
  onMenu,
  onSearchSelect,
  onNavigate,
  onLogout,
  administrator,
}: {
  user: UserResponse;
  activeView: View;
  onMenu: () => void;
  onSearchSelect: (result: SearchSelection) => void;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  administrator: boolean;
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const pageTitle = activeView === "Dashboard" ? "Dashboard" : activeView === "owner" ? "Bill generation" : activeView === "billing" ? "Billing & invoices" : activeView === "readings" ? "Meter readings" : activeView === "my-meter" ? "My Meter" : activeView === "my-bills" ? "My Bills" : activeView === "consumption" ? "Consumption" : activeView === "invoice-details" ? "Invoice" : activeView === "payment-receipt" ? "Payment receipt" : activeView === "properties" ? "Properties" : activeView === "reports" ? "Reports" : activeView === "calculator" ? "Calculator" : activeView === "tariff-settings" ? "Tariff settings" : activeView === "profile-settings" ? "My profile" : activeView === "users-roles" ? "Permissions & roles" : "System settings";

  return (
    <header className="app-shell app-header flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {administrator && <Button
          onClick={onMenu}
          className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </Button>}

        <div className="hidden min-w-0 lg:block"><p className="font-display text-lg font-bold text-[var(--text-primary)]">{pageTitle}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">Electricity usage and billing overview.</p></div>
        <p className="font-display text-base font-bold text-[var(--text-primary)] lg:hidden">{pageTitle}</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">

        <Button
          aria-label="Notifications"
          className="relative grid h-11 w-11 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] sm:h-9 sm:w-9"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--error)] ring-2 ring-[var(--surface)]" />
        </Button>

        {/* ACCOUNT */}
        <div className="relative border-l border-[var(--border)] pl-2 sm:pl-4">

          <Button
            onClick={() => setShowProfileMenu((value) => !value)}
            className="flex min-h-11 items-center gap-2 text-left sm:min-h-0"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--active-bg)] text-[var(--primary)] sm:h-8 sm:w-8" title={getInitials(user.name)} aria-label={`${user.role === "administrator" ? "Administrator" : "User"} avatar`}>
              {user.role === "administrator" ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>

            <div className="hidden sm:block">
              <p className="max-w-[140px] truncate text-xs font-bold text-[var(--text-secondary)]">
                {user.name}
              </p>

              <p className="text-[10px] text-[var(--text-muted)]">
                {user.role === "administrator" ? "Administrator" : "User"}
              </p>
            </div>

            <ChevronDown
              className={`hidden h-3.5 w-3.5 text-[var(--text-muted)] transition-transform sm:block ${showProfileMenu ? "rotate-180" : ""
                }`}
            />
          </Button>


          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="shell-popover absolute right-0 mt-2 w-52 rounded-xl border border-[var(--border)] bg-white py-1.5 shadow-2xl z-40">

              {/* Account information */}
              <div className="border-b border-[var(--border)] px-3.5 py-2.5">
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {user.name}
                </p>

                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {user.email}
                </p>
              </div>

              {/* Menu */}
              <div className="py-1">

                {/* Profile */}
                <button
                  onClick={() => {
                    onNavigate("profile-settings");
                    setShowProfileMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                >
                  <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />

                  <span>My Profile</span>
                </button>

                {/* Permissions */}
                {user.role === "administrator" && <button
                  onClick={() => {
                    onNavigate("users-roles");
                    setShowProfileMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                >
                  <Shield className="h-3.5 w-3.5 text-[var(--text-muted)]" />

                  <span>Permissions & Roles</span>
                </button>}

                {/* System settings */}
                {user.role === "administrator" && <button
                  onClick={() => {
                    onNavigate("system-settings");
                    setShowProfileMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                >
                  <Sliders className="h-3.5 w-3.5 text-[var(--text-muted)]" />

                  <span>System Settings</span>
                </button>}

              </div>

              {/* Logout */}
              <div className="border-t border-[var(--border)] pt-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-[var(--error)] hover:bg-[var(--error-bg)]"
                >
                  <LogOut className="h-3.5 w-3.5 text-[var(--error)]" />

                  <span>Sign Out</span>
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
      <div className="order-last w-full min-w-0 lg:order-first lg:w-64">
        <GlobalSearch key={`${user.id}:${user.role}`} pages={(administrator ? [...manageNav, ...reportNav, { label: "Profile", view: "profile-settings" }, { label: "Permissions & roles", view: "users-roles" }, { label: "System settings", view: "system-settings" }] : userNav).map((item) => ({ kind: "page", id: item.view, title: item.label, secondary: "Open page" }))} onSelect={onSearchSelect} />
      </div>
    </header>
  );
}
function PlaceholderView({ title, description, icon: Icon, action }: { title: string; description: string; icon: typeof Building2; action?: () => void }) {
  return <div className="grid min-h-[420px] place-items-center rounded-xl border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-card)]"><div className="max-w-sm"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-[var(--primary)] text-white"><Icon className="h-6 w-6" /></div><h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>{action && <Button onClick={action} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--primary-hover)]"><Plus className="h-4 w-4" />Create new</Button>}</div></div>;
}

function Modal({ action, bill, onClose, onSettle }: { action: ModalAction; bill: DashboardBill | null; onClose: () => void; onSettle: (id: string) => void }) {
  if (!action) return null;
  const title = action === "property" ? "Add a property" : action === "submitter" ? "Register submitter" : action === "meter" ? "Record meter reading" : action === "invoice" ? "Digital electricity invoice" : "Generate bills in bulk";
  const descriptions = { property: "Add a managed property to your PowerManage workspace.", submitter: "Register a tenant or owner who submits readings.", meter: "Capture a new main meter or sub-meter reading.", tariff: "Update the rates used for your next billing run.", invoice: "Review the bill and settle the payment digitally.", bulk: "Generate bills for all ready properties in this billing period.", calculator: "Calculate a bill preview using the configured tariff." };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--panel-dark)]/55 p-4 backdrop-blur-sm" onClick={onClose}><div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--surface)] p-5 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()}><div className="mb-6 flex items-start justify-between gap-4"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">PowerManage workflow</p><h2 id="modal-title" className="font-display text-2xl font-bold text-[var(--text-primary)]">{title}</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">{descriptions[action]}</p></div><Button onClick={onClose} aria-label="Close dialog" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"><X className="h-5 w-5" /></Button></div>{action === "invoice" && bill ? <div className="space-y-5"><div className="rounded-xl bg-[var(--subtle-teal)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[var(--text-secondary)]">{bill.property}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{bill.unit} · {bill.period}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">{bill.status}</span></div><p className="mt-5 font-display text-3xl font-bold text-[var(--text-primary)]">₹{bill.amount.toLocaleString("en-IN")}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Invoice {bill.id} · Issued {bill.issued}</p></div><div className="flex gap-3"><Button onClick={() => { onClose(); }} className="flex-1 rounded-lg border border-[var(--input-border)] bg-white px-4 py-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Close preview</Button><Button onClick={() => { onSettle(bill.id); onClose(); }} className="flex-1 rounded-lg bg-[var(--primary)] px-4 py-3 text-xs font-bold text-white hover:bg-[var(--primary-hover)]">Mark as paid</Button></div></div> : action === "bulk" ? <div className="space-y-5"><div className="rounded-xl border border-[var(--border)] bg-[var(--subtle-teal)] p-4 text-sm text-[var(--text-secondary)]"><strong className="text-[var(--text-secondary)]">32 bills</strong> are ready to be generated for the May 20 - May 26 billing cycle.</div><div className="flex justify-end gap-3"><Button onClick={onClose} className="rounded-lg px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)]">Cancel</Button><Button onClick={onClose} className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--primary-hover)]">Generate 32 bills</Button></div></div> : <form onSubmit={(event) => { event.preventDefault(); onClose(); }} className="space-y-4"><label className="block text-xs font-bold text-[var(--text-secondary)]">{action === "property" ? "Property name" : action === "submitter" ? "Full name" : action === "meter" ? "Meter name" : "Rate label"}<input required className="mt-2 h-11 w-full rounded-lg border border-[var(--input-border)] bg-white px-3 text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--primary)]" placeholder={action === "property" ? "e.g. Sunshine Apartments" : action === "submitter" ? "e.g. Priya Menon" : action === "meter" ? "e.g. Main Meter 02" : "e.g. Residential slab"} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold text-[var(--text-secondary)]">{action === "meter" ? "Current reading" : action === "tariff" ? "From units" : "Contact email"}<input required type={action === "meter" || action === "tariff" ? "number" : "email"} className="mt-2 h-11 w-full rounded-lg border border-[var(--input-border)] bg-white px-3 text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--primary)]" placeholder={action === "meter" ? "780" : action === "tariff" ? "0" : "name@example.com"} /></label><label className="block text-xs font-bold text-[var(--text-secondary)]">{action === "tariff" ? "Rate per unit" : action === "meter" ? "Previous reading" : "Phone number"}<input required type={action === "tariff" || action === "meter" ? "number" : "tel"} className="mt-2 h-11 w-full rounded-lg border border-[var(--input-border)] bg-white px-3 text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--primary)]" placeholder={action === "tariff" ? "5.00" : action === "meter" ? "720" : "+91 98765 43210"} /></label></div><div className="flex justify-end gap-3 pt-3"><Button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)]">Cancel</Button><Button type="submit" className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--primary-hover)]">Save changes</Button></div></form>}</div></div>;
}

function PowerManageApp({ user, setUser, signOut }: AuthSession) {
  const isAdministrator = user.role === "administrator";
  const [activeView, setActiveView] = useState<View>("Dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<{ propertyId: number; submitterId?: number } | null>(null);
  const [searchInvoice, setSearchInvoice] = useState<Bill | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [quickStartAction, setQuickStartAction] = useState<QuickAction["id"] | null>(null);
  const [selectedBill, setSelectedBill] = useState<DashboardBill | null>(null);
  const [selectedMyBillId, setSelectedMyBillId] = useState<number | null>(null);
  const [selectedPaymentBill, setSelectedPaymentBill] = useState<MyBill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billList, setBillList] = useState<BillListResponse>({ items: [], total: 0 });
  const [isLoadingBills, setIsLoadingBills] = useState(true);
  const [billLoadError, setBillLoadError] = useState<string | null>(null);
  const [billsLastRefreshedAt, setBillsLastRefreshedAt] = useState<Date | null>(null);
  const [dashboardState, setDashboardState] = useState<DashboardData>(emptyDashboardData);
  const [propertyData, setPropertyData] = useState<PropertyListResponse>({ items: [], total: 0, submitter_total: 0 });
  const [recentMeterReadings, setRecentMeterReadings] = useState<PersistedMeterReading[]>([]);
  const [meterReadings, setMeterReadings] = useState<PersistedMeterReading[]>([]);
  const [isLoadingMeterReadings, setIsLoadingMeterReadings] = useState(true);
  const [meterReadingsError, setMeterReadingsError] = useState<string | null>(null);
  const meterReadingsLoaded = useRef(false);
  const [theme, setTheme] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("powermanage-theme");
    return stored === "dark" || stored === "light" ? stored : "dark";
  });
  const payments = useDemoPayments();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("powermanage-theme", theme);
  }, [theme]);

  const loadPersistedBills = useCallback(async (quiet = false) => {
    if (!isAdministrator) {
      setBillList({ items: [], total: 0 });
      setIsLoadingBills(false);
      return;
    }
    if (!quiet) setIsLoadingBills(true);
    try {
      const response = await listBills();
      setBillList(response);
      setBillsLastRefreshedAt(new Date());
      setBillLoadError(null);
    } catch (caught) {
      setBillLoadError(caught instanceof Error ? caught.message : "Unable to load invoice history.");
    } finally {
      if (!quiet) setIsLoadingBills(false);
    }
  }, [isAdministrator]);

  const loadRecentMeterReadings = useCallback(async () => {
    if (!isAdministrator) return;
    const isInitialLoad = !meterReadingsLoaded.current;
    if (isInitialLoad) setIsLoadingMeterReadings(true);
    setMeterReadingsError(null);
    try {
      const response = await listMeterReadings();
      setMeterReadings(response.items);
      setRecentMeterReadings(response.items.slice(0, 4));
      meterReadingsLoaded.current = true;
    } catch (caught) {
      setMeterReadingsError(caught instanceof Error ? caught.message : "Unable to load usage data.");
    } finally {
      if (isInitialLoad) setIsLoadingMeterReadings(false);
    }
  }, [isAdministrator]);

  useEffect(() => {
    if (isAdministrator) void loadPersistedBills();
  }, [isAdministrator, loadPersistedBills]);

  useEffect(() => {
    if (!isAdministrator || activeView !== "billing") return;
    const timer = window.setInterval(() => { void loadPersistedBills(true); }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeView, isAdministrator, loadPersistedBills]);

  useEffect(() => {
    if (!isAdministrator) return;
    void loadRecentMeterReadings();
    const refreshId = window.setInterval(() => void loadRecentMeterReadings(), 15_000);
    return () => window.clearInterval(refreshId);
  }, [isAdministrator, loadRecentMeterReadings]);

  useEffect(() => {
    if (!isAdministrator) return;
    void listProperties()
      .then((response) => setPropertyData(response))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load properties."));
  }, [isAdministrator]);

  useEffect(() => {
    setDashboardState((current) => withPersistedBills(current, billList.items, payments));
  }, [billList.items, payments]);

  useEffect(() => {
    setDashboardState((current) => withPropertyCounts(current, propertyData));
  }, [propertyData]);

  const mergePersistedBills = useCallback((incomingBills: Bill[]) => {
    if (incomingBills.length === 0) return;

    setBillList((current) => {
      const incomingIds = new Set(incomingBills.map((bill) => bill.id));
      const replacedIds = new Set(current.items.filter((bill) => incomingIds.has(bill.id)).map((bill) => bill.id));
      return {
        items: [...incomingBills, ...current.items.filter((bill) => !incomingIds.has(bill.id))],
        total: current.total + incomingBills.length - replacedIds.size,
      };
    });
  }, []);
 
  const navigate = (view: View) => {
    if (!isAdministrator && !["Dashboard", "my-meter", "my-bills", "consumption", "profile-settings", "invoice-details", "payment-receipt"].includes(view)) return;
    setSearchTarget(null);
    setSearchInvoice(null);
    setActiveView(view);
    setSearchQuery("");
    setError(null);
  };
  const selectSearchResult = async (result: SearchSelection) => {
    if (result.kind === "page") { navigate(result.id as View); return; }
    if (!isAdministrator) {
      if (result.kind === "invoice") { setSelectedMyBillId(result.id); navigate("invoice-details"); }
      else navigate("my-meter");
      return;
    }
    try {
      if (result.kind === "invoice") {
        const bill = await apiRequest<Bill>(`/api/bills/${result.id}`);
        mergePersistedBills([bill]);
        navigate("billing");
        setSearchInvoice(bill);
      } else {
        const properties = await listProperties();
        if (!properties.items.some((item) => item.id === result.property_id && (result.kind !== "submitter" || item.submitters.some((submitter) => submitter.id === result.id)))) throw new Error("This record is no longer available.");
        setPropertyData(properties);
        navigate("properties");
        setSearchTarget({ propertyId: result.property_id!, submitterId: result.kind === "submitter" ? result.id : undefined });
      }
    } catch {
      setError("Unable to open this search result. It may have been removed or your access may have changed.");
    }
  };
  const openAction = (action: QuickAction) => {
    setQuickStartAction(action.id);
    if (action.id === "property" || action.id === "submitter") {
      navigate("properties");
      return;
    }
    if (action.id === "meter") { navigate("readings"); return; }
    if (action.id === "invoice") { navigate("billing"); return; }
    if (action.id === "bulk") { navigate("owner"); return; }
    if (action.id === "calculator") { navigate("calculator"); return; }
    if (action.id === "tariff") { navigate("tariff-settings"); return; }
  };
  const openInvoice = (bill: DashboardBill) => { const persisted = billList.items.find((item) => item.id === bill.recordId); if (persisted) { navigate("billing"); setSearchInvoice(persisted); } };
  const openMyPayment = (bill: MyBill) => setSelectedPaymentBill(bill);
  const openMyReceipt = (billId: number) => {
    setSelectedPaymentBill(null);
    setSelectedMyBillId(billId);
    navigate("payment-receipt");
  };
  const settleBill = async (id: string) => {
    const bill = dashboardState.bills.find((candidate) => candidate.id === id);
    if (!bill?.recordId || bill.status === "Paid" || bill.status === "Void") return;

    try {
      const updatedBill = await markBillPaid(bill.recordId);
      mergePersistedBills([updatedBill]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to mark the invoice as paid.");
    }
  };
  const handleWorkspaceReset = async () => {
    try {
      const result = await resetWorkspaceData();
      setSelectedBill(null);
      setModalAction(null);
      setPropertyData({ items: [], total: 0, submitter_total: 0 });
      setMeterReadings([]);
      setRecentMeterReadings([]);
      await Promise.all([loadPersistedBills(), loadRecentMeterReadings()]);
      navigate("Dashboard");
      setError(null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reset workspace.";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };
let content;

if (activeView === "Dashboard") {
  content = isAdministrator ? (
    <DashboardOverview
      data={dashboardState}
      onAction={openAction}
      onInvoice={openInvoice}
       recentMeterReadings={recentMeterReadings}
       topProperties={getTopPropertyUsage(meterReadings)}
       electricityUsage={getElectricityUsageOverview(meterReadings)}
       isLoadingUsage={isLoadingMeterReadings}
       usageError={meterReadingsError}
       onRetryUsage={() => { void loadRecentMeterReadings(); }}
       administrator={isAdministrator}
     />
  ) : <UserDashboard name={user.name} onNavigate={(view) => navigate(view)} />;
}

else if (activeView === "owner") {
  content = isAdministrator ? <OwnerDashboard properties={propertyData} onBillsGenerated={mergePersistedBills} onOpenBilling={() => navigate("billing")} /> : <UserDashboard name={user.name} onNavigate={(view) => navigate(view)} />;
}

/* PROFILE PAGE */
else if (activeView === "profile-settings") {
  content = (
    <AccountProfileSettings user={user} onUserUpdated={setUser} />
  );
}

/* PERMISSIONS */
  else if (activeView === "users-roles") {
  content = isAdministrator
    ? <UserManagement currentUser={user} searchQuery={searchQuery} onCurrentUserUpdated={setUser} />
    : <PlaceholderView title="Access denied" description="Administrator access is required." icon={Shield} />;
}

/* SYSTEM SETTINGS */
else if (activeView === "system-settings") {
  content = <SystemSettings theme={theme} onThemeChange={setTheme} onResetWorkspace={isAdministrator ? handleWorkspaceReset : undefined} isAdministrator={isAdministrator} />;
}

else if (activeView === "properties") {
  content = isAdministrator ? <PropertyManager searchTarget={searchTarget} onClearSearchTarget={() => setSearchTarget(null)} data={propertyData} searchQuery={searchQuery} onDataChange={setPropertyData} meterReadings={meterReadings} onBillGenerated={(bill) => mergePersistedBills([bill])} onOpenBilling={() => navigate("billing")} initialAction={quickStartAction === "property" || quickStartAction === "submitter" ? quickStartAction : null} /> : <UserDashboard name={user.name} onNavigate={(view) => navigate(view)} />;
}

else if (activeView === "readings") {
  content = isAdministrator ? <MeterReadingManager properties={propertyData} onChanged={loadRecentMeterReadings} openAddForm={quickStartAction === "meter"} /> : <MyMeter />;
}

else if (activeView === "my-meter") {
  content = <MyMeter />;
}

else if (activeView === "billing") {
  content = isAdministrator ? (
    <RecentBills
      initialInvoice={searchInvoice}
      bills={billList.items}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      total={billList.total}
      isLoading={isLoadingBills}
      loadError={billLoadError}
      lastRefreshedAt={billsLastRefreshedAt}
      onRefresh={loadPersistedBills}
      onBillUpdated={(bill) => mergePersistedBills([bill])}
    />
  ) : <MyBills onOpen={(billId) => { setSelectedMyBillId(billId); navigate("invoice-details"); }} onPay={openMyPayment} onReceipt={openMyReceipt} />;
}

else if (activeView === "my-bills") {
  content = <MyBills onOpen={(billId) => { setSelectedMyBillId(billId); navigate("invoice-details"); }} onPay={openMyPayment} onReceipt={openMyReceipt} />;
}

else if (activeView === "invoice-details") {
  content = selectedMyBillId ? <MyInvoiceDetail billId={selectedMyBillId} onBack={() => navigate("my-bills")} onPay={openMyPayment} onReceipt={openMyReceipt} /> : <MyBills onOpen={(billId) => { setSelectedMyBillId(billId); }} onPay={openMyPayment} onReceipt={openMyReceipt} />;
}

else if (activeView === "payment-receipt") {
  content = selectedMyBillId ? <MyReceiptDetail billId={selectedMyBillId} onBack={() => navigate("my-bills")} /> : <MyBills onOpen={(billId) => { setSelectedMyBillId(billId); }} onPay={openMyPayment} onReceipt={openMyReceipt} />;
}

else if (activeView === "consumption") {
  content = <Consumption />;
}

else if (activeView === "reports") {
  content = <Reports bills={billList.items} readings={meterReadings} />;
}
else if (activeView === "calculator") {
  content = isAdministrator ? <AdminCalculator /> : <PlaceholderView title="Access denied" description="Administrator access is required." icon={Shield} />;
}
else if (activeView === "tariff-settings") {
  content = isAdministrator ? <TariffSettings /> : <PlaceholderView title="Access denied" description="Administrator access is required." icon={Shield} />;
}

else {
  content = (
    <PlaceholderView
      title="Dashboard"
      description="Welcome to PowerManage."
      icon={LayoutDashboard}
    />
  );
}


  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen w-full overflow-hidden rounded-none border border-transparent bg-[var(--background)]">

        <Sidebar
          activeView={activeView}
          onNavigate={navigate}
          collapsed={isSidebarCollapsed}
          administrator={isAdministrator}
          onCollapse={() =>
            setIsSidebarCollapsed((value) => !value)
          }
        />

        {isMobileMenuOpen && (
          <MobileSidebar
            activeView={activeView}
            onNavigate={navigate}
            onClose={() => setIsMobileMenuOpen(false)}
            administrator={isAdministrator}
          />
        )}

        <div className={`min-w-0 flex-1 transition-[margin] duration-200 ${isSidebarCollapsed ? "lg:ml-[64px]" : "lg:ml-[256px]"}`}>

          <Header
            user={user}
            activeView={activeView}
            onMenu={() => setIsMobileMenuOpen(true)}
            onSearchSelect={(result) => { void selectSearchResult(result); }}
            administrator={isAdministrator}
            onNavigate={navigate}
            onLogout={() => {
              void signOut().catch((caught) => {
                setError(caught instanceof Error ? caught.message : "Unable to sign out cleanly.");
              });
            }}
          />

          <div className={`workspace mx-auto min-w-0 max-w-[1400px] px-3 py-6 min-[375px]:px-4 sm:px-6 lg:px-8 pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-8`}>
            {error && <div role="alert" className="mb-5 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{error}</div>}
            {content}
          </div>

        </div>
      </div>
      {isAdministrator && <Modal
        action={modalAction}
        bill={selectedBill}
        onClose={() => setModalAction(null)}
        onSettle={settleBill}
      />}
      {!isAdministrator && selectedPaymentBill && <DemoPaymentModal
        bill={selectedPaymentBill}
        onClose={() => setSelectedPaymentBill(null)}
          onPaymentSaved={async (payment) => {
          if (payment.status !== "paid" || !payment.method) return;
          const confirmedBill = await completeDemoPayment(payment.billId, {
            payment_method: payment.method,
          });
          window.dispatchEvent(new Event("powermanage-bill-change"));
          return confirmedBill;
        }}
        onReceipt={openMyReceipt}
      />}
      {isAdministrator && <AdminMobileNavigation activeView={activeView} onNavigate={navigate} onMore={() => setIsMobileMenuOpen(true)} />}
      {!isAdministrator && <UserMobileNavigation activeView={activeView} onNavigate={navigate} onLogout={() => { void signOut().catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to sign out cleanly.")); }} />}
    </main>
  );

}

export default function HomePage() {
  return <AuthGate>{(session) => <PowerManageApp key={`${session.user.id}:${session.user.role}`} {...session} />}</AuthGate>;
}
