from typing import Callable

from fastapi.testclient import TestClient


def test_properties_and_submitters_are_persisted_and_counted(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    headers = csrf_headers(client)
    created = client.post(
        "/api/properties",
        headers=headers,
        json={"name": "Sunshine Apartments", "place": "Pune", "unit": "A-101"},
    )
    assert created.status_code == 201
    property_id = created.json()["id"]

    submitter = client.post(
        f"/api/properties/{property_id}/submitters",
        headers=headers,
        json={"name": "Priya Menon"},
    )
    assert submitter.status_code == 201

    listing = client.get("/api/properties")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["submitter_total"] == 1
    assert listing.json()["items"][0]["submitter_count"] == 1

    deleted = client.delete(f"/api/properties/{property_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/api/properties").json() == {"items": [], "total": 0, "submitter_total": 0}
