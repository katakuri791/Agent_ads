"""Diag 3 : peut-on récupérer l'engagement autrement (insights post, likes/comments) ?"""
import json
import requests
from backend.config import supabase_admin

GRAPH = "https://graph.facebook.com/v21.0"
rows = supabase_admin.table("user_settings").select("*").execute().data or []
row = next((r for r in rows if r.get("meta_access_token") and str(r.get("meta_page_id")) != "123456789"), None)
token = row["meta_access_token"]; page_id = row["meta_page_id"]
accts = requests.get(f"{GRAPH}/me/accounts", params={"access_token": token, "fields": "id,access_token"}, timeout=20).json()
ptok = next((p.get("access_token") for p in accts.get("data", []) if str(p.get("id")) == str(page_id)), None)

def g(path, **params):
    params["access_token"] = ptok
    r = requests.get(f"{GRAPH}/{path}", params=params, timeout=20)
    return r.json()

# 1) récupérer 3 post ids via l'edge qui marche
pp = g(f"{page_id}/published_posts", fields="id,message,created_time", limit=3)
posts = pp.get("data", [])
print("published_posts:", "error" in pp and pp["error"]["message"][:80] or f"{len(posts)} posts")
if not posts:
    raise SystemExit

def err(d):
    return f"ERROR #{d['error'].get('code')}: {d['error'].get('message')[:80]}" if "error" in d else None

for p in posts[:2]:
    pid = p["id"]
    print(f"\npost {pid}  '{(p.get('message') or '')[:30]}'")
    # a) champs individuels sur le post
    for f in ["shares",
              "likes.summary(true)",
              "comments.summary(true)",
              "reactions.summary(total_count)"]:
        d = g(pid, fields=f)
        e = err(d)
        if e:
            print(f"  field {f}: {e}")
        else:
            print(f"  field {f}: OK -> {json.dumps({k: v for k, v in d.items() if k != 'id'}, ensure_ascii=False)[:120]}")
    # b) insights du post
    d = g(f"{pid}/insights", metric="post_impressions,post_reactions_by_type_total,post_clicks")
    e = err(d)
    if e:
        print(f"  insights: {e}")
    else:
        for s in d.get("data", []):
            print(f"  insight {s.get('name')}: {s.get('values')}")
    # c) sous-edges
    for sub in ["likes?summary=true&limit=0", "comments?summary=true&limit=0", "reactions?summary=total_count&limit=0"]:
        d = g(f"{pid}/{sub.split('?')[0]}", **dict(kv.split('=') for kv in sub.split('?')[1].split('&')))
        e = err(d)
        print(f"  /{sub}: {e or 'OK ' + json.dumps(d.get('summary', {}), ensure_ascii=False)}")
