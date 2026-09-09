from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.models.tariff import Tariff
from tests.conftest import SessionLocal


UPDATED_TARIFF = {
    "slabs": [
        {"min_units": 0, "max_units": 100, "rate_per_unit": 6.0},
        {"min_units": 100, "max_units": 200, "rate_per_unit": 8.5},
        {"min_units": 200, "max_units": None, "rate_per_unit": 11.0},
    ]
}

METADATA = {
    "recipient_label": "Apartment A",
    "property_label": "Sunshine Apartments",
    "unit_label": "A-101",
    "period_start": "2099-01-01",
    "period_end": "2099-01-31",
    "due_date": "2099-02-15",
}


def test_tariff_reads_are_authenticated_and_writes_are_administrator_only(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    assert client.get("/api/electricity/settings").status_code == 200

    update = client.put(
        "/api/electricity/settings",
        headers=csrf_headers(client),
        json=UPDATED_TARIFF,
    )
    assert update.status_code == 200
    assert update.json() == UPDATED_TARIFF

    reset = client.post(
        "/api/electricity/reset",
        headers=csrf_headers(client),
    )
    assert reset.status_code == 200
    assert reset.json()["slabs"][0]["rate_per_unit"] == 5.0

    with SessionLocal() as database:
        assert database.scalar(select(func.count(Tariff.id))) == 3
        assert database.scalar(
            select(func.count(Tariff.id)).where(Tariff.is_active.is_(True))
        ) == 1

    create_managed_user(client)
    with TestClient(client.app, base_url="http://testserver") as user_client:
        assert user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "TemporaryPassword1!"},
        ).status_code == 200
        assert user_client.post(
            "/api/auth/change-password",
            headers=csrf_headers(user_client),
            json={
                "current_password": "TemporaryPassword1!",
                "new_password": "PermanentPassword2!",
            },
        ).status_code == 200
        assert user_client.get("/api/electricity/settings").status_code == 200
        assert user_client.put(
            "/api/electricity/settings",
            headers=csrf_headers(user_client),
            json=UPDATED_TARIFF,
        ).status_code == 403
        assert user_client.post(
            "/api/electricity/reset-workspace",
            headers=csrf_headers(user_client),
        ).status_code == 403


def test_tariff_routes_reject_anonymous_requests(client: TestClient) -> None:
    assert client.get("/api/electricity/settings").status_code == 401
    assert client.put("/api/electricity/settings", json=UPDATED_TARIFF).status_code == 401
    assert client.post("/api/electricity/reset").status_code == 401
    assert client.post("/api/electricity/reset-workspace").status_code == 401


def test_workspace_reset_clears_business_records_and_keeps_administrator_session(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_response = client.post(
        "/api/properties",
        headers=headers,
        json={"name": "Sunshine Apartments", "place": "Pune", "unit": "A-101"},
    )
    assert property_response.status_code == 201
    property_id = property_response.json()["id"]
    assert client.post(
        f"/api/properties/{property_id}/submitters",
        headers=headers,
        json={"name": "Priya Menon"},
    ).status_code == 201
    assert client.post(
        "/api/meter-readings",
        headers=headers,
        json={
            "property_id": property_id,
            "meter_name": "Main meter",
            "previous_reading": 100,
            "current_reading": 150,
            "reading_date": "2099-01-31",
        },
    ).status_code == 201
    assert client.post(
        "/api/bills/detailed",
        headers=headers,
        json={
            "calculation": {
                "main_meter": {"previous_reading": 0, "current_reading": 20, "rate_per_unit": 5},
                "submitters": [],
            },
            "metadata": {
                "property_label": "Sunshine Apartments",
                "unit_label": "A-101",
                "period_start": "2099-01-01",
                "period_end": "2099-01-31",
                "due_date": "2099-02-15",
            },
        },
    ).status_code == 201

    reset = client.post("/api/electricity/reset-workspace", headers=headers)
    assert reset.status_code == 200, reset.text
    assert reset.json() == {
        "properties_cleared": 1,
        "submitters_cleared": 1,
        "meter_readings_cleared": 1,
        "bills_cleared": 1,
        "billing_runs_cleared": 1,
        "tariff_defaults_restored": True,
    }
    assert client.get("/api/properties").json() == {"items": [], "total": 0, "submitter_total": 0}
    assert client.get("/api/meter-readings").json() == {"items": [], "total": 0}
    assert client.get("/api/bills").json() == {"items": [], "total": 0}
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/electricity/settings").json()["slabs"][0]["rate_per_unit"] == 5.0
