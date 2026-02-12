import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import CallSession
from tests.utils.user import create_random_user
from tests.utils.utils import random_lower_string


def create_random_call_session(db: Session) -> CallSession:
    user = create_random_user(db)
    call = CallSession(
        owner_id=user.id,
        persona="friendly_prospect",
        scenario="Test scenario",
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    return call


def test_create_call_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"persona": "friendly_prospect", "scenario": "Test pitch"}
    response = client.post(
        f"{settings.API_V1_STR}/calls/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["persona"] == "friendly_prospect"
    assert content["scenario"] == "Test pitch"
    assert content["status"] == "active"
    assert "id" in content
    assert "owner_id" in content


def test_list_call_sessions(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # Create a session first
    client.post(
        f"{settings.API_V1_STR}/calls/",
        headers=superuser_token_headers,
        json={"persona": "skeptical_buyer"},
    )
    response = client.get(
        f"{settings.API_V1_STR}/calls/",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert "data" in content
    assert "count" in content
    assert content["count"] >= 1


def test_get_call_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # Create
    create_res = client.post(
        f"{settings.API_V1_STR}/calls/",
        headers=superuser_token_headers,
        json={"persona": "friendly_prospect"},
    )
    call_id = create_res.json()["id"]

    # Get
    response = client.get(
        f"{settings.API_V1_STR}/calls/{call_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == call_id


def test_get_call_session_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/calls/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


def test_complete_call_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # Create
    create_res = client.post(
        f"{settings.API_V1_STR}/calls/",
        headers=superuser_token_headers,
        json={"persona": "friendly_prospect"},
    )
    call_id = create_res.json()["id"]

    # Complete
    complete_data = {
        "duration_seconds": 120.0,
        "transcript": {
            "messages": [
                {"role": "user", "text": "Hello, I wanted to discuss our product.", "timestamp": 1000},
                {"role": "assistant", "text": "Sure, tell me more.", "timestamp": 2000},
            ]
        },
        "emotion_data": {
            "prosody_scores": [
                {
                    "role": "user",
                    "emotions": {"Confidence": 0.8, "Enthusiasm": 0.6},
                    "timestamp": 1000,
                }
            ]
        },
        "hume_chat_id": "test-chat-123",
    }
    response = client.post(
        f"{settings.API_V1_STR}/calls/{call_id}/complete",
        headers=superuser_token_headers,
        json=complete_data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["status"] == "completed"
    assert content["duration_seconds"] == 120.0


def test_get_report_not_ready(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # Create a session that hasn't been analyzed
    create_res = client.post(
        f"{settings.API_V1_STR}/calls/",
        headers=superuser_token_headers,
        json={"persona": "friendly_prospect"},
    )
    call_id = create_res.json()["id"]

    response = client.get(
        f"{settings.API_V1_STR}/calls/{call_id}/report",
        headers=superuser_token_headers,
    )
    assert response.status_code == 400


def test_delete_call_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # Create
    create_res = client.post(
        f"{settings.API_V1_STR}/calls/",
        headers=superuser_token_headers,
        json={"persona": "friendly_prospect"},
    )
    call_id = create_res.json()["id"]

    # Delete
    response = client.delete(
        f"{settings.API_V1_STR}/calls/{call_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Call session deleted successfully"

    # Verify deleted
    response = client.get(
        f"{settings.API_V1_STR}/calls/{call_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


def test_ownership_enforcement(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    # Create a call session owned by a different user
    call = create_random_call_session(db)

    # Try to access it as normal user
    response = client.get(
        f"{settings.API_V1_STR}/calls/{call.id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Not enough permissions"


def test_list_personas(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/calls/personas/list",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    personas = response.json()
    assert len(personas) >= 3
    assert all("id" in p and "name" in p and "description" in p for p in personas)
