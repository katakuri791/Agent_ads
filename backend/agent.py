import re
from typing import Any, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from .config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
from .meta_tools import build_meta_tools
from .schemas import (
    AdCopy,
    AudienceSpec,
    CampaignBrief,
    CampaignQuestionnaire,
    InsightAnswer,
    Metric,
    Question,
    QuestionOption,
)


def clean_markdown(text: str) -> str:
    """Retire le formatage markdown gras/italique (** __ *) des réponses de
    l'agent — l'UI affiche du texte brut, les étoiles « ** » polluent le rendu."""
    if not text:
        return text
    # **gras** et __gras__ → contenu seul
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"__(.+?)__", r"\1", text, flags=re.DOTALL)
    # *italique* — le (?!\s) après l'étoile épargne les puces « * item ».
    text = re.sub(r"\*(?!\s)(.+?)(?<!\s)\*", r"\1", text)
    # Étoiles doubles isolées restantes
    text = text.replace("**", "")
    return text


# Verbes de création (avec/sans accents) + noms de pub. Le QCM ne se déclenche
# que si UN verbe ET UN nom sont présents → « analyse ma campagne » n'enclenche pas.
_CREATE_VERB = re.compile(
    r"\b(cr[ée]e?r?|cr[ée]ation|lance(?:r)?|fais(?:\s+moi)?\s+une|mets?\s+en\s+place|"
    r"monte|create|launch|new|nouvelle?)\b",
    re.IGNORECASE,
)
_AD_NOUN = re.compile(r"\b(campagnes?|pubs?|publicit[ée]s?|annonces?|ads?|campaigns?)\b", re.IGNORECASE)
_EXPLICIT_CREATE = re.compile(
    r"(nouvelle\s+campagne|cr[ée]er?\s+une\s+(pub|campagne|publicit[ée]|annonce)|new\s+campaign)",
    re.IGNORECASE,
)


def wants_campaign_creation(message: str) -> bool:
    """Détecte de façon déterministe l'intention de CRÉER une publicité/campagne,
    pour afficher le QCM sans dépendre du tool-calling du LLM. Vrai si une phrase
    explicite match, ou si un verbe de création ET un nom de pub coexistent."""
    if not message:
        return False
    text = message.strip()
    if _EXPLICIT_CREATE.search(text):
        return True
    return bool(_CREATE_VERB.search(text) and _AD_NOUN.search(text))


def build_campaign_questionnaire() -> CampaignQuestionnaire:
    """QCM standard de création de campagne. Déterministe (construit en Python)
    pour garantir des questions et options cohérentes — l'agent se contente de le
    déclencher. Chaque QCM autorise une réponse libre via « Autre »."""
    return CampaignQuestionnaire(
        title="Création de campagne",
        intro="Réponds à ces quelques questions pour que je prépare ta campagne. "
        "Si un choix ne correspond pas, utilise « Autre » pour préciser.",
        submit_label="Générer le brief",
        questions=[
            Question(
                id="objective",
                label="Quel est l'objectif de ta publicité ?",
                type="single",
                options=[
                    QuestionOption(value="OUTCOME_TRAFFIC", label="Trafic vers un site / une page", hint="Amener des visiteurs sur ton site"),
                    QuestionOption(value="OUTCOME_SALES", label="Ventes / conversions", hint="Vendre un produit, déclencher un achat"),
                    QuestionOption(value="OUTCOME_LEADS", label="Génération de leads", hint="Collecter des contacts (formulaire)"),
                    QuestionOption(value="OUTCOME_AWARENESS", label="Notoriété", hint="Maximiser la portée et les impressions"),
                    QuestionOption(value="OUTCOME_ENGAGEMENT", label="Engagement", hint="Likes, commentaires, interactions"),
                ],
            ),
            Question(
                id="daily_budget",
                label="Quel budget quotidien souhaites-tu ?",
                type="single",
                options=[
                    QuestionOption(value="5", label="5 € / jour"),
                    QuestionOption(value="10", label="10 € / jour"),
                    QuestionOption(value="20", label="20 € / jour"),
                    QuestionOption(value="50", label="50 € / jour"),
                ],
                placeholder="Ex : 35",
            ),
            Question(
                id="countries",
                label="Quel(s) pays veux-tu cibler ?",
                type="multi",
                options=[
                    QuestionOption(value="MA", label="Maroc"),
                    QuestionOption(value="FR", label="France"),
                    QuestionOption(value="BE", label="Belgique"),
                    QuestionOption(value="US", label="États-Unis"),
                ],
                placeholder="Codes pays ISO-2, ex : ES, DE",
            ),
            Question(
                id="age",
                label="Quelle tranche d'âge ?",
                type="single",
                options=[
                    QuestionOption(value="18-65", label="Tous les adultes (18–65)"),
                    QuestionOption(value="18-34", label="Jeunes (18–34)"),
                    QuestionOption(value="25-44", label="Actifs (25–44)"),
                    QuestionOption(value="35-54", label="Adultes (35–54)"),
                ],
                placeholder="Ex : 22-40",
            ),
            Question(
                id="gender",
                label="Quel genre cibler ?",
                type="single",
                allow_custom=False,
                options=[
                    QuestionOption(value="all", label="Tous"),
                    QuestionOption(value="men", label="Hommes"),
                    QuestionOption(value="women", label="Femmes"),
                ],
            ),
            Question(
                id="interests",
                label="Centres d'intérêt de ton audience ?",
                type="text",
                placeholder="Ex : fitness, nutrition, sport en salle",
                required=False,
            ),
            Question(
                id="link",
                label="Quel lien de destination ?",
                type="text",
                placeholder="https://ton-site.com/page",
                required=False,
            ),
            Question(
                id="ad_text",
                label="Que veux-tu mettre en avant dans l'annonce ?",
                type="text",
                placeholder="Décris ton offre, ton produit, ton message clé…",
            ),
            Question(
                id="media",
                label="Ajoute le visuel de ta publicité (photo ou vidéo)",
                type="media",
                allow_custom=False,
                placeholder="Photo (JPG, PNG) ou vidéo (MP4, MOV)",
            ),
        ],
    )


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
- AVANT d'appeler create_full_campaign tu DOIS avoir un VISUEL : soit un image_hash
  (photo), soit un video_id (vidéo). L'un des deux suffit.
  - Si un `image_hash=...` apparaît dans le contexte/les réponses → passe-le tel quel
    dans `image_hash`. NE redemande PAS d'image.
  - Si un `video_id=...` apparaît dans le contexte/les réponses → passe-le dans `video_id`
    (l'image_hash devient alors une miniature optionnelle, Meta la génère sinon).
  - Si l'utilisateur fournit un chemin local → utilise upload_image ; une URL publique →
    upload_image_from_url.
  - Sinon demande-lui une photo ou une vidéo avant de continuer (n'invente JAMAIS de hash/id).
- N'appelle `create_full_campaign` qu'UNE SEULE FOIS par demande de création. Une fois
  qu'elle a renvoyé un résultat (succès ✅ ou erreur ❌), NE la rappelle PAS dans le même
  tour.
- Si `create_full_campaign` renvoie une erreur ❌, NE réessaie PAS en boucle : relaie
  l'erreur à l'utilisateur et attends une correction (image, objectif compatible, nom,
  configuration du pixel…). Recréer à l'aveugle produit des campagnes en double.
- Si le contexte indique qu'une campagne a DÉJÀ été créée (IDs présents dans l'historique),
  ne la recrée pas : référence les IDs existants.

## Sortie structurée — TRÈS IMPORTANT
- Quand l'utilisateur exprime l'envie de CRÉER / LANCER une publicité ou une campagne
  mais n'a PAS encore donné les détails (objectif, budget, audience, texte…), n'enchaîne
  PAS une longue liste de questions en texte. Appelle d'abord `start_campaign_questionnaire` :
  cela affiche un QCM interactif à l'utilisateur. NE pose PAS toi-même les questions en
  texte, le QCM s'en charge. Dis simplement une phrase courte du type « J'affiche un
  petit questionnaire pour cadrer ta campagne. »
- Lorsque l'utilisateur a répondu au QCM, ses réponses arrivent dans un message qui
  commence par « [Réponses au questionnaire de campagne] ». Utilise-les pour appeler
  `emit_campaign_brief` avec TOUS les paramètres (nom, objectif, budget en USD, audience,
  ad copy, lien, et image_hash OU video_id si un visuel a été joint). Déduis un nom de
  campagne pertinent et rédige le headline / primary_text à partir de ce que l'utilisateur
  a décrit. Cela affiche une carte de prévisualisation à valider ; demande ensuite
  confirmation avant la création réelle.
- Si l'utilisateur fournit DÉJÀ tous les détails dans un message libre (sans passer par le
  QCM), tu peux appeler directement `emit_campaign_brief` sans afficher le QCM.
- Quand l'utilisateur demande une ANALYSE ou des STATISTIQUES (performances, KPIs,
  recommandations…), appelle `emit_insight` avec un résumé court, les métriques clés
  et 2 à 4 recommandations concrètes.
- Pour les questions simples (info sur la Page, le compte publicitaire, les pubs, aide
  générale, FAQ), réponds en texte normal sans appeler ces outils.

## Gestion de la Page Facebook
Tu peux aussi inspecter et gérer la Page Facebook connectée :
- get_facebook_page_info → nom, catégorie, description, abonnés.
- list_facebook_page_posts(limit) → publications récentes avec engagement.
- post_to_facebook_page(message, link?) → publie un nouveau post. IMPORTANT : CONFIRME
  TOUJOURS le contenu exact avec l'utilisateur avant de publier, c'est immédiat et public.
- get_facebook_page_insights(days) → stats agrégées (impressions, engagement, abonnés).

## Style de réponse
- Toujours en français, ton clair et professionnel.
- N'utilise JAMAIS de formatage markdown gras (pas de `**texte**` ni `__texte__`) :
  l'interface affiche du texte brut, les étoiles s'afficheraient telles quelles. Écris
  en texte simple ; pour structurer, utilise des phrases courtes ou des tirets « - ».
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
        video_id: Optional[str] = None,
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
            image_hash: hash hex d'une image déjà uploadée (si l'utilisateur a joint une photo)
            video_id: identifiant de vidéo déjà uploadée (si l'utilisateur a joint une vidéo)
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
                video_id=video_id,
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

    @tool
    def start_campaign_questionnaire() -> str:
        """Affiche un QCM interactif pour cadrer une création de campagne.

        À appeler DÈS que l'utilisateur exprime l'envie de créer/lancer une
        publicité ou une campagne SANS avoir encore fourni les détails (objectif,
        budget, audience…). N'invente pas les réponses : ce QCM les recueille.
        Ne PAS appeler si l'utilisateur a déjà répondu au QCM (réponses présentes
        dans l'historique) — passe alors directement à emit_campaign_brief.
        """
        persist["last_questionnaire"] = build_campaign_questionnaire().model_dump()
        return (
            "✅ QCM de création de campagne affiché à l'utilisateur. "
            "Attends qu'il soumette ses réponses, puis appelle emit_campaign_brief "
            "avec les paramètres recueillis."
        )

    return [emit_campaign_brief, emit_insight, start_campaign_questionnaire]


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
                return clean_markdown(msg.content)
            if isinstance(msg.content, list):
                parts = [p.get("text", "") for p in msg.content if isinstance(p, dict)]
                joined = "\n".join(p for p in parts if p)
                if joined:
                    return clean_markdown(joined)
    return "(pas de réponse)"
