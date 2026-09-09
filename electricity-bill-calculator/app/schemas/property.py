from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def clean_text(value: str) -> str:
    return value.strip()


class SubmitterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)

    _clean_name = field_validator("name")(clean_text)


class SubmitterResponse(BaseModel):
    id: int
    property_id: int
    name: str
    user_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubmitterAccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int | None = Field(default=None, gt=0)


class PropertyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    place: str = Field(min_length=1, max_length=200)
    unit: str = Field(min_length=1, max_length=120)

    _clean_text = field_validator("name", "place", "unit")(clean_text)


class PropertyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    place: str | None = Field(default=None, min_length=1, max_length=200)
    unit: str | None = Field(default=None, min_length=1, max_length=120)

    _clean_text = field_validator("name", "place", "unit")(clean_text)


class PropertyResponse(BaseModel):
    id: int
    created_by_user_id: int
    name: str
    place: str
    unit: str
    submitters: list[SubmitterResponse]
    submitter_count: int
    created_at: datetime
    updated_at: datetime


class PropertyListResponse(BaseModel):
    items: list[PropertyResponse]
    total: int
    submitter_total: int
