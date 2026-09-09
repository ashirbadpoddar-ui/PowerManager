import type { DashboardData, QuickAction } from "@/types/electricity";

export const dashboardData: DashboardData = {
  stats: {
    properties: 0,
    submitters: 48,
    billsGenerated: 32,
    totalCollection: 124560,
    pendingPayments: 28750,
  },
  paymentSummary: {
    totalCollected: 124560,
    pendingAmount: 28750,
    paidBills: 2,
    pendingPayments: 2,
  },
  usage: [
    { day: "Mon", date: "May 20", usage: 20 },
    { day: "Tue", date: "May 21", usage: 640 },
    { day: "Wed", date: "May 22", usage: 590 },
    { day: "Thu", date: "May 23", usage: 780 },
    { day: "Fri", date: "May 24", usage: 690 },
    { day: "Sat", date: "May 25", usage: 850 },
    { day: "Sun", date: "May 26", usage: 720 },
  ],
  bills: [
    { id: "BL-1048", property: "Sunshine Apartments", unit: "Unit 204", period: "May 01 - May 15, 2025", amount: 8, status: "Paid", issued: "May 16, 2025" },
    { id: "BL-1047", property: "Green Valley", unit: "Block B / 12", period: "May 01 - May 15, 2025", amount: 6180, status: "Pending", issued: "May 16, 2025" },
    { id: "BL-1046", property: "Silver Heights", unit: "Flat 3A", period: "May 01 - May 15, 2025", amount: 4320, status: "Paid", issued: "May 16, 2025" },
    { id: "BL-1045", property: "Park View", unit: "Villa 08", period: "Apr 16 - Apr 30, 2025", amount: 9720, status: "Overdue", issued: "May 01, 2025" },
  ],
  readings: [
    { id: "MR-228", meter: "Main Meter", location: "Sunshine Apartments", units: 780, delta: 8.4, recordedAt: "Today, 10:32 AM", trend: "up" },
    { id: "MR-227", meter: "Sub-meter 04", location: "Green Valley / Block B", units: 326, delta: -2.1, recordedAt: "Today, 09:48 AM", trend: "down" },
    { id: "MR-226", meter: "Sub-meter 11", location: "Silver Heights / Flat 3A", units: 214, delta: 0.4, recordedAt: "Yesterday, 06:15 PM", trend: "steady" },
    { id: "MR-225", meter: "Main Meter", location: "Park View", units: 642, delta: 5.8, recordedAt: "Yesterday, 04:20 PM", trend: "up" },
  ],
  topProperties: [
    { name: "Sunshine Apartments", units: 0, color: "var(--primary)" },
    { name: "Green Valley", units: 720, color: "var(--warning)" },
    { name: "Silver Heights", units: 610, color: "var(--accent)" },
    { name: "Park View", units: 540, color: "var(--error)" },
    { name: "Lake Side Residency", units: 490, color: "var(--accent)" },
  ],
  collectionRate: 78,
};

export const quickActions: QuickAction[] = [
  { id: "property", label: "Add property", description: "Create a managed property" },
  { id: "submitter", label: "Add submitter", description: "Register a tenant or owner" },
  { id: "meter", label: "Log meter", description: "Record a new reading" },
  { id: "invoice", label: "View invoice", description: "Open a digital bill" },
  { id: "bulk", label: "Generate bills", description: "Run a billing batch" },
  { id: "calculator", label: "Open calculator", description: "Calculate a bill preview" },
  { id: "tariff", label: "Tariff settings", description: "Manage slab and manual rates" },
];
