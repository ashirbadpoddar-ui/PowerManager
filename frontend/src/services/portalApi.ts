import { apiRequest } from "@/services/apiClient";
import type {
  MyBill,
  MyBillListResponse,
  MyConsumption,
  MyMeterReading,
  MyMeterReadingInput,
  MyMeterReadingSubmission,
  MySubmitterContext,
} from "@/types/portal";

export const getMySubmitter = () => apiRequest<MySubmitterContext>("/api/me/submitter");
export const listMyMeterReadings = () => apiRequest<MyMeterReading[]>("/api/me/meter-readings");
export const submitMyMeterReading = (payload: MyMeterReadingInput) =>
  apiRequest<MyMeterReadingSubmission>("/api/me/meter-readings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const listMyBills = () => apiRequest<MyBillListResponse>("/api/me/bills");
export const getMyBill = (billId: number) => apiRequest<MyBill>(`/api/me/bills/${billId}`);
export const completeDemoPayment = (billId: number, payload: { payment_method: "upi" | "card" | "net_banking" }) =>
  apiRequest<MyBill>(`/api/me/bills/${billId}/demo-payment`, { method: "POST", body: JSON.stringify(payload) });
export const getMyConsumption = () => apiRequest<MyConsumption>("/api/me/consumption");
