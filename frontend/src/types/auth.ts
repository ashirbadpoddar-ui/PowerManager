export type UserRole = "administrator" | "user";

export type UserResponse = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
};

export type BootstrapStatus = {
  setup_required: boolean;
};

export type BootstrapRequest = {
  setup_token: string;
  name: string;
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type ProfileUpdateRequest = {
  name?: string;
  email?: string;
  current_password?: string;
};

export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
};

export type UserCreateRequest = {
  name: string;
  email: string;
  role: UserRole;
  password: string;
};

export type UserUpdateRequest = {
  name?: string;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
};
