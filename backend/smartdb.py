"""Adaptateur SmartDB (API REST tybotflow) compatible avec l'API du client Supabase.

Le client a livré une base **SmartDB** (NocoDB derrière `https://api.tybotflow.com`)
au lieu de Supabase. SmartDB expose un CRUD REST sur les enregistrements, mais **pas
de fonctions SQL / d'agrégation**. Ce module fournit `SmartDBClient`, qui imite la
surface de l'API chaînée du client Supabase (`.table().select().eq()...execute()`)
pour que `db.py` / `auth.py` / `notifications.py` restent quasi inchangés.

Réalité SmartDB validée en live (sonde jetable) :
- Les enregistrements reviennent avec `id` (entier auto-incrémenté, minuscule),
  `created_at` et `updated_at` en vraies colonnes ISO → **aucun mapping de noms**.
  (NocoDB ajoute aussi des doublons système `Created At` / `Updated At` qu'on retire.)
- `POST` renvoie la/les ligne(s) créée(s) avec leur `id`.
- `PATCH` et `DELETE` s'adressent **uniquement par la PK `id`** (corps `{"id":N,...}`
  / `[N]`). Les écritures filtrées par colonne non-PK deviennent donc un
  **read-then-write** : on lit les `id` qui matchent, puis on PATCH/DELETE par `id`.
- La liste est paginée (`pageSize` 25 par défaut) → pagination automatique ici.
- Filtre NocoDB : `where=(col,op,val)~and(col,op,val)`, opérateurs
  eq/neq/gt/lt/gte/lte/like/in/is/isnot. Tri : `sort=col` / `sort=-col`.

Les fonctions d'agrégation (`.rpc(...)`) sont routées vers `backend/aggregations.py`.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger("metainsight")

# Mapping table (title) -> tableId NocoDB, base « Ads Management » (pmrlw1xde7g9e).
# Récupéré via GET /smart-db/bases/{baseId}/tables. Si le client recrée une table,
# mettre à jour l'id ici (ou charger dynamiquement au démarrage).
TABLE_IDS: dict[str, str] = {
    "users": "ma5e60227fc53c938",
    "user_settings": "m1753998c77687358",
    "meta_accounts": "ma494ae548cd1d2ce",
    "ads": "m5e53d2536801be5f",
    "scheduled_posts": "m9d29007431407952",
    "fb_sync_state": "mb1ccb90eb66ff5b8",
    "fb_insights_daily": "m49d7e6e84a7b3131",
    "conversations": "mca6ff21547b83071",
    "campaigns": "me87d568497a69c4d",
    "notifications": "m5461d5d41ea3388c",
    "messages": "m1a353c47e2c08443",
    "fb_campaigns": "mf90157ade36eb4f3",
    "fb_insights_platform_daily": "m0a83c4f87fb55cf6",
    "tool_logs": "m61b0cb25ff22debc",
    "ad_sets": "mbaa781a03a63ceaa",
    "refresh_tokens": "mdb4bfe3f3b5168a6",
    "fb_ads": "m4570f83defcb946b",
    "fb_insights_breakdowns": "m32116acb4a7a24dd",
    "fb_adsets": "m7147a6b64502fede",
}

# Doublons système NocoDB à retirer des lignes renvoyées (les vraies colonnes
# `created_at` / `updated_at` existent déjà en minuscules).
_SYSTEM_DUP_KEYS = ("Created At", "Updated At")

# Tables de cache dont la PK logique EST l'identifiant Graph Meta (TEXT). NocoDB
# détourne `id` pour sa PK entière auto → on porte l'id Meta dans la colonne
# dédiée `meta_id`, et l'adaptateur expose ce `meta_id` comme `id` côté app.
# La PK entière NocoDB est conservée sous `_nocodb_id` pour adresser PATCH/DELETE.
_BIZ_ID_TABLES = frozenset({"fb_campaigns", "fb_adsets", "fb_ads"})
_BIZ_ID_COL = "meta_id"

_PAGE_SIZE = 200  # taille de page pour la pagination interne


class SmartDBError(RuntimeError):
    """Erreur renvoyée par l'API SmartDB (statut HTTP non-2xx)."""


class _Result:
    """Reproduit l'objet renvoyé par `.execute()` du client Supabase."""

    __slots__ = ("data", "count")

    def __init__(self, data: list[dict], count: Optional[int] = None):
        self.data = data
        self.count = count


def _map_col(table: str, col: str) -> str:
    """Traduit une colonne app → colonne NocoDB (id → meta_id pour les tables Graph)."""
    if table in _BIZ_ID_TABLES and col == "id":
        return _BIZ_ID_COL
    return col


def _transform_out(table: str, row: dict) -> dict:
    """Nettoie une ligne renvoyée et normalise l'`id`.

    NocoDB expose une PK entière auto. L'app attend des `id` texte (modèles
    Pydantic `id: str`, ids opaques). On conserve donc la PK entière sous
    `_nocodb_id` (pour adresser PATCH/DELETE) et on expose un `id` texte :
    - tables Graph (fb_campaigns/…): l'`id` = la colonne `meta_id` (id Meta) ;
    - autres tables: l'`id` = la PK entière convertie en chaîne.
    """
    if not isinstance(row, dict):
        return row
    for k in _SYSTEM_DUP_KEYS:
        row.pop(k, None)
    if table in _BIZ_ID_TABLES:
        row["_nocodb_id"] = row.get("id")
        row["id"] = row.get(_BIZ_ID_COL)
    elif row.get("id") is not None:
        row["_nocodb_id"] = row["id"]
        row["id"] = str(row["id"])
    return row


def _transform_in(table: str, payload: Any) -> Any:
    """Renomme `id` → `meta_id` dans les payloads d'écriture des tables Graph."""
    if table not in _BIZ_ID_TABLES:
        return payload

    def fix(d: Any) -> Any:
        if isinstance(d, dict) and "id" in d:
            d = {**d}
            d[_BIZ_ID_COL] = d.pop("id")
        return d

    if isinstance(payload, list):
        return [fix(x) for x in payload]
    return fix(payload)


def _row_pk(row: dict) -> Any:
    """PK entière NocoDB d'une ligne (pour adresser PATCH/DELETE)."""
    return row.get("_nocodb_id", row.get("id"))


def _fmt(val: Any) -> str:
    """Formate une valeur pour la clause `where` NocoDB."""
    if isinstance(val, bool):
        return "true" if val else "false"
    return str(val)


class _Query:
    """Constructeur de requête chaînable (mime l'API du client Supabase)."""

    def __init__(self, client: "SmartDBClient", table: str):
        self._client = client
        self._table = table
        self._op = "select"  # select | insert | update | delete | upsert
        self._filters: list[tuple[str, str, Any]] = []
        self._orders: list[tuple[str, bool]] = []
        self._limit: Optional[int] = None
        self._count_mode: Optional[str] = None
        self._payload: Any = None
        self._on_conflict: Optional[str] = None
        self._negate_next = False

    # ── filtres ──────────────────────────────────────────────────────────────
    def _add(self, col: str, op: str, val: Any) -> "_Query":
        self._filters.append((col, op, val))
        return self

    def eq(self, col: str, val: Any) -> "_Query":
        return self._add(col, "eq", val)

    def neq(self, col: str, val: Any) -> "_Query":
        return self._add(col, "neq", val)

    def gt(self, col: str, val: Any) -> "_Query":
        return self._add(col, "gt", val)

    def gte(self, col: str, val: Any) -> "_Query":
        return self._add(col, "gte", val)

    def lt(self, col: str, val: Any) -> "_Query":
        return self._add(col, "lt", val)

    def lte(self, col: str, val: Any) -> "_Query":
        return self._add(col, "lte", val)

    def like(self, col: str, val: Any) -> "_Query":
        return self._add(col, "like", val)

    def in_(self, col: str, vals: list) -> "_Query":
        # NocoDB : (col,in,v1,v2,...)
        return self._add(col, "in", list(vals))

    @property
    def not_(self) -> "_Query":
        """Modifieur : la prochaine condition `is_` devient `isnot`."""
        self._negate_next = True
        return self

    def is_(self, col: str, val: Any) -> "_Query":
        op = "isnot" if self._negate_next else "is"
        self._negate_next = False
        # val est typiquement la chaîne "null"
        return self._add(col, op, val)

    # ── modes ────────────────────────────────────────────────────────────────
    def select(self, *_cols: str, count: Optional[str] = None) -> "_Query":
        # La projection de champs est ignorée (on récupère toutes les colonnes) :
        # le code appelant ne lit que les clés dont il a besoin. `count="exact"`
        # active le comptage via l'endpoint /records/count.
        self._op = "select"
        self._count_mode = count
        return self

    def insert(self, payload: Any) -> "_Query":
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, patch: dict) -> "_Query":
        self._op = "update"
        self._payload = patch
        return self

    def delete(self) -> "_Query":
        self._op = "delete"
        return self

    def upsert(self, rows: Any, on_conflict: Optional[str] = None) -> "_Query":
        self._op = "upsert"
        self._payload = rows
        self._on_conflict = on_conflict
        return self

    def order(self, col: str, desc: bool = False) -> "_Query":
        self._orders.append((col, desc))
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def execute(self) -> _Result:
        return self._client._execute(self)


class _RpcQuery:
    """Route un appel `.rpc(name, params)` vers les agrégations Python."""

    def __init__(self, client: "SmartDBClient", name: str, params: dict):
        self._client = client
        self._name = name
        self._params = params or {}

    def execute(self) -> _Result:
        # Import tardif pour éviter un cycle (aggregations importe le client).
        from . import aggregations

        fn = getattr(aggregations, self._name, None)
        if fn is None:
            raise SmartDBError(f"Fonction d'agrégation inconnue: {self._name}")
        rows = fn(self._client, self._params)
        return _Result(rows if isinstance(rows, list) else [rows])


class SmartDBClient:
    """Client SmartDB imitant l'interface du client Supabase (admin/service).

    Instancié une fois dans `config.py`. La construction ne fait **aucun** appel
    réseau (sûr à l'import). Les identifiants manquants lèvent une erreur claire
    seulement au premier appel réel.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        base_id: Optional[str] = None,
        table_ids: Optional[dict[str, str]] = None,
        timeout: float = 30.0,
    ):
        self._base = (base_url or "").rstrip("/")
        self._api_key = api_key or ""
        self._base_id = base_id
        self._table_ids = table_ids or TABLE_IDS
        self._http = httpx.Client(
            timeout=timeout,
            headers={"Authorization": self._api_key, "Content-Type": "application/json"},
        )

    # ── API publique (mime Supabase) ─────────────────────────────────────────
    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rpc(self, name: str, params: Optional[dict] = None) -> _RpcQuery:
        return _RpcQuery(self, name, params or {})

    # ── plomberie HTTP ───────────────────────────────────────────────────────
    def _table_id(self, table: str) -> str:
        tid = self._table_ids.get(table)
        if not tid:
            raise SmartDBError(f"Table SmartDB inconnue: {table!r}")
        return tid

    def _records_url(self, table: str) -> str:
        if not self._base or not self._api_key:
            raise SmartDBError(
                "SmartDB non configuré (SMARTDB_BASE_URL / SMARTDB_API_KEY manquants)."
            )
        return f"{self._base}/smart-db/tables/{self._table_id(table)}/records"

    def _request(self, method: str, url: str, **kw) -> Any:
        try:
            resp = self._http.request(method, url, **kw)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:500]
            raise SmartDBError(
                f"SmartDB {method} {url} → {exc.response.status_code}: {body}"
            ) from exc
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def _where(self, table: str, filters: list[tuple[str, str, Any]]) -> Optional[str]:
        if not filters:
            return None
        parts = []
        for col, op, val in filters:
            mcol = _map_col(table, col)
            if op == "in" and isinstance(val, (list, tuple)):
                joined = ",".join(_fmt(v) for v in val)
                parts.append(f"({mcol},in,{joined})")
            else:
                parts.append(f"({mcol},{op},{_fmt(val)})")
        return "~and".join(parts)

    def _sort(self, table: str, orders: list[tuple[str, bool]]) -> Optional[str]:
        if not orders:
            return None
        return ",".join(
            (f"-{_map_col(table, c)}" if desc else _map_col(table, c))
            for c, desc in orders
        )

    # ── exécution ────────────────────────────────────────────────────────────
    def _execute(self, q: _Query) -> _Result:
        if q._op == "select":
            return self._do_select(q)
        if q._op == "insert":
            return self._do_insert(q)
        if q._op == "update":
            return self._do_update(q)
        if q._op == "delete":
            return self._do_delete(q)
        if q._op == "upsert":
            return self._do_upsert(q)
        raise SmartDBError(f"Opération non supportée: {q._op}")

    def _fetch_rows(
        self,
        table: str,
        filters: list[tuple[str, str, Any]],
        orders: Optional[list[tuple[str, bool]]] = None,
        limit: Optional[int] = None,
    ) -> list[dict]:
        """GET paginé : renvoie toutes les lignes qui matchent (ou `limit` max)."""
        url = self._records_url(table)
        where = self._where(table, filters)
        sort = self._sort(table, orders or [])
        rows: list[dict] = []
        offset = 0
        while True:
            page_size = _PAGE_SIZE
            if limit is not None:
                page_size = min(_PAGE_SIZE, limit - len(rows))
                if page_size <= 0:
                    break
            params: dict[str, Any] = {"limit": page_size, "offset": offset}
            if where:
                params["where"] = where
            if sort:
                params["sort"] = sort
            payload = self._request("GET", url, params=params)
            page = (payload or {}).get("list", []) or []
            rows.extend(_transform_out(table, r) for r in page)
            info = (payload or {}).get("pageInfo", {}) or {}
            if info.get("isLastPage", True) or not page:
                break
            offset += len(page)
        return rows

    def _do_select(self, q: _Query) -> _Result:
        count = None
        if q._count_mode:  # count="exact"
            where = self._where(q._table, q._filters)
            payload = self._request(
                "GET",
                f"{self._records_url(q._table)}/count",
                params={"where": where} if where else None,
            )
            count = (payload or {}).get("count", 0)
        rows = self._fetch_rows(q._table, q._filters, q._orders, q._limit)
        return _Result(rows, count)

    def _do_insert(self, q: _Query) -> _Result:
        body = _transform_in(q._table, q._payload)
        payload = self._request("POST", self._records_url(q._table), json=body)
        return _Result(self._as_rows(q._table, payload))

    def _do_update(self, q: _Query) -> _Result:
        pks = [_row_pk(r) for r in self._fetch_rows(q._table, q._filters)]
        if not pks:
            return _Result([])
        patch = {k: v for k, v in (q._payload or {}).items()}
        body = [{**patch, "id": pk} for pk in pks]
        payload = self._request("PATCH", self._records_url(q._table), json=body)
        return _Result(self._as_rows(q._table, payload))

    def _do_delete(self, q: _Query) -> _Result:
        pks = [_row_pk(r) for r in self._fetch_rows(q._table, q._filters)]
        if not pks:
            return _Result([])
        self._request("DELETE", self._records_url(q._table), json=pks)
        return _Result([])

    def _do_upsert(self, q: _Query) -> _Result:
        rows = q._payload or []
        if isinstance(rows, dict):
            rows = [rows]
        conflict_cols = (
            [c.strip() for c in q._on_conflict.split(",")] if q._on_conflict else []
        )
        out: list[dict] = []
        to_insert: list[dict] = []
        for row in rows:
            existing_pk = None
            if conflict_cols:
                filters = [(c, "eq", row.get(c)) for c in conflict_cols]
                existing = self._fetch_rows(q._table, filters, limit=1)
                if existing:
                    existing_pk = _row_pk(existing[0])
            if existing_pk is not None:
                body = {**_transform_in(q._table, row), "id": existing_pk}
                patched = self._request(
                    "PATCH", self._records_url(q._table), json=[body]
                )
                out.extend(self._as_rows(q._table, patched))
            else:
                to_insert.append(_transform_in(q._table, row))
        # Insertions groupées (POST accepte un tableau).
        for i in range(0, len(to_insert), 500):
            created = self._request(
                "POST", self._records_url(q._table), json=to_insert[i : i + 500]
            )
            out.extend(self._as_rows(q._table, created))
        return _Result(out)

    @staticmethod
    def _as_rows(table: str, payload: Any) -> list[dict]:
        if payload is None:
            return []
        if isinstance(payload, list):
            return [_transform_out(table, r) for r in payload]
        if isinstance(payload, dict):
            # Réponse d'écriture parfois {"list":[...]} ou une seule ligne.
            if "list" in payload and isinstance(payload["list"], list):
                return [_transform_out(table, r) for r in payload["list"]]
            return [_transform_out(table, payload)]
        return []
