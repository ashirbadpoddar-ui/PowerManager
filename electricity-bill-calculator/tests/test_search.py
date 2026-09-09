from fastapi.testclient import TestClient

from app.models.property import Property
from app.models.user import User
from tests.conftest import SessionLocal


def make_records(client, headers, account, name):
    response = client.post("/api/properties", headers=headers, json={"name": f"Pine {name}", "place": "North Wing", "unit": f"Room {name}"})
    assert response.status_code == 201
    property_id = response.json()["id"]
    response = client.post(f"/api/properties/{property_id}/submitters", headers=headers, json={"name": f"Pine {name}"})
    assert response.status_code == 201
    submitter_id = response.json()["id"]
    assert client.patch(f"/api/properties/{property_id}/submitters/{submitter_id}/account", headers=headers, json={"user_id": account["id"]}).status_code == 200
    response = client.post("/api/bills/submitter", headers=headers, json={
        "submitter_id": submitter_id, "previous_reading": 0, "current_reading": 20,
        "rate_mode": "manual", "rate_per_unit": 7,
        "metadata": {"period_start": "2099-01-01", "period_end": "2099-01-31", "due_date": "2099-02-15"},
    })
    assert response.status_code == 201, response.text
    return property_id, submitter_id, response.json()


def test_search_scopes_matches_and_minimal_fields(client, bootstrap_admin, create_managed_user, csrf_headers):
    _, admin = bootstrap_admin(client)
    alpha = create_managed_user(client, name="Alpha Tenant", email="alpha@example.com")
    beta = create_managed_user(client, name="Beta Tenant", email="beta@example.com")
    other_admin = create_managed_user(client, name="Other Admin", email="other@example.com", role="administrator")
    own_property, own_submitter, own_bill = make_records(client, csrf_headers(client), alpha, "Alpha")
    # Accounts created by administrators normally require an initial password change.
    with SessionLocal() as db:
        for account in (alpha, beta, other_admin):
            db.get(User, account["id"]).must_change_password = False
        db.commit()
    with TestClient(client.app, base_url="http://testserver") as other:
        assert other.post("/api/auth/login", json={"email": "other@example.com", "password": "TemporaryPassword1!"}).status_code == 200
        other_property, other_submitter, other_bill = make_records(other, csrf_headers(other), beta, "Beta")
        results = other.get("/api/search", params={"q": "PINE"}).json()["items"]
        assert {(r["kind"], r["id"]) for r in results} == {("property", other_property), ("submitter", other_submitter), ("invoice", other_bill["id"])}

    response = client.get("/api/search", params={"q": "  pIn  "})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    results = response.json()["items"]
    assert {(r["kind"], r["id"]) for r in results} == {("property", own_property), ("submitter", own_submitter), ("invoice", own_bill["id"])}
    assert all(set(r) == {"kind", "id", "title", "secondary", "property_id"} for r in results)
    assert client.get("/api/search", params={"q": "ALPHA@EX"}).json()["items"][0]["id"] == own_submitter
    assert any(r["kind"] == "property" for r in client.get("/api/search?q=north").json()["items"])
    assert client.get("/api/search", params={"q": own_bill["bill_number"].lower()}).json()["items"][0]["id"] == own_bill["id"]
    for q in ("", " ", " a ", "no-matches", "%_", "' OR 1=1 --"):
        assert client.get("/api/search", params={"q": q}).json() == {"items": []}
    assert client.get("/api/search", params={"q": "a" * 101}).status_code == 422

    with TestClient(client.app, base_url="http://testserver") as tenant:
        assert tenant.get("/api/search?q=pine").status_code == 401
        assert tenant.post("/api/auth/login", json={"email": "alpha@example.com", "password": "TemporaryPassword1!"}).status_code == 200
        results = tenant.get("/api/search?q=pine").json()["items"]
        assert {(r["kind"], r["id"]) for r in results} == {("property", own_property), ("submitter", own_submitter), ("invoice", own_bill["id"])}
        assert tenant.get("/api/search?q=beta").json() == {"items": []}
        assert tenant.get("/api/search", params={"q": other_bill["bill_number"]}).json() == {"items": []}
        assert client.post(f"/api/bills/{own_bill['id']}/void", headers=csrf_headers(client)).status_code == 200
        assert tenant.get("/api/search", params={"q": own_bill["bill_number"]}).json() == {"items": []}
        with SessionLocal() as db:
            db.get(User, alpha["id"]).is_active = False
            db.commit()
        assert tenant.get("/api/search?q=pine").status_code == 401

    with SessionLocal() as db:
        db.add_all([Property(created_by_user_id=admin["id"], name=f"Limit {i}", place="Here", unit="Unit") for i in range(9)])
        db.commit()
    assert len(client.get("/api/search?q=limit").json()["items"]) == 5
