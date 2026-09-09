from collections.abc import Callable

from fastapi.testclient import TestClient


def test_users_api_is_admin_only_and_has_single_prefix(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    _, admin = bootstrap_admin(client)
    created = create_managed_user(client, name="  Managed User  ", email="  USER@EXAMPLE.COM ")
    assert created["name"] == "Managed User"
    assert created["email"] == "user@example.com"
    assert created["must_change_password"] is True
    assert "password" not in created

    listed = client.get("/api/users")
    assert listed.status_code == 200
    assert [user["id"] for user in listed.json()] == [admin["id"], created["id"]]
    assert client.get(f"/api/users/{created['id']}").status_code == 200
    assert client.get("/api/users/api/users").status_code == 404

    duplicate = client.post(
        "/api/users",
        headers=csrf_headers(client),
        json={
            "name": "Duplicate",
            "email": "USER@example.com",
            "password": "AnotherTemporary1!",
            "role": "user",
        },
    )
    assert duplicate.status_code == 409

    with TestClient(client.app, base_url="http://testserver") as user_client:
        assert user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "TemporaryPassword1!"},
        ).status_code == 200
        assert user_client.get("/api/users").status_code == 403
        assert user_client.patch(
            f"/api/users/{admin['id']}",
            headers=csrf_headers(user_client),
            json={"name": "Forbidden"},
        ).status_code == 403


def test_administrator_cannot_demote_or_deactivate_self_or_final_admin(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    _, admin = bootstrap_admin(client)

    self_demote = client.patch(
        f"/api/users/{admin['id']}",
        headers=csrf_headers(client),
        json={"role": "user"},
    )
    assert self_demote.status_code == 403

    self_deactivate = client.patch(
        f"/api/users/{admin['id']}",
        headers=csrf_headers(client),
        json={"is_active": False},
    )
    assert self_deactivate.status_code == 403

    second_admin = create_managed_user(
        client,
        name="Second Admin",
        email="second-admin@example.com",
        role="administrator",
    )
    demoted = client.patch(
        f"/api/users/{second_admin['id']}",
        headers=csrf_headers(client),
        json={"role": "user"},
    )
    assert demoted.status_code == 200
    assert demoted.json()["role"] == "user"


def test_user_update_validation_and_not_found_statuses(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    assert client.get("/api/users/9999").status_code == 404
    assert client.patch(
        "/api/users/9999",
        headers=csrf_headers(client),
        json={},
    ).status_code == 422
    assert client.post(
        "/api/users",
        headers=csrf_headers(client),
        json={
            "name": "Short Password",
            "email": "short@example.com",
            "password": "too-short",
            "role": "user",
        },
    ).status_code == 422
