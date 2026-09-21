"""Tests pour la route et l'endpoint Creative Ideas."""

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_creative_ideas_route_registered(client):
    response = client.get("/creative-ideas?limit=1")
    # L'endpoint répond 200 avec la structure NocoDB attendue
    assert response.status_code == 200
    data = response.json()
    assert "list" in data
    assert isinstance(data["list"], list)
    if data["list"]:
        item = data["list"][0]
        assert "Id" in item
        assert "Generated idea" in item
