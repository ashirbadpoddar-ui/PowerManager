import type {
  Bill,
  BillCalculationRequest,
  BillCalculationResponse,
  BillListResponse,
  DetailedBillGenerateRequest,
  DetailedBillGenerationResponse,
  DetailedBillRequest,
  DetailedBillResponse,
  SimpleBillGenerateRequest,
  TariffSettings,
  WorkspaceResetResponse,
  SimpleBillRequest,
  SimpleBillResponse,
  SubmitterBillGenerateRequest,
} from "@/types/electricity";
import { apiRequest } from "@/services/apiClient";

export async function getTariffSettings(): Promise<TariffSettings> {
  return apiRequest<TariffSettings>("/api/electricity/settings");
}

export async function updateTariffSettings(payload: TariffSettings): Promise<TariffSettings> {
  return apiRequest<TariffSettings>("/api/electricity/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function calculateElectricityBill(
  payload: BillCalculationRequest
): Promise<BillCalculationResponse> {
  return apiRequest<BillCalculationResponse>("/api/electricity/calculate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export { calculateElectricityBill as calculateBill };

export async function calculateDetailedBill(payload: DetailedBillRequest): Promise<DetailedBillResponse> {
  return apiRequest<DetailedBillResponse>("/api/electricity/calculate-detailed", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateSimpleBill(payload: SimpleBillGenerateRequest): Promise<Bill> {
  return apiRequest<Bill>("/api/bills/simple", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateDetailedBills(
  payload: DetailedBillGenerateRequest,
): Promise<DetailedBillGenerationResponse> {
  return apiRequest<DetailedBillGenerationResponse>("/api/bills/detailed", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateSubmitterBill(payload: SubmitterBillGenerateRequest): Promise<Bill> {
  return apiRequest<Bill>("/api/bills/submitter", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBills(offset = 0, limit = 50): Promise<BillListResponse> {
  const search = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });

  return apiRequest<BillListResponse>(`/api/bills?${search.toString()}`);
}

export async function markBillPaid(billId: number): Promise<Bill> {
  return apiRequest<Bill>(`/api/bills/${billId}/mark-paid`, {
    method: "POST",
  });
}

export async function updateBillDueDate(billId: number, dueDate: string): Promise<Bill> {
  return apiRequest<Bill>(`/api/bills/${billId}/due-date`, { method: "PATCH", body: JSON.stringify({ due_date: dueDate }) });
}

export async function voidBill(billId: number): Promise<Bill> {
  return apiRequest<Bill>(`/api/bills/${billId}/void`, {
    method: "POST",
  });
}

export async function resetWorkspace(): Promise<TariffSettings> {
  return apiRequest<TariffSettings>("/api/electricity/reset", {
    method: "POST",
  });
}

export async function resetWorkspaceData(): Promise<WorkspaceResetResponse> {
  return apiRequest<WorkspaceResetResponse>("/api/electricity/reset-workspace", {
    method: "POST",
  });
}

export async function calculateSimpleBill(
  data: SimpleBillRequest
): Promise<SimpleBillResponse> {
  return apiRequest<SimpleBillResponse>("/api/electricity/simple-calculate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
