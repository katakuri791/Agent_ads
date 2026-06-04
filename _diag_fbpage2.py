"""Diag 2 : trouver l'edge + token qui renvoie les posts AVEC engagement."""
import json
import requests
from backend.config import supabase_admin

GRAPH = "https://graph.facebook.com/v21.0"

rows = supabase_admin.table("user_settings").select("*").execute().data or []
row = next((r for r in rows if r.get("meta_access_token") and str(r.get("meta_page_id")) != "123456789"), None)
if not row:
    print("no usable row"); raise SystemExit
token = row["meta_access_token"]
page_id = row["meta_page_id"]
print("page_id:", page_id)

# Résoudre le page token
accts = requests.get(f"{GRAPH}/me/accounts", params={"access_token": token, "fields": "id,access_token"}, timeout=20).json()
page_tok = next((p.get("access_token") for p in accts.get("data", []) if str(p.get("id")) == str(page_id)), None)
print("page token resolved:", bool(page_tok))

rich = ("message,created_time,full_picture,"
        "reactions.summary(total_count).limit(0),"
        "comments.summary(total_count).limit(0),shares")

def try_edge(edge, tok, label, fields):
    try:
        resp = requests.get(f"{GRAPH}/{page_id}/{edge}", params={"access_token": tok, "fields": fields, "limit": 3}, timeout=20)
        data = resp.json()
        if "error" in data:
            print(f"  [{edge} / {label} / {('rich' if fields==rich else 'min')}] ERROR #{data['error'].get('code')}.{data['error'].get('error_subcode')}: {data['error'].get('message')[:90]}")
        else:
            d = data.get("data", [])
            extra = ""
            if d and fields == rich:
                p0 = d[0]
                extra = f"  sample reactions={(p0.get('reactions') or {}).get('summary',{}).get('total_count')} comments={(p0.get('comments') or {}).get('summary',{}).get('total_count')} shares={(p0.get('shares') or {}).get('count')}"
            print(f"  [{edge} / {label} / {('rich' if fields==rich else 'min')}] OK -> {len(d)} post(s){extra}")
    except Exception as e:
        print(f"  [{edge} / {label}] EXC: {e}")

for edge in ("feed", "published_posts", "posts"):
    for label, tok in (("page_tok", page_tok), ("user_tok", token)):
        if not tok:
            continue
        try_edge(edge, tok, label, "message,created_time")
        try_edge(edge, tok, label, rich)

# Page-level read sanity (utilisé par get_page_info)
info = requests.get(f"{GRAPH}/{page_id}", params={"access_token": token, "fields": "name,fan_count,followers_count"}, timeout=20).json()
print("page-info (user_tok):", json.dumps(info, ensure_ascii=False)[:200])
info2 = requests.get(f"{GRAPH}/{page_id}", params={"access_token": page_tok, "fields": "name,fan_count,followers_count"}, timeout=20).json() if page_tok else {}
print("page-info (page_tok):", json.dumps(info2, ensure_ascii=False)[:200])
