import { apiRequest } from "@/services/apiClient";
import type { Property, PropertyListResponse, Submitter } from "@/types/electricity";

export type PropertyInput = Pick<Property, "name" | "place" | "unit">;

export const listProperties = () => apiRequest<PropertyListResponse>("/api/properties");

export const createProperty = (payload: PropertyInput) =>
  apiRequest<Property>("/api/properties", { method: "POST", body: JSON.stringify(payload) });

export const updateProperty = (id: number, payload: Partial<PropertyInput>) =>
  apiRequest<Property>(`/api/properties/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteProperty = (id: number) =>
  apiRequest<void>(`/api/properties/${id}`, { method: "DELETE" });

export const createSubmitter = (propertyId: number, name: string) =>
  apiRequest<Submitter>(`/api/properties/${propertyId}/submitters`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const deleteSubmitter = (propertyId: number, submitterId: number) =>
  apiRequest<void>(`/api/properties/${propertyId}/submitters/${submitterId}`, { method: "DELETE" });

export const assignSubmitterAccount = (propertyId: number, submitterId: number, userId: number | null) =>
  apiRequest<Submitter>(`/api/properties/${propertyId}/submitters/${submitterId}/account`, {
    method: "PATCH",
    body: JSON.stringify({ user_id: userId }),
  });
