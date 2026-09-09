import json
from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Electricity Bill Calculator"
    app_version: str = "1.0.0"
    app_env: Literal["development", "test", "staging", "production"] = "development"
    database_url: str
    test_database_url: str | None = None
    bootstrap_token: SecretStr | None = None
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    session_ttl_hours: int = 168
    session_cookie_secure: bool = False
    email_host: str = Field(default="smtp.gmail.com", validation_alias=AliasChoices("MAIL_SERVER", "EMAIL_HOST"))
    email_port: int = Field(default=587, validation_alias=AliasChoices("MAIL_PORT", "EMAIL_PORT"))
    email_username: str | None = Field(default=None, validation_alias=AliasChoices("MAIL_USERNAME", "EMAIL_USERNAME"))
    email_password: SecretStr | None = Field(default=None, validation_alias=AliasChoices("MAIL_PASSWORD", "EMAIL_PASSWORD"))
    email_from: str | None = Field(default=None, validation_alias=AliasChoices("MAIL_FROM", "EMAIL_FROM"))
    email_from_name: str = Field(default="PowerManage", validation_alias=AliasChoices("MAIL_FROM_NAME", "EMAIL_FROM_NAME"))
    mail_starttls: bool = Field(default=True, validation_alias=AliasChoices("MAIL_STARTTLS"))
    mail_ssl_tls: bool = Field(default=False, validation_alias=AliasChoices("MAIL_SSL_TLS"))
    rate_limit_enabled: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use the postgresql+psycopg:// dialect")
        return value

    @field_validator("test_database_url")
    @classmethod
    def validate_test_database_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value.startswith("postgresql+psycopg://"):
            raise ValueError("TEST_DATABASE_URL must use the postgresql+psycopg:// dialect")
        return value

    @field_validator("bootstrap_token")
    @classmethod
    def validate_bootstrap_token(cls, value: SecretStr | None) -> SecretStr | None:
        if value is None:
            return None
        token = value.get_secret_value()
        if not token.strip():
            raise ValueError("BOOTSTRAP_TOKEN must not be empty")
        if len(token) > 256:
            raise ValueError("BOOTSTRAP_TOKEN is too long")
        return value

    @field_validator("session_ttl_hours")
    @classmethod
    def validate_session_ttl(cls, value: int) -> int:
        if value <= 0 or value > 720:
            raise ValueError("SESSION_TTL_HOURS must be between 1 and 720 hours")
        return value

    @model_validator(mode="after")
    def validate_deployment_security(self):
        if self.app_env in {"staging", "production"}:
            if not self.session_cookie_secure:
                raise ValueError("SESSION_COOKIE_SECURE must be true outside development")
            if not self.rate_limit_enabled:
                raise ValueError("RATE_LIMIT_ENABLED must be true outside development")
            if self.bootstrap_token is not None and len(self.bootstrap_token.get_secret_value()) < 32:
                raise ValueError("BOOTSTRAP_TOKEN must contain at least 32 characters outside development")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        raw_value = self.cors_origins.strip()
        if raw_value.startswith("["):
            parsed = json.loads(raw_value)
            if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
                raise ValueError("CORS_ORIGINS JSON value must be an array of strings")
            origins = [item.strip().rstrip("/") for item in parsed if item.strip()]
        else:
            origins = [item.strip().rstrip("/") for item in raw_value.split(",") if item.strip()]

        if not origins:
            raise ValueError("CORS_ORIGINS must contain at least one origin")
        if "*" in origins:
            raise ValueError("CORS_ORIGINS cannot contain '*' when credentials are enabled")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
