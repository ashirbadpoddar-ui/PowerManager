from typing import Callable

from fastapi.testclient import TestClient


def create_property(client: TestClient, headers: dict[str, str], name: str = "Sunshine Apartments") -> int:
    response = client.post("/api/properties", headers=headers, json={"name": name, "place": "Pune", "unit": "A-101"})
    assert response.status_code == 201
    return response.json()["id"]


def test_meter_readings_support_crud_and_ownership(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
    create_managed_user: Callable,
) -> None:
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_id = create_property(client, headers)

    created = client.post("/api/meter-readings", headers=headers, json={
        "property_id": property_id,
        "meter_name": "Main Meter",
        "previous_reading": 120.5,
        "current_reading": 145.75,
        "reading_date": "2026-08-31",
    })
    assert created.status_code == 201
    assert created.json()["units_used"] == 25.25
    reading_id = created.json()["id"]

    listing = client.get("/api/meter-readings")
    assert listing.status_code == 200
    assert listing.json()["items"][0]["property_name"] == "Sunshine Apartments"

    updated = client.patch(f"/api/meter-readings/{reading_id}", headers=headers, json={"current_reading": 150})
    assert updated.status_code == 200
    assert updated.json()["units_used"] == 29.5

    create_managed_user(client)
    with TestClient(client.app, base_url="http://testserver") as user_client:
        assert user_client.post("/api/auth/login", json={"email": "user@example.com", "password": "TemporaryPassword1!"}).status_code == 200
        assert user_client.post("/api/auth/change-password", headers=csrf_headers(user_client), json={"current_password": "TemporaryPassword1!", "new_password": "PermanentPassword2!"}).status_code == 200
        assert user_client.get("/api/meter-readings").json() == {"items": [], "total": 0}
        assert user_client.delete(f"/api/meter-readings/{reading_id}", headers=csrf_headers(user_client)).status_code == 403

    assert client.delete(f"/api/meter-readings/{reading_id}", headers=headers).status_code == 204
    assert client.get("/api/meter-readings").json() == {"items": [], "total": 0}


def test_meter_readings_validate_duplicates_and_reading_order(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_id = create_property(client, headers)
    payload = {"property_id": property_id, "meter_name": "Main Meter", "previous_reading": 10, "current_reading": 20, "reading_date": "2026-08-31"}
    assert client.post("/api/meter-readings", headers=headers, json=payload).status_code == 201
    assert client.post("/api/meter-readings", headers=headers, json=payload).status_code == 409
    invalid = {**payload, "meter_name": "Sub Meter", "current_reading": 5}
    assert client.post("/api/meter-readings", headers=headers, json=invalid).status_code == 422


def test_submitter_meter_history_is_private_and_legacy_readings_stay_admin_only(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
    create_managed_user: Callable,
) -> None:
    bootstrap_admin(client)
    headers = csrf_headers(client)
    first_account = create_managed_user(client, name="User A", email="a@example.com")
    second_account = create_managed_user(client, name="User B", email="b@example.com")
    property_id = create_property(client, headers)

    def submitter(name: str, user_id: int) -> int:
        created = client.post(f"/api/properties/{property_id}/submitters", headers=headers, json={"name": name})
        assert created.status_code == 201
        submitter_id = created.json()["id"]
        linked = client.patch(
            f"/api/properties/{property_id}/submitters/{submitter_id}/account",
            headers=headers,
            json={"user_id": user_id},
        )
        assert linked.status_code == 200
        return submitter_id

    first_submitter = submitter("User A", first_account["id"])
    second_submitter = submitter("User B", second_account["id"])
    common = {"property_id": property_id, "meter_name": "Main Meter", "reading_date": "2026-08-31"}
    # NULL keeps legacy/common history visible to administrators only.
    assert client.post("/api/meter-readings", headers=headers, json={**common, "previous_reading": 0, "current_reading": 999}).status_code == 201
    assert client.post("/api/meter-readings", headers=headers, json={**common, "submitter_id": first_submitter, "previous_reading": 10, "current_reading": 25}).status_code == 201
    assert client.post("/api/meter-readings", headers=headers, json={**common, "submitter_id": second_submitter, "previous_reading": 40, "current_reading": 70}).status_code == 201

    with TestClient(client.app, base_url="http://testserver") as first_client:
        assert first_client.post("/api/auth/login", json={"email": "a@example.com", "password": "TemporaryPassword1!"}).status_code == 200
        assert first_client.post("/api/auth/change-password", headers=csrf_headers(first_client), json={"current_password": "TemporaryPassword1!", "new_password": "PermanentPassword2!"}).status_code == 200
        readings = first_client.get("/api/me/meter-readings")
        assert readings.status_code == 200
        assert [item["current_reading"] for item in readings.json()] == [25]
        # The request has no resource identifier, so a user cannot submit a
        # reading against another submitter's meter.
        submitted = first_client.post("/api/me/meter-readings", headers=csrf_headers(first_client), json={"current_reading": 30, "reading_date": "2026-09-01"})
        assert submitted.status_code == 201

    admin_readings = client.get("/api/meter-readings").json()["items"]
    user_a_reading = next(item for item in admin_readings if item["current_reading"] == 30)
    assert user_a_reading["submitter_id"] == first_submitter

    with TestClient(client.app, base_url="http://testserver") as second_client:
        assert second_client.post("/api/auth/login", json={"email": "b@example.com", "password": "TemporaryPassword1!"}).status_code == 200
        assert second_client.post("/api/auth/change-password", headers=csrf_headers(second_client), json={"current_password": "TemporaryPassword1!", "new_password": "PermanentPassword2!"}).status_code == 200
        readings = second_client.get("/api/me/meter-readings")
        assert readings.status_code == 200
        assert [item["current_reading"] for item in readings.json()] == [70]

    wrong_property = client.post("/api/meter-readings", headers=headers, json={**common, "submitter_id": 99999, "previous_reading": 0, "current_reading": 1})
    assert wrong_property.status_code == 422
