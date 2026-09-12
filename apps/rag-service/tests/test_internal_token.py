from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

QUERY_BODY = {
    "repo_id": "11111111-1111-1111-1111-111111111111",
    "user_id": "22222222-2222-2222-2222-222222222222",
    "question": "onde está o router?",
}


def test_health_answers_without_token():
    assert client.get("/health").status_code == 200


def test_request_without_token_is_refused():
    response = client.post("/query", json=QUERY_BODY)

    assert response.status_code == 401
    assert response.json()["error"] == "missing_internal_token"


def test_request_with_wrong_token_is_refused():
    response = client.post(
        "/query", json=QUERY_BODY, headers={"Authorization": "Bearer outro-token"}
    )

    assert response.status_code == 401
    assert response.json()["error"] == "invalid_internal_token"


def test_index_is_behind_the_token_too():
    response = client.post(
        "/index", json={"repo_url": "https://github.com/a/b", "user_id": QUERY_BODY["user_id"]}
    )

    assert response.status_code == 401
