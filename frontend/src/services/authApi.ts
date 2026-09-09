import { apiRequest } from "@/services/apiClient";
import type {
  BootstrapRequest,
  BootstrapStatus,
  ChangePasswordRequest,
  LoginRequest,
  ProfileUpdateRequest,
  UserCreateRequest,
  UserResponse,
  UserUpdateRequest,
} from "@/types/auth";

export const getBootstrapStatus = () =>
  apiRequest<BootstrapStatus>("/api/auth/bootstrap-status", {}, { notifyOnUnauthorized: false });

export const bootstrapAdministrator = (payload: BootstrapRequest) =>
  apiRequest<UserResponse>(
    "/api/auth/bootstrap",
    { method: "POST", body: JSON.stringify(payload) },
    { notifyOnUnauthorized: false },
  );

export const login = (payload: LoginRequest) =>
  apiRequest<UserResponse>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify(payload) },
    { notifyOnUnauthorized: false },
  );

export const getCurrentUser = (notifyOnUnauthorized = true) =>
  apiRequest<UserResponse>("/api/auth/me", {}, { notifyOnUnauthorized });

export const updateCurrentUser = (payload: ProfileUpdateRequest) =>
  apiRequest<UserResponse>("/api/auth/me", { method: "PATCH", body: JSON.stringify(payload) });

export const changePassword = (payload: ChangePasswordRequest) =>
  apiRequest<UserResponse>("/api/auth/change-password", { method: "POST", body: JSON.stringify(payload) });

export const logout = () => apiRequest<void>("/api/auth/logout", { method: "POST" });

export const listUsers = () => apiRequest<UserResponse[]>("/api/users");

export const getUser = (id: number) => apiRequest<UserResponse>(`/api/users/${id}`);

export const createUser = (payload: UserCreateRequest) =>
  apiRequest<UserResponse>("/api/users", { method: "POST", body: JSON.stringify(payload) });

export const updateUser = (id: number, payload: UserUpdateRequest) =>
  apiRequest<UserResponse>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const resetUserPassword = (id: number, password: string) =>
  apiRequest<void>(`/api/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
