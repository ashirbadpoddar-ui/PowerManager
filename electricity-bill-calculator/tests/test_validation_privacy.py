from fastapi.testclient import TestClient

from app.main import app


def test_login_validation_does_not_echo_password():
    # An invalid email triggers validation without making any database query.
    secret = "test-only-credential-" * 10
    with TestClient(app) as client:
        response = client.post("/api/auth/login", json={"email": "invalid", "password": secret})
    assert response.status_code == 422
    assert secret not in response.text
    assert all("input" not in error and "ctx" not in error for error in response.json()["detail"])
