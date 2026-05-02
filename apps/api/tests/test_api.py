def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_register_login_me_logout(client):
    registered = client.post("/auth/register", json={"username": "Learner", "password": "password123"})
    assert registered.status_code == 201
    token = registered.json()["token"]
    assert registered.json()["tokenType"] == "bearer"
    assert registered.json()["user"]["username"] == "learner"

    me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "learner"

    login = client.post("/auth/login", json={"username": "learner", "password": "password123"})
    assert login.status_code == 200
    login_token = login.json()["token"]
    assert login_token != token

    logout = client.post("/auth/logout", headers={"Authorization": f"Bearer {login_token}"})
    assert logout.status_code == 200
    assert client.get("/me", headers={"Authorization": f"Bearer {login_token}"}).status_code == 401


def test_wordbooks_are_user_scoped(client, auth_headers):
    created = client.post("/wordbooks", json={"name": "Korean", "description": "daily"}, headers=auth_headers)
    assert created.status_code == 201
    assert created.json()["wordCount"] == 0

    other_user = client.post("/auth/register", json={"username": "other", "password": "password123"}).json()["token"]
    other_headers = {"Authorization": f"Bearer {other_user}"}

    assert client.get(f"/wordbooks/{created.json()['id']}", headers=other_headers).status_code == 404
    assert client.get("/wordbooks", headers=other_headers).json() == []


def test_words_crud_and_batch_upsert(client, auth_headers):
    wordbook_id = client.post("/wordbooks", json={"name": "English"}, headers=auth_headers).json()["id"]

    created = client.post(
        f"/wordbooks/{wordbook_id}/words",
        json={"key": "apple", "value": "fruit"},
        headers=auth_headers,
    )
    assert created.status_code == 201
    word_id = created.json()["id"]
    assert created.json()["lastViewedAt"] is None

    patched = client.patch(f"/words/{word_id}", json={"value": "fruit noun"}, headers=auth_headers)
    assert patched.status_code == 200
    assert patched.json()["value"] == "fruit noun"

    batch = client.post(
        f"/wordbooks/{wordbook_id}/words/batch",
        json={"words": [{"key": "apple", "value": "fruit"}, {"key": "book", "value": "reading item"}]},
        headers=auth_headers,
    )
    assert batch.status_code == 200
    assert len(batch.json()["words"]) == 2

    listed = client.get(f"/wordbooks/{wordbook_id}/words", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 2

    deleted = client.delete(f"/words/{word_id}", headers=auth_headers)
    assert deleted.status_code == 204


def test_study_updates_progress_and_profile(client, auth_headers):
    wordbook = client.post("/wordbooks", json={"name": "JLPT"}, headers=auth_headers).json()
    word = client.post(
        f"/wordbooks/{wordbook['id']}/words",
        json={"key": "memory", "value": "remembered information"},
        headers=auth_headers,
    ).json()

    studied = client.post(f"/study/words/{word['id']}", json={"result": "known"}, headers=auth_headers)
    assert studied.status_code == 200
    body = studied.json()
    assert body["result"] == "known"
    assert body["word"]["lastViewedAt"] is not None

    profile = client.get("/profile/summary", headers=auth_headers)
    assert profile.status_code == 200
    summary = profile.json()
    assert summary["cumulativeLearningDays"] == 1
    assert summary["todayStudiedCount"] == 1
    assert summary["recentWordbooks"][0]["wordbookId"] == wordbook["id"]
    assert summary["recentWordbooks"][0]["studiedCount"] == 1
    assert summary["recentWordbooks"][0]["knownCount"] == 1
    assert summary["recentWordbooks"][0]["unknownCount"] == 0
