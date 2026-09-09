from collections.abc import Callable

from fastapi.testclient import TestClient


SIMPLE_BILL = {
    "units": 250,
    "fixed_charge": 100.0,
    "tax_rate": 5.0,
    "slabs": [
        {"min_units": 0, "max_units": 100, "rate_per_unit": 5.0},
        {"min_units": 100, "max_units": 200, "rate_per_unit": 7.5},
        {"min_units": 200, "max_units": None, "rate_per_unit": 10.0},
    ],
}


def test_calculation_requires_authentication_and_csrf(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    assert client.post("/api/electricity/calculate", json=SIMPLE_BILL).status_code == 401

    bootstrap_admin(client)
    assert client.post("/api/electricity/calculate", json=SIMPLE_BILL).status_code == 403

    response = client.post(
        "/api/electricity/calculate",
        headers=csrf_headers(client),
        json=SIMPLE_BILL,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_units"] == 250
    assert body["subtotal"] == 1750.0
    assert body["fixed_charge"] == 0.0
    assert body["tax_amount"] == 0.0
    assert body["total_amount"] == 1750.0
    assert len(body["breakdown"]) == 3


def test_regular_user_can_calculate_after_forced_password_change(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    create_managed_user(client)

    with TestClient(client.app, base_url="http://testserver") as user_client:
        login = user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "TemporaryPassword1!"},
        )
        assert login.status_code == 200
        assert login.json()["must_change_password"] is True

        blocked = user_client.post(
            "/api/electricity/calculate",
            headers=csrf_headers(user_client),
            json=SIMPLE_BILL,
        )
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == "Password change required"

        changed = user_client.post(
            "/api/auth/change-password",
            headers=csrf_headers(user_client),
            json={
                "current_password": "TemporaryPassword1!",
                "new_password": "PermanentPassword2!",
            },
        )
        assert changed.status_code == 200
        assert changed.json()["must_change_password"] is False

        calculated = user_client.post(
            "/api/electricity/calculate",
            headers=csrf_headers(user_client),
            json=SIMPLE_BILL,
        )
        assert calculated.status_code == 200


def test_bill_validation_still_uses_standard_422(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    response = client.post(
        "/api/electricity/calculate",
        headers=csrf_headers(client),
        json={
            "units": 0,
            "slabs": [{"min_units": 0, "max_units": 100, "rate_per_unit": 5.0}],
        },
    )
    assert response.status_code == 422


def test_authenticated_user_can_run_independent_meter_calculation(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    response = client.post(
        "/api/electricity/calculate-detailed",
        headers=csrf_headers(client),
        json={
            "main_meter": {
                "previous_reading": 100,
                "current_reading": 250,
                "rate_per_unit": 10,
            },
            "submitters": [
                {
                    "name": "Unit A",
                    "previous_reading": 10,
                    "current_reading": 50,
                    "rate_per_unit": 11,
                },
                {
                    "name": "Unit B",
                    "previous_reading": 20,
                    "current_reading": 80,
                    "rate_per_unit": 12,
                },
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["main_meter"]["units"] == 150
    assert body["main_meter"]["total_amount"] == 1500.0
    assert body["submitter_total_units"] == 100
    assert body["submitters"][0]["total_amount"] == 440.0
    assert body["submitters"][1]["total_amount"] == 720.0
    assert body["submitter_total_amount"] == 1160.0
