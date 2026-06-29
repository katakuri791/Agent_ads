"""Tests création campagne — règles absolues (roadmap #5).

On ne mocke pas tout le SDK Meta (lourd, fragile). On verrouille à la place les
invariants qui ne doivent JAMAIS régresser :
- une campagne créée par l'agent est TOUJOURS PAUSED (jamais ACTIVE) ;
- les budgets Meta sont en centimes ;
- chaque objectif a au moins un optimization_goal compatible."""

import inspect

from backend import meta_tools


def test_create_full_campaign_never_active():
    # Garde au niveau source : aucun statut ACTIVE ne doit apparaître dans la
    # construction de l'arbre campagne/adset/ad, et PAUSED doit y être présent.
    src = inspect.getsource(meta_tools.build_meta_tools)
    assert '"status": "ACTIVE"' not in src
    assert "'status': 'ACTIVE'" not in src
    assert '"status": "PAUSED"' in src


def test_budget_is_cents():
    # 1000 centimes = 10.00 dans la devise du compte.
    assert meta_tools._budget_usd(1000, None) == 10.0
    assert meta_tools._budget_usd(2599, None) == 25.99
    # Fallback sur le budget lifetime si pas de daily.
    assert meta_tools._budget_usd(None, 5000) == 50.0
    # Ni l'un ni l'autre → None (pas 0.0, pour afficher "—").
    assert meta_tools._budget_usd(None, None) is None


def test_compatible_goals_non_empty():
    # Chaque objectif déclaré a au moins un optimization_goal compatible.
    assert meta_tools.COMPATIBLE_GOALS
    for objective, goals in meta_tools.COMPATIBLE_GOALS.items():
        assert isinstance(goals, list) and goals, f"{objective} sans goal compatible"
