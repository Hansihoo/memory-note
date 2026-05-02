import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))


@pytest.fixture()
def client(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    os.environ["DATABASE_URL"] = database_url

    from app.database import Base, configure_database
    from app.main import app

    engine = configure_database(database_url)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers(client):
    response = client.post("/auth/register", json={"username": "theo", "password": "password123"})
    assert response.status_code == 201
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}
