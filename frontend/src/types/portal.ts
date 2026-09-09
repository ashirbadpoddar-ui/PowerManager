import type { BreakdownItem, ElectricitySlab } from "@/types/electricity";

export type MyMeterReading = {
  id: number;
  meter_name: string;
  previous_reading: number;
  current_reading: number;
  units_used: number;
  reading_date: string;
  created_at: string;
};

export type MySubmitterContext = {
  assigned: boolean;
  submitter_id: number | null;
  submitter_name: string | null;
  property_name: string | null;
  property_place: string | null;
  unit: string | null;
  meter_name: string | null;
  latest_reading: MyMeterReading | null;
  tariff: ElectricitySlab[];
};

export type MyMeterReadingInput = {
  current_reading: number;
  reading_date: string;
};

export type MyMeterReadingSubmission = {
  reading: MyMeterReading;
  high_usage_warning: string | null;
};

export type MyBillStatus = "pending" | "overdue" | "paid";

export type MyBill = {
  rate_mode?: "manual" | "slab" | null;
  meter_name?: string | null;
  breakdown?: BreakdownItem[];
  id: number;
  invoice_number: string;
  submitter_name: string;
  property_name: string | null;
  unit: string | null;
  billing_period_start: string;
  billing_period_end: string;
  issued_at: string;
  due_date: string;
  status: MyBillStatus;
  previous_reading: number | null;
  current_reading: number | null;
  units: number;
  rate_per_unit: number | null;
  tariff_label: string;
  total_amount: number;
  payment_method?: "upi" | "card" | "net_banking" | null;
  transaction_id?: string | null;
  paid_at?: string | null;
};

export type MyBillListResponse = { items: MyBill[]; total: number };

export type ConsumptionPoint = { month: string; label: string; units: number };

export type MyConsumption = {
  current_month_units: number;
  previous_month_units: number;
  absolute_change: number;
  percentage_change: number | null;
  history: ConsumptionPoint[];
};
