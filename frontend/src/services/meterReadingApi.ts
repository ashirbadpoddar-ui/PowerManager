import { apiRequest } from "@/services/apiClient";
import type { MeterReadingListResponse, PersistedMeterReading } from "@/types/electricity";

export type MeterReadingInput = Pick<
  PersistedMeterReading,
  "property_id" | "meter_name" | "previous_reading" | "current_reading" | "reading_date"
> & { submitter_id: number | null };

export const listMeterReadings = () => apiRequest<MeterReadingListResponse>("/api/meter-readings");

export const createMeterReading = (payload: MeterReadingInput) =>
  apiRequest<PersistedMeterReading>("/api/meter-readings", { method: "POST", body: JSON.stringify(payload) });

export const updateMeterReading = (id: number, payload: Partial<MeterReadingInput>) =>
  apiRequest<PersistedMeterReading>(`/api/meter-readings/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteMeterReading = (id: number) =>
  apiRequest<void>(`/api/meter-readings/${id}`, { method: "DELETE" });
