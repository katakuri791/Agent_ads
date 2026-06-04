"""Diagnostic jetable : pourquoi l'engagement de la page Facebook est bloqué ?
Lit les settings réels en base et interroge Graph directement. N'imprime JAMAIS
le token, seulement les erreurs/permissions renvoyées par Meta."""
import json
import requests
from backend.config import supabase_admin

GRAPH = "https://graph.facebook.com/v21.0"

rows = supabase_admin.table("user_settings").select("*").execute().data or []
print(f"== {len(rows)} user_settings row(s) ==")
for r in rows:
    token = r.get("meta_access_token")
    page_id = r.get("meta_page_id")
    print(f"\nuser_id={r.get('user_id')}  page_id={page_id}  token_set={bool(token)}")
    if not token or not page_id:
        print("  -> token ou page_id manquant, skip")
        continue

    # 1) Quelles permissions le token possède-t-il ?
    try:
        perms = requests.get(f"{GRAPH}/me/permissions", params={"access_token": token}, timeout=20).json()
        granted = [p["permission"] for p in perms.get("data", []) if p.get("status") == "granted"]
        declined = [p["permission"] for p in perms.get("data", []) if p.get("status") != "granted"]
        print("  granted:", granted)
        print("  declined/expired:", declined)
        print("  pages_read_engagement granted?:", "pages_read_engagement" in granted)
    except Exception as e:
        print("  /me/permissions ERROR:", e)

    # 2) Type de token (user vs page) + pages gérées
    try:
        me = requests.get(f"{GRAPH}/me", params={"access_token": token, "fields": "id,name"}, timeout=20).json()
        print("  /me:", me)
        accts = requests.get(f"{GRAPH}/me/accounts", params={"access_token": token, "fields": "id,name,access_token,tasks"}, timeout=20).json()
        pages = accts.get("data", [])
        print(f"  /me/accounts -> {len(pages)} page(s)")
        page_tok = None
        for p in pages:
            match = str(p.get("id")) == str(page_id)
            print(f"    - {p.get('id')} {p.get('name')} tasks={p.get('tasks')} has_page_token={bool(p.get('access_token'))} MATCH={match}")
            if match:
                page_tok = p.get("access_token")
        if "error" in accts:
            print("  /me/accounts error:", accts["error"])
    except Exception as e:
        print("  /me/accounts ERROR:", e)
        page_tok = None

    # 3) Requête posts RICHE (réactions/commentaires/partages) avec user token
    rich = ("message,created_time,full_picture,"
            "reactions.summary(total_count).limit(0),"
            "comments.summary(total_count).limit(0),shares")
    for label, tok in [("user_token", token), ("page_token", page_tok)]:
        if not tok:
            print(f"  posts RICHE [{label}]: pas de token, skip")
            continue
        try:
            resp = requests.get(f"{GRAPH}/{page_id}/posts", params={"access_token": tok, "fields": rich, "limit": 3}, timeout=20)
            data = resp.json()
            if "error" in data:
                print(f"  posts RICHE [{label}] ERROR:", json.dumps(data["error"], ensure_ascii=False))
            else:
                d = data.get("data", [])
                print(f"  posts RICHE [{label}] OK -> {len(d)} post(s)")
                if d:
                    p0 = d[0]
                    print("    sample:", {
                        "reactions": (p0.get("reactions") or {}).get("summary", {}).get("total_count"),
                        "comments": (p0.get("comments") or {}).get("summary", {}).get("total_count"),
                        "shares": (p0.get("shares") or {}).get("count"),
                    })
        except Exception as e:
            print(f"  posts RICHE [{label}] EXC:", e)

    # 4) Requête posts MINIMALE
    try:
        resp = requests.get(f"{GRAPH}/{page_id}/posts", params={"access_token": token, "fields": "message,created_time", "limit": 3}, timeout=20)
        data = resp.json()
        if "error" in data:
            print("  posts MINIMAL ERROR:", json.dumps(data["error"], ensure_ascii=False))
        else:
            print(f"  posts MINIMAL OK -> {len(data.get('data', []))} post(s)")
    except Exception as e:
        print("  posts MINIMAL EXC:", e)
