import { apiRequest } from "@/services/apiClient";

export type RecordSearchResult = {
  kind: "property" | "submitter" | "invoice";
  id: number;
  title: string;
  secondary: string;
  property_id: number | null;
};

export const searchRecords = (query: string, signal: AbortSignal) =>
  apiRequest<{ items: RecordSearchResult[] }>(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal, cache: "no-store" });
