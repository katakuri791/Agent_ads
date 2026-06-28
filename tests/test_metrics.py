"""Tests calculs de métriques (roadmap #5).

metrics.py est pur (pas d'I/O) et porte la logique « bon indicateur selon
l'objectif » + l'extraction des conversions. Des calculs faux = des KPIs faux
sur tout le dashboard, donc on verrouille les cas clés."""

from backend import metrics


def test_div_protects_zero_denominator():
    assert metrics._div(10, 0) == 0.0
    assert metrics._div(10, 4) == 2.5


def test_metric_sales_is_roas():
    r = metrics.calculate_performance_metric("OUTCOME_SALES", {"spend": 100, "revenue": 400})
    assert r["metric_name"] == "ROAS"
    assert r["metric_value"] == 4.0
    assert r["is_roas"] is True
    assert r["raw_revenue"] == 400.0


def test_metric_leads_is_cpl():
    r = metrics.calculate_performance_metric("OUTCOME_LEADS", {"spend": 120, "leads": 60})
    assert r["metric_name"] == "CPL"
    assert r["metric_value"] == 2.0
    assert r["is_roas"] is False
    assert r["raw_revenue"] is None


def test_metric_awareness_is_cpm():
    # CPM = spend / impressions * 1000.
    r = metrics.calculate_performance_metric("OUTCOME_AWARENESS", {"spend": 50, "impressions": 10000})
    assert r["metric_name"] == "CPM"
    assert r["metric_value"] == 5.0


def test_metric_traffic_is_cpc():
    r = metrics.calculate_performance_metric("OUTCOME_TRAFFIC", {"spend": 30, "clicks": 60})
    assert r["metric_name"] == "CPC"
    assert r["metric_value"] == 0.5


def test_metric_unknown_objective_fallbacks():
    # Inconnu + revenu → ROAS ; inconnu sans revenu → CPC.
    r1 = metrics.calculate_performance_metric("WHATEVER", {"spend": 10, "revenue": 50})
    assert r1["metric_name"] == "ROAS" and r1["metric_value"] == 5.0
    r2 = metrics.calculate_performance_metric("WHATEVER", {"spend": 10, "clicks": 5})
    assert r2["metric_name"] == "CPC" and r2["metric_value"] == 2.0


def test_legacy_objective_aliases():
    # Les objectifs legacy (non ODAX) mappent aussi correctement.
    assert metrics.calculate_performance_metric("CONVERSIONS", {"spend": 1, "revenue": 2})["is_roas"] is True
    assert metrics.calculate_performance_metric("LEAD_GENERATION", {"spend": 1, "leads": 1})["metric_name"] == "CPL"


def test_extract_conversion_columns():
    actions = [
        {"action_type": "purchase", "value": "3"},
        {"action_type": "lead", "value": "5"},
        {"action_type": "link_click", "value": "20"},
    ]
    action_values = [{"action_type": "omni_purchase", "value": "149.99"}]
    cols = metrics.extract_conversion_columns(actions, action_values)
    assert cols["purchases"] == 3.0
    assert cols["leads"] == 5.0
    assert cols["link_clicks"] == 20.0
    assert cols["revenue"] == 149.99


def test_extract_handles_garbage():
    # Entrées non-listes / valeurs vides → 0, pas d'exception.
    cols = metrics.extract_conversion_columns(None, "nope")
    assert cols["purchases"] == 0.0 and cols["revenue"] == 0.0
