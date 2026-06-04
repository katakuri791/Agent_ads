from typing import Any, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from .config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
from .meta_tools import build_meta_tools
from .schemas import AdCopy, AudienceSpec, CampaignBrief, InsightAnswer, Metric


SYSTEM_PROMPT_BASE = """Tu es l'assistant MetaInsight, un agent expert en Meta Ads et Facebook Pages.
Tu aides l'utilisateur à créer et gérer ses campagnes publicitaires et sa Page Facebook, en français.

## Création de campagnes publicitaires
- Toutes les campagnes que tu crées sont en statut PAUSED par défaut, jamais ACTIVE.
- daily_budget est en centimes de la devise du compte (10 € = 1000).
- Objectifs valides : OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_APP_PROMOTION.
- Le paramètre `optimization_goal` doit être COMPATIBLE avec l'objective :
  - OUTCOME_TRAFFIC → LINK_CLICKS ou LANDING_PAGE_VIEWS
  - OUTCOME_AWARENESS → REACH ou IMPRESSIONS
  - OUTCOME_ENGAGEMENT → POST_ENGAGEMENT
  - OUTCOME_LEADS → LEAD_GENERATION
  - OUTCOME_SALES → OFFSITE_CONVERSIONS ou LINK_CLICKS
- AVANT d'appeler create_full_campaign tu DOIS avoir un image_hash valide :
  - Si l'utilisateur fournit un chemin local → utilise upload_image
  - Si l'utilisateur fournit une URL publique → utilise upload_image_from_url
  - Si l'utilisateur a joint une image au message (un image_hash apparaît dans le contexte),
    utilise-le directement, NE redemande PAS une image.
  - Sinon demande-lui une image avant de continuer (n'invente JAMAIS un hash).
- N'appelle `create_full_campaign` qu'UNE SEULE FOIS par demande de création. Une fois
  qu'elle a renvoyé un résultat (succès ✅ ou erreur ❌), NE la rappelle PAS dans le même
  tour.
- Si `create_full_campaign` renvoie une erreur ❌, NE réessaie PAS en boucle : relaie
  l'erreur à l'utilisateur et attends une correction (image, objectif compatible, nom,
  configuration du pixel…). Recréer à l'aveugle produit des campagnes en double.
- Si le contexte indique qu'une campagne a DÉJÀ été créée (IDs présents dans l'historique),
  ne la recrée pas : référence les IDs existants.

## Sortie structurée — TRÈS IMPORTANT
- Quand l'utilisateur demande de CRÉER ou de PROPOSER une publicité/campagne, AVANT
  d'appeler `create_full_campaign`, appelle d'abord l'outil `emit_campaign_brief` avec
  TOUS les paramètres proposés (nom, objectif, budget en USD, audience, ad copy, etc.).
  Cela affiche une carte de prévisualisation à l'utilisateur qu'il pourra valider.
  Demande-lui ensuite de confirmer avant de lancer la création réelle.
- Quand l'utilisateur demande une ANALYSE ou des STATISTIQUES (performances, KPIs,
  recommandations…), appelle `emit_insight` avec un résumé court, les métriques clés
  et 2 à 4 recommandations concrètes.
- Pour les questions simples (info, aide générale, FAQ), réponds en texte normal sans
  appeler ces outils.

## Gestion de la Page Facebook
Tu peux aussi inspecter et gérer la Page Facebook connectée :
- get_facebook_page_info → nom, catégorie, description, abonnés.
- list_facebook_page_posts(limit) → publications récentes avec engagement.
- post_to_facebook_page(message, link?) → publie un nouveau post. IMPORTANT : CONFIRME
  TOUJOURS le contenu exact avec l'utilisateur avant de publier, c'est immédiat et public.
- get_facebook_page_insights(days) → stats agrégées (impressions, engagement, abonnés).

## Style de réponse
- Toujours en français, ton clair et professionnel.
- Si une tool retourne un message qui commence par ❌, ne fais pas semblant que tout va bien :
  reformule l'erreur à l'utilisateur et propose une action corrective (ex: « il me faut
  une image, peux-tu me partager une URL ? »).
"""

SYSTEM_PROMPT_NO_META = """Tu es l'assistant MetaInsight.
L'utilisateur n'a pas encore configuré ses identifiants Meta Ads (access token, ad account ID, page ID).
Tu ne peux PAS créer ni lister de campagnes pour l'instant.
Invite-le poliment à se rendre dans la page « Paramètres » pour saisir ses identifiants Meta.
Tu peux toutefois répondre à des questions générales sur Meta Ads, le marketing publicitaire, l'optimisation des campagnes, etc.

Tu peux aussi appeler `emit_insight` pour structurer une réponse d'analyse théorique
(résumé + recommandations).
"""


def _build_llm() -> ChatOpenAI:
    kwargs: dict[str, Any] = {
        "model": OPENAI_MODEL,
        "api_key": OPENAI_API_KEY,
        "temperature": 0.2,
    }
    if OPENAI_BASE_URL:
        kwargs["base_url"] = OPENAI_BASE_URL
    return ChatOpenAI(**kwargs)


def _build_structured_tools(persist: dict[str, Any]) -> list:
    """Build the emit_* tools that capture structured Pydantic output."""

    @tool
    def emit_campaign_brief(
        name: str,
        objective: str,
        daily_budget_usd: float,
        headline: str,
        primary_text: str,
        cta: str = "LEARN_MORE",
        description: Optional[str] = None,
        age_min: int = 18,
        age_max: int = 65,
        countries: Optional[list[str]] = None,
        interests: Optional[list[str]] = None,
        genders: Optional[str] = None,
        link: Optional[str] = None,
        image_prompt: Optional[str] = None,
        image_hash: Optional[str] = None,
        estimated_reach: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> str:
        """Émet une carte structurée de PRÉVISUALISATION de campagne publicitaire.

        À appeler AVANT create_full_campaign pour que l'utilisateur puisse valider
        visuellement les paramètres. Ne crée RIEN sur Meta — c'est uniquement un aperçu.

        Args:
            name: nom de la campagne proposée
            objective: OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT
            daily_budget_usd: budget quotidien en USD (sera converti en centimes lors de la création réelle)
            headline: titre principal de l'annonce (max 40 caractères recommandé)
            primary_text: corps du texte de l'annonce
            cta: bouton CTA (LEARN_MORE, SHOP_NOW, SIGN_UP, BOOK_NOW, CONTACT_US…)
            description: description secondaire optionnelle
            age_min, age_max: tranche d'âge ciblée
            countries: codes pays ISO-2 (ex: ["MA", "FR"])
            interests: centres d'intérêt en langage naturel
            genders: "all", "men" ou "women"
            link: URL de destination
            image_prompt: description du visuel suggéré
            image_hash: hash hex d'une image déjà uploadée (si l'utilisateur a joint une image)
            estimated_reach: estimation de la portée (ex: "15K–35K personnes/jour")
            notes: notes additionnelles à montrer à l'utilisateur
        """
        try:
            brief = CampaignBrief(
                name=name,
                objective=objective,
                daily_budget_usd=daily_budget_usd,
                audience=AudienceSpec(
                    age_min=age_min,
                    age_max=age_max,
                    countries=countries or ["MA"],
                    interests=interests or [],
                    genders=genders,
                ),
                ad_copy=AdCopy(
                    headline=headline,
                    primary_text=primary_text,
                    description=description,
                    cta=cta,
                ),
                link=link,
                image_prompt=image_prompt,
                image_hash=image_hash,
                estimated_reach=estimated_reach,
                notes=notes,
            )
        except Exception as exc:
            return f"❌ Brief invalide : {exc}"
        persist["last_brief"] = brief.model_dump()
        return (
            "✅ Brief de campagne envoyé à l'utilisateur sous forme de carte. "
            "Attends sa validation avant d'appeler create_full_campaign."
        )

    @tool
    def emit_insight(
        summary: str,
        metric_labels: Optional[list[str]] = None,
        metric_values: Optional[list[str]] = None,
        metric_trends: Optional[list[float]] = None,
        recommendations: Optional[list[str]] = None,
    ) -> str:
        """Émet une carte structurée d'analyse/insight pour l'utilisateur.

        À appeler pour répondre à des questions d'analyse de performance, de KPIs,
        ou pour proposer des recommandations d'optimisation.

        Args:
            summary: résumé textuel court (1–3 phrases)
            metric_labels: labels des métriques clés (ex: ["ROAS", "Impressions"])
            metric_values: valeurs formatées correspondantes (ex: ["4.2x", "1.2M"])
            metric_trends: variations en % pour chaque métrique (ex: [15.7, -3.2]). Optionnel.
            recommendations: 2 à 4 recommandations concrètes
        """
        labels = metric_labels or []
        values = metric_values or []
        trends = metric_trends or []
        metrics: list[Metric] = []
        for i, label in enumerate(labels):
            value = values[i] if i < len(values) else ""
            trend = trends[i] if i < len(trends) else None
            metrics.append(Metric(label=label, value=value, trend=trend))
        try:
            answer = InsightAnswer(
                summary=summary,
                key_metrics=metrics,
                recommendations=recommendations or [],
            )
        except Exception as exc:
            return f"❌ Insight invalide : {exc}"
        persist["last_insight"] = answer.model_dump()
        return "✅ Carte d'insight envoyée à l'utilisateur."

    return [emit_campaign_brief, emit_insight]


def build_agent(user_settings: Optional[dict]):
    """Returns (graph, persist_dict). persist_dict captures last tool side-effects."""
    has_meta = bool(
        user_settings
        and user_settings.get("meta_access_token")
        and user_settings.get("meta_ad_account_id")
        and user_settings.get("meta_page_id")
    )

    llm = _build_llm()

    if not has_meta:
        persist: dict[str, Any] = {}
        structured_tools = _build_structured_tools(persist)
        graph = create_react_agent(model=llm, tools=structured_tools, prompt=SYSTEM_PROMPT_NO_META)
        return graph, persist

    tools, persist = build_meta_tools(
        user_settings["meta_access_token"],
        user_settings["meta_ad_account_id"],
        user_settings["meta_page_id"],
        user_settings.get("meta_pixel_id"),
    )
    tools = tools + _build_structured_tools(persist)
    graph = create_react_agent(model=llm, tools=tools, prompt=SYSTEM_PROMPT_BASE)
    return graph, persist


def history_to_lc_messages(history: list[dict]) -> list:
    out = []
    for row in history:
        role = row["role"]
        content = row["content"]
        if role == "user":
            out.append(HumanMessage(content=content))
        elif role == "assistant":
            out.append(AIMessage(content=content))
            # Mémoire des outils déjà exécutés : les tool calls ne sont pas
            # rejoués comme ToolMessage (couplage tool_call_id fragile), on
            # injecte plutôt un rappel de contexte pour que l'agent sache ce
            # qu'il a DÉJÀ fait et ne recrée pas une campagne en double.
            tool_note = _tool_calls_note(row.get("metadata"))
            if tool_note:
                out.append(SystemMessage(content=tool_note))
        elif role == "system":
            out.append(SystemMessage(content=content))
    return out


def _tool_calls_note(metadata: Any) -> Optional[str]:
    """Construit un rappel des outils exécutés à partir du metadata d'un message."""
    if not isinstance(metadata, dict):
        return None
    tool_calls = metadata.get("tool_calls")
    if not isinstance(tool_calls, list) or not tool_calls:
        return None
    lines = []
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        name = tc.get("name", "outil")
        output = tc.get("output") or ""
        if isinstance(output, str) and len(output) > 300:
            output = output[:297] + "…"
        lines.append(f"- {name} → {output}")
    if not lines:
        return None
    return (
        "[Contexte — outils déjà exécutés dans cette conversation (ne pas répéter "
        "ces actions, notamment ne recrée PAS une campagne déjà créée) :\n"
        + "\n".join(lines)
        + "]"
    )


def extract_tool_calls(result_messages: list) -> list[dict]:
    tool_calls = []
    for msg in result_messages:
        if isinstance(msg, ToolMessage):
            tool_calls.append(
                {
                    "name": getattr(msg, "name", "unknown"),
                    "status": "success",
                    "output": msg.content if isinstance(msg.content, str) else str(msg.content),
                }
            )
    return tool_calls


def extract_final_reply(result_messages: list) -> str:
    for msg in reversed(result_messages):
        if isinstance(msg, AIMessage) and msg.content:
            if isinstance(msg.content, str):
                return msg.content
            if isinstance(msg.content, list):
                parts = [p.get("text", "") for p in msg.content if isinstance(p, dict)]
                joined = "\n".join(p for p in parts if p)
                if joined:
                    return joined
    return "(pas de réponse)"
