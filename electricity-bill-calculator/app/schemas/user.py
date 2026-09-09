from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

UserRole = Literal["administrator", "user"]


def _trim_name(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


def _normalize_email(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


class NamedEmailModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    email: EmailStr

    _normalize_name = field_validator("name", mode="before")(_trim_name)
    _normalize_email_value = field_validator("email", mode="before")(_normalize_email)


class BootstrapRequest(NamedEmailModel):
    setup_token: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    _normalize_email_value = field_validator("email", mode="before")(_normalize_email)


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    current_password: str | None = Field(default=None, min_length=1, max_length=128)

    _normalize_name = field_validator("name", mode="before")(_trim_name)
    _normalize_email_value = field_validator("email", mode="before")(_normalize_email)

    @model_validator(mode="after")
    def require_profile_change(self):
        if self.name is None and self.email is None:
            raise ValueError("At least one of name or email must be provided")
        return self


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class UserCreate(NamedEmailModel):
    role: UserRole = "user"
    password: str = Field(min_length=12, max_length=128)


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None

    _normalize_name = field_validator("name", mode="before")(_trim_name)
    _normalize_email_value = field_validator("email", mode="before")(_normalize_email)

    @model_validator(mode="after")
    def require_change(self):
        if all(value is None for value in (self.name, self.email, self.role, self.is_active)):
            raise ValueError("At least one field must be provided")
        return self


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=12, max_length=128)


class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    must_change_password: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BootstrapStatusResponse(BaseModel):
    setup_required: bool
