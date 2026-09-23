"""Statut de sync « running » orphelin.

Si le process meurt en plein sync, `fb_sync_state` reste sur « running » pour
toujours : l'UI affichait alors « Synchronisation… » en boucle et désactivait
le bouton Rafraîchir. Ces cas verrouillent le seuil de fraîcheur.
"""

from datetime import datetime, timedelta, timezone

from api.sync.endpoint import _is_stale_running

NOW = datetime(2026, 9, 23, 16, 0, tzinfo=timezone.utc)


def _state(status, minutes_ago=None, raw=None):
    updated = raw
    if minutes_ago is not None:
        updated = (NOW - timedelta(minutes=minutes_ago)).isoformat()
    return {"last_sync_status": status, "updated_at": updated}


def test_running_recent_reste_vivant():
    assert not _is_stale_running(_state("running", minutes_ago=5), NOW)


def test_running_ancien_est_orphelin():
    assert _is_stale_running(_state("running", minutes_ago=120), NOW)


def test_autres_statuts_jamais_orphelins():
    assert not _is_stale_running(_state("success", minutes_ago=999), NOW)
    assert not _is_stale_running(_state("error", minutes_ago=999), NOW)


def test_fuseau_horaire_smartdb():
    # SmartDB renvoie un décalage explicite (+01:00) : 14:02+01:00 = 13:02 UTC,
    # soit ~3 h avant NOW → orphelin.
    assert _is_stale_running(_state("running", raw="2026-09-23T14:02:39.826137+01:00"), NOW)


def test_horodatage_absent_ou_illisible():
    assert _is_stale_running(_state("running", raw=None), NOW)
    assert _is_stale_running(_state("running", raw="pas-une-date"), NOW)
