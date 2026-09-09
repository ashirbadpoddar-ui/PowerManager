export type ElectricitySlab = {
  min_units: number;
  max_units: number | null;
  rate_per_unit: number;
};

export type TariffSettings = {
  slabs: ElectricitySlab[];
};

export type BillCalculationRequest = {
  units: number;
  fixed_charge: number;
  tax_rate: number;
  slabs: ElectricitySlab[];
};

export type BreakdownItem = {
  slab_label: string;
  units_in_slab: number;
  rate_per_unit: number;
  amount: number;
};

export type BillCalculationResponse = {
  total_units: number;
  subtotal: number;
  fixed_charge: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  breakdown: BreakdownItem[];
};

export type BillFormValues = BillCalculationRequest;

export const defaultSlab: ElectricitySlab = {
  min_units: 0,
  max_units: null,
  rate_per_unit: 0,
};

export const defaultTariffSettings: TariffSettings = {
  slabs: [
    { min_units: 0, max_units: 100, rate_per_unit: 5 },
    { min_units: 100, max_units: 200, rate_per_unit: 7.5 },
    { min_units: 200, max_units: null, rate_per_unit: 10 },
  ],
};

export const defaultBillFormValues: BillFormValues = {
  units: 250,
  fixed_charge: 100,
  tax_rate: 5,
  slabs: defaultTariffSettings.slabs.map((slab) => ({ ...slab })),
};

// --- Detailed request/response types (main meter + submitters)
export type MainMeterReading = {
  previous_reading: number;
  current_reading: number;
  rate_per_unit: number;
};

export type SubmitterReading = {
  name: string;
  submitter_id: number;
  previous_reading: number;
  current_reading: number;
  rate_per_unit: number;
};

export type MeterBillResult = {
  previous_reading: number;
  current_reading: number;
  units: number;
  rate_per_unit: number;
  total_amount: number;
};

export type SubmitterBillResult = MeterBillResult & { name: string };

export type DetailedBillRequest = {
  main_meter: MainMeterReading;
  submitters: SubmitterReading[];
  fixed_charge?: number;
  tax_rate?: number;
  default_rate?: number | null;
};

export type DetailedBillResponse = {
  main_meter: MeterBillResult;
  submitters: SubmitterBillResult[];
  submitter_total_units: number;
  submitter_total_amount: number;
};

// --- Persisted billing types
export type BillStatus = "pending" | "overdue" | "paid" | "void";

export type BillCalculationType = "simple" | "main_meter" | "submitter" | "owner_common";

export type InvoiceMetadata = {
  recipient_label: string;
  property_label?: string | null;
  unit_label?: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
};

export type BillingRunMetadata = Omit<InvoiceMetadata, "recipient_label"> & {
  owner_recipient_label?: string;
};

export type SimpleBillInput = Pick<
  BillCalculationRequest,
  "units" | "fixed_charge" | "tax_rate"
>;

export type SimpleBillGenerateRequest = {
  idempotency_key: string;
  calculation: SimpleBillInput;
  metadata: InvoiceMetadata;
};

export type SubmitterBillGenerateRequest = {
  idempotency_key?: string;
  submitter_id: number;
  previous_reading: number;
  current_reading: number;
  rate_mode: "manual" | "slab";
  rate_per_unit: number | null;
  metadata: {
    period_start: string;
    period_end: string;
    due_date: string;
  };
};

export type DetailedBillGenerateRequest = {
  idempotency_key: string;
  property_id: number;
  calculation: DetailedBillRequest;
  metadata: BillingRunMetadata;
};

export type Bill = {
  previous_reading?: number | null;
  current_reading?: number | null;
  rate_per_unit?: number | null;
  rate_mode?: "manual" | "slab" | null;
  meter_name?: string | null;
  breakdown?: BreakdownItem[];

  id: number;
  bill_number: string;
  created_by_user_id: number;
  billing_run_id: number | null;
  tariff_id: number | null;
  submitter_id: number | null;
  calculation_type: BillCalculationType;
  recipient_label: string;
  property_label: string | null;
  unit_label: string | null;
  period_start: string;
  period_end: string;
  issued_at: string;
  due_date: string;
  status: BillStatus;
  total_units: number;
  energy_amount: number;
  fixed_charge: number;
  extra_charges: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  paid_at: string | null;
  payment_method?: "upi" | "card" | "net_banking" | null;
  transaction_id?: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  email_status?: "scheduled" | "sent" | "failed" | "not_available" | null;
};

export type BillListResponse = {
  items: Bill[];
  total: number;
};

export type BillingRun = {
  id: number;
  created_by_user_id: number;
  property_label: string | null;
  unit_label: string | null;
  period_start: string;
  period_end: string;
  issued_at: string;
  due_date: string;
  main_previous_reading: number;
  main_current_reading: number;
  main_meter_units: number;
  submitter_total_units: number;
  difference_units: number;
  default_rate: number;
  main_meter_amount: number;
  fixed_charge: number;
  main_extra_charge: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
};

export type DetailedBillGenerationResponse = {
  billing_run: BillingRun;
  invoices: Bill[];
};

// --- Dashboard types
export type QuickAction = {
  id: "property" | "submitter" | "meter" | "tariff" | "invoice" | "bulk" | "calculator";
  label: string;
  description: string;
};

export type MeterReading = {
  id: string;
  meter: string;
  location: string;
  units: number;
  delta: number;
  recordedAt: string;
  trend: "up" | "down" | "steady";
};

export type DashboardBill = {
  id: string;
  recordId?: number;
  property: string;
  unit: string;
  period: string;
  amount: number;
  status: "Paid" | "Pending" | "Overdue" | "Void";
  issued: string;
};

export type DashboardData = {
  stats: {
    properties: number;
    submitters: number;
    billsGenerated: number;
    totalCollection: number;
    pendingPayments: number;
  };
  paymentSummary?: {
    totalCollected: number;
    pendingAmount: number;
    paidBills: number;
    pendingPayments: number;
  };
  usage: Array<{ day: string; date: string; usage: number }>;
  bills: DashboardBill[];
  readings: MeterReading[];
  topProperties: Array<{ name: string; units: number; color: string }>;
  collectionRate: number;
};

export type SimpleMainMeter = MainMeterReading;
export type SimpleSubmitter = SubmitterReading;
export type SimpleBillRequest = {
  main_meter: SimpleMainMeter;
  submitters: SimpleSubmitter[];
};

export type ElectricityUsagePoint = {
  day: string;
  date: string;
  usage: number;
};

export type Submitter = {
  id: number;
  property_id: number;
  name: string;
  user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type Property = {
  id: number;
  created_by_user_id: number;
  name: string;
  place: string;
  unit: string;
  submitters: Submitter[];
  submitter_count: number;
  created_at: string;
  updated_at: string;
};

export type PropertyListResponse = {
  items: Property[];
  total: number;
  submitter_total: number;
};

export type PersistedMeterReading = {
  id: number;
  property_id: number;
  property_name: string;
  submitter_id?: number | null;
  submitter_name?: string | null;
  meter_name: string;
  previous_reading: number;
  current_reading: number;
  units_used: number;
  reading_date: string;
  created_at: string;
  updated_at: string;
};

export type MeterReadingListResponse = {
  items: PersistedMeterReading[];
  total: number;
};

export type WorkspaceResetResponse = {
  properties_cleared: number;
  submitters_cleared: number;
  meter_readings_cleared: number;
  bills_cleared: number;
  billing_runs_cleared: number;
  tariff_defaults_restored: boolean;
};

export type TopPropertyUsage = {
  name: string;
  units: number;
  color: string;
};
export type SimpleBillResponse = DetailedBillResponse & {
  submitter_total_amount: number;
};
