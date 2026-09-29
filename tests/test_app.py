from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import alerts, garden, planner, regions
from app import plants as catalogue


# ---- regions ----------------------------------------------------------------------------------------

@pytest.mark.parametrize("typed,oc,region", [
    ("sw1a 1aa", "SW1A", "south"), ("TR18", "TR18", "sw"), ("LS6 2AB", "LS6", "north"),
    ("EH1 1YZ", "EH1", "scot"), ("IV2 3AA", "IV2", "high"), ("B1 1AA", "B1", "central"),
])
def test_postcode_to_region(typed, oc, region):
    assert regions.outcode(typed) == oc
    assert regions.region_for(oc) == region


def test_bad_postcode():
    assert regions.outcode("hello") is None
    assert regions.outcode("12345") is None


# ---- planner ----------------------------------------------------------------------------------------

def test_colder_regions_sow_later_in_spring_and_earlier_in_autumn():
    spring = ["04-01", "04-30"]
    assert planner.window_dates(spring, 2027, 14)[0] == date(2027, 4, 15)
    assert planner.window_dates(spring, 2027, -14)[0] == date(2027, 3, 18)
    autumn = ["10-01", "10-31"]
    assert planner.window_dates(autumn, 2026, 14)[0] == date(2026, 9, 17)


def test_window_across_new_year():
    start, end = planner.window_dates(["10-15", "03-15"], 2026, 0)
    assert start == date(2026, 10, 15) and end == date(2027, 3, 15)


def test_next_window_picks_autumn_or_spring():
    garlic = catalogue.BY_ID["garlic"]["sow_out"]
    assert planner.next_window(garlic, date(2026, 9, 28), 0)[0] == date(2026, 10, 1)
    assert planner.next_window(garlic, date(2027, 1, 10), 0)[0] == date(2027, 2, 1)


def _crop(plant_id, method, today, **kw):
    start, end = planner.plan_anchor(catalogue.BY_ID[plant_id], method, today, 0)
    return dict({"id": 1, "plant_id": plant_id, "method": method, "anchor": start.isoformat(),
                 "anchor_end": end.isoformat()}, **kw)


def test_every_plant_and_method_makes_a_sensible_plan():
    today = date(2026, 9, 28)
    for p in catalogue.PLANTS:
        assert planner.methods_for(p), p["id"]
        for method in planner.methods_for(p):
            jobs = planner.crop_jobs(_crop(p["id"], method, today), 0, set(), today)
            kinds = [j["kind"] for j in jobs]
            assert "harvest" in kinds and "buy" in kinds, p["id"]
            first = next(j for j in jobs if j["kind"] in ("sow_in", "sow_out", "plant_out"))
            harvest = next(j for j in jobs if j["kind"] == "harvest")
            assert harvest["start"] > first["start"], (p["id"], method)
            assert harvest["end"] >= harvest["start"]


def test_tomatoes_indoors_then_out_after_frost():
    today = date(2027, 3, 10)
    jobs = {j["kind"]: j for j in planner.crop_jobs(_crop("tomatoes", "sow_in", today), 0, set(), today)}
    assert jobs["sow_in"]["status"] == "now"
    assert jobs["plant_out"]["start"] >= "2027-05-25"
    # in June, planting out is due - but not if the seeds were never sown
    crop = _crop("tomatoes", "sow_in", today)
    june = {j["kind"]: j for j in planner.crop_jobs(crop, 0, set(), date(2027, 6, 1))}
    assert june["plant_out"]["status"] == "waiting"
    crop["sown_on"] = "2027-03-10"
    june = {j["kind"]: j for j in planner.crop_jobs(crop, 0, set(), date(2027, 6, 1))}
    assert june["plant_out"]["status"] == "now"


def test_sowing_late_moves_the_harvest():
    today = date(2027, 7, 1)
    crop = _crop("carrots", "sow_out", date(2027, 4, 1), sown_on="2027-07-01")
    harvest = next(j for j in planner.crop_jobs(crop, 0, set(), today) if j["kind"] == "harvest")
    assert harvest["start"] == "2027-09-23"  # 12 weeks after sowing


def test_succession_offers_another_batch():
    crop = _crop("radish", "sow_out", date(2027, 4, 1), sown_on="2027-04-01")
    jobs = planner.crop_jobs(crop, 0, set(), date(2027, 4, 16))
    batch = next(j for j in jobs if j["kind"] == "batch")
    assert batch["status"] == "now"


def test_bare_bed_suggestions_prefer_liked_and_fit_the_space():
    today = date(2027, 6, 20)
    bed = {"id": 1, "kind": "bed"}
    pot = {"id": 2, "kind": "pot"}
    s = planner.suggestions_for_space(bed, [], {"french_beans"}, today, 0)
    assert s["empty_now"] and s["plants"][0]["plant_id"] == "french_beans"
    ids = [x["plant_id"] for x in planner.suggestions_for_space(pot, [], set(), today, 0, limit=50)["plants"]]
    assert "pumpkin" not in ids  # too big for pots
    autumn = [x["plant_id"] for x in planner.suggestions_for_space(bed, [], set(), date(2026, 10, 20), 0, limit=50)["plants"]]
    assert "garlic" in autumn and "broad_beans" in autumn


# ---- API --------------------------------------------------------------------------------------------

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GARDEN_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("ALERTS", "0")
    monkeypatch.setenv("GARDEN_TODAY", "2027-04-10")
    monkeypatch.setattr(alerts, "locate", lambda oc: (53.8, -1.6))
    from app.main import app
    with TestClient(app) as c:
        yield c


def _join(c, email="kid@example.com"):
    r = c.post("/api/register", json={"name": "Sam", "email": email, "password": "sunflower1",
                                      "postcode": "LS6 2AB", "age_ok": True})
    assert r.status_code == 200, r.text
    return r.json()


def test_register_needs_grown_up_ok(client):
    r = client.post("/api/register", json={"name": "A", "email": "a@b.co", "password": "longenough", "age_ok": False})
    assert r.status_code == 400


def test_full_journey(client):
    me = _join(client)
    assert me["outcode"] == "LS6" and me["region"]["id"] == "north"
    client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed"})
    g = client.post("/api/crops/bulk", json={"crops": ["radish", "tomatoes"]}).json()
    radish = next(c for c in g["crops"] if c["plant_id"] == "radish")
    assert radish["space_id"] is None  # nothing goes into a bed until the user says so
    assert "planner" not in [b["id"] for b in g["new_badges"]]

    g = client.post("/api/done", json={"key": "c%d:sow" % radish["id"]}).json()
    assert [b["id"] for b in g["new_badges"]] == ["sprout"]
    radish = next(c for c in g["crops"] if c["id"] == radish["id"])
    assert radish["sown_on"] == "2027-04-10" and radish["stage"] == 2

    # other people can't touch it
    client.post("/api/logout")
    _join(client, "other@example.com")
    assert client.post("/api/done", json={"key": "c%d:sow" % radish["id"]}).status_code == 404


def test_nodig_bed_badge(client):
    _join(client)
    g = client.post("/api/spaces", json={"name": "Bed", "kind": "bed"}).json()
    sid = g["spaces"][0]["id"]
    for i in range(len(catalogue.NODIG_STEPS)):
        g = client.post("/api/done", json={"key": "s%d:nodig%d" % (sid, i)}).json()
    assert "builder" in [b["id"] for b in g["new_badges"]]


def test_calendar_feed(client):
    _join(client)
    client.post("/api/spaces", json={"name": "Bed", "kind": "bed"})
    client.post("/api/crops", json={"plant_id": "carrots"})
    token = client.get("/api/me").json()["calendar_path"]
    body = client.get(token).text
    assert body.startswith("BEGIN:VCALENDAR") and "Sow carrots outside" in body
    assert client.get("/calendar/nope.ics").status_code == 404


def test_alerts_frost_warning_only_for_tender_crops_in_the_ground(client):
    _join(client)
    from app import db
    client.post("/api/spaces", json={"name": "Bed", "kind": "bed"})
    g = client.post("/api/crops", json={"plant_id": "courgette", "method": "plants"}).json()
    cid = g["crops"][0]["id"]
    frosty = [{"date": "2027-04-10", "min": 3, "max": 12, "rain": 2}, {"date": "2027-04-11", "min": -1, "max": 9, "rain": 0}]
    with db.connect() as conn:
        user = dict(conn.execute("SELECT * FROM users").fetchone())
        assert not any("frost" in k[0][0] for k in alerts.due_alerts(garden.load(conn, user), frosty, set()))
    client.post("/api/done", json={"key": "c%d:plant" % cid})
    with db.connect() as conn:
        out = alerts.due_alerts(garden.load(conn, user), frosty, set())
    frost = [a for a in out if a[0][0].startswith("frost:")]
    assert frost and "courgettes" in frost[0][2]


def test_buying_isnt_missed_while_the_planting_window_is_open():
    # onion sets: autumn window 15 Sep - 31 Oct; on 28 Sep you can still buy and plant them
    today = date(2026, 9, 28)
    jobs = {j["kind"]: j for j in planner.crop_jobs(_crop("onions", "sow_out", today), 0, set(), today)}
    assert jobs["sow_out"]["status"] == "now"
    assert jobs["buy"]["status"] == "now" and jobs["buy"]["end"] == jobs["sow_out"]["end"]


# ---- yield, space, neighbours, what next -------------------------------------------------------------

def test_yield_and_space_for_a_real_order():
    garlic, onions = catalogue.BY_ID["garlic"], catalogue.BY_ID["onions"]
    assert planner.harvest_estimate(garlic, 40) == "about 40 bulbs"
    assert planner.harvest_estimate(catalogue.BY_ID["potatoes"], 10) == "about 10-15 kg of potatoes"
    assert round(40 * planner.area_each(garlic), 1) == 1.8          # 40 cloves at 15 x 30cm
    assert round(175 * planner.area_each(onions), 1) == 4.4         # 500g of sets at 10 x 25cm


def test_garlic_frees_the_bed_in_july_for_something_else():
    today = date(2026, 10, 1)
    crop = _crop("garlic", "sow_out", today, sown_on="2026-10-01", space_id=1)
    jobs = planner.crop_jobs(crop, 0, set(), today)
    nxt = planner.next_in_space(crop, jobs, "bed", set(), 0, today)
    assert nxt["free_from"] == "2027-07-06"  # 3 weeks into the garlic harvest, not mid-August
    ids = [p["plant_id"] for p in nxt["plants"]]
    assert "french_beans" in ids or "beetroot" in ids
    assert not {"onions", "leeks", "spring_onions", "garlic"} & set(ids)  # not the onion family again


def test_bed_usage_and_bad_neighbours():
    today = date(2026, 10, 1)
    bed = {"id": 1, "kind": "bed", "width_m": 1.2, "length_m": 2.4}
    onions = dict(_crop("onions", "sow_out", today), id=1, space_id=1, quantity=175)
    peas = dict(_crop("peas", "sow_out", today), id=2, space_id=1, quantity=20)
    pairs = [(c, planner.crop_jobs(c, 0, set(), today)) for c in (onions, peas)]
    use = planner.usage(bed, pairs)
    assert use["area"] == 2.88 and use["peak"] > use["area"]  # 175 onions alone need ~4.4 m2
    assert planner.clashes(bed, pairs)[0]["why"] == "onions can stunt peas"


def test_follow_on_crop_waits_for_the_space(client):
    _join(client)
    g = client.post("/api/spaces", json={"name": "Bed", "kind": "bed", "width_m": 1.2, "length_m": 2.4}).json()
    sid = g["spaces"][0]["id"]
    g = client.post("/api/crops", json={"plant_id": "beetroot", "space_id": sid, "after": "2027-06-20"}).json()
    assert g["crops"][0]["anchor"] >= "2027-06-20"
    check = client.get("/api/check", params={"plant_id": "onions", "space_id": sid, "quantity": 175}).json()
    assert check["space"]["fits"] is False and check["area"] == 4.38


def test_follow_on_after_garlic_isnt_a_bad_neighbour(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed"}).json()["spaces"][0]["id"]
    g = client.post("/api/crops", json={"plant_id": "garlic", "space_id": sid, "quantity": 20}).json()
    free = g["crops"][0]["then"]["free_from"]
    check = client.get("/api/check", params={"plant_id": "french_beans", "space_id": sid, "after": free}).json()
    assert check["bad"] == [] and check["space"]["fits"]
    # but in the ground at the same time as the garlic, beans are a bad neighbour
    garlic_in = g["crops"][0]["starts"]
    check = client.get("/api/check", params={"plant_id": "broad_beans", "space_id": sid, "after": garlic_in}).json()
    assert [x["plant_id"] for x in check["bad"]] == ["garlic"]


def test_after_picking_garlic_dry_it_then_store_it():
    crop = _crop("garlic", "sow_out", date(2026, 10, 1), sown_on="2026-10-01", harvested_on="2027-07-01")
    jobs = {j["key"].split(":")[1]: j for j in planner.crop_jobs(crop, 0, set(), date(2027, 7, 2))}
    assert jobs["cure"]["title"] == "Dry your garlic" and jobs["cure"]["status"] == "now"
    assert jobs["store"]["status"] == "now" and any("freeze" in s for s in jobs["store"]["steps"])
    # nothing about storing until it's picked
    crop["harvested_on"] = None
    assert "c1:store" not in {j["key"] for j in planner.crop_jobs(crop, 0, set(), date(2027, 7, 2))}


def test_beetroot_gets_a_head_start_to_follow_autumn_onions(client):
    _join(client)  # "today" is 10 Apr 2027 in these tests: plan autumn onions for this September
    sid = client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed"}).json()["spaces"][0]["id"]
    g = client.post("/api/crops", json={"plant_id": "onions", "space_id": sid, "quantity": 40, "after": "2027-09-20"}).json()
    then = g["crops"][0]["then"]
    assert then["free_from"].startswith("2028-06") or then["free_from"].startswith("2028-07")
    beet = next(x for x in then["plants"] if x["plant_id"] == "beetroot")
    assert beet["method"] == "sow_in"  # start it on a windowsill so it's ready when the onions come up
    g = client.post("/api/crops", json={"plant_id": "beetroot", "space_id": sid, "method": "sow_in",
                                        "after": then["free_from"]}).json()
    jobs = {j["kind"]: j for j in g["crops"][-1]["jobs"]}
    assert jobs["sow_in"]["start"] < then["free_from"]            # sown indoors before the bed is free...
    assert jobs["plant_out"]["start"] == then["free_from"]        # ...planted out the day it is


def test_onions_suggest_a_spring_batch_in_another_bed(client):
    _join(client)
    s1 = client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed"}).json()["spaces"][0]["id"]
    client.post("/api/spaces", json={"name": "Bed 2", "kind": "bed"})
    # planted in autumn (the fixture's today is April, so aim for the autumn window)
    g = client.post("/api/crops", json={"plant_id": "onions", "space_id": s1, "after": "2027-09-20"}).json()
    second = g["crops"][0]["second"]
    assert second["recommend"] and second["window"][0].startswith("2028-03")
    assert second["spaces"][0]["name"] == "Bed 2"  # Bed 1 is still full of autumn onions in March
    garlic = client.post("/api/crops", json={"plant_id": "garlic", "space_id": s1, "after": "2027-10-05"}).json()["crops"][-1]
    assert garlic["second"]["recommend"] is False  # autumn garlic is best; spring is only if you missed it


def test_big_tomatoes_get_canes_before_planting_out():
    today = date(2027, 3, 10)
    crop = _crop("tomatoes_big", "sow_in", today, sown_on="2027-03-10")
    jobs = {j["kind"]: j for j in planner.crop_jobs(crop, 0, set(), today)}
    assert jobs["prep"]["title"] == "Put in strong tomato canes"
    assert jobs["prep"]["start"] < jobs["plant_out"]["start"] < jobs["prep"]["end"]
    assert any("figure-of-8" in j["title"] for j in planner.crop_jobs(crop, 0, set(), today))


def test_peas_get_netted_then_uncovered_but_kale_stays_covered():
    today = date(2027, 4, 1)
    peas = _crop("peas", "sow_out", today, sown_on="2027-04-01")
    jobs = {j["key"].split(":")[1]: j for j in planner.crop_jobs(peas, 0, set(), today)}
    assert jobs["protect"]["title"] == "Protect your peas from wood pigeons and mice"
    assert jobs["uncover"]["start"] == "2027-05-13" and "20cm" in jobs["uncover"]["steps"][0]  # 6 weeks later
    kale = _crop("kale", "plants", date(2027, 6, 1), planted_on="2027-06-01")
    keys = {j["key"].split(":")[1] for j in planner.crop_jobs(kale, 0, set(), date(2027, 6, 1))}
    assert "protect" in keys and "uncover" not in keys


def test_new_plants_plan_properly():
    today = date(2027, 5, 1)
    for pid in ("sweet_potatoes", "summer_squash"):
        p = catalogue.BY_ID[pid]
        jobs = planner.crop_jobs(_crop(pid, planner.methods_for(p)[0], today), 0, set(), today)
        assert any(j["kind"] == "harvest" for j in jobs)
    sp = planner.crop_jobs(_crop("sweet_potatoes", "plants", today), 0, set(), today)
    assert "slips" in next(j for j in sp if j["kind"] == "plant_out")["steps"][0]


def test_warns_when_the_same_crop_is_already_planned_elsewhere(client):
    _join(client)
    b1 = client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed"}).json()["spaces"][0]["id"]
    b2 = client.post("/api/spaces", json={"name": "Bed 2", "kind": "bed"}).json()["spaces"][-1]["id"]
    # garlic in Bed 1 frees up in summer 2028; beetroot already planned in Bed 2 for then
    g = client.post("/api/crops", json={"plant_id": "garlic", "space_id": b1, "after": "2027-10-01"}).json()
    free = g["crops"][0]["then"]["free_from"]
    client.post("/api/crops", json={"plant_id": "beetroot", "space_id": b2, "method": "sow_out", "after": free})
    g = client.get("/api/garden").json()
    garlic = next(c for c in g["crops"] if c["plant_id"] == "garlic")
    beet = next(x for x in garlic["then"]["plants"] if x["plant_id"] == "beetroot")
    assert beet["already"][0]["space_name"] == "Bed 2"
    assert garlic["then"]["plants"][-1]["plant_id"] == "beetroot"  # moved to the end of the list
    check = client.get("/api/check", params={"plant_id": "beetroot", "space_id": b1, "method": "sow_out", "after": free}).json()
    assert check["already"][0]["space_name"] == "Bed 2"
    # something not planned yet isn't flagged
    chard = next(x for x in garlic["then"]["plants"] if x["plant_id"] == "chard")
    assert chard["already"] == []


# ---- accounts & admin -------------------------------------------------------------------------------

def test_admin_email_becomes_admin_and_can_reset_a_password(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "boss@example.com")
    _join(client, "kid@example.com")
    assert client.get("/api/admin").status_code == 403  # an ordinary account can't see the admin page
    client.post("/api/logout")
    me = _join(client, "boss@example.com")
    assert me["is_admin"] is True
    admin = client.get("/api/admin").json()
    kid = next(u for u in admin["users"] if u["email"] == "kid@example.com")
    link = client.post("/api/admin/users/%d/reset" % kid["id"]).json()["link"]
    token = link.split("token=")[1]
    client.post("/api/logout")
    assert client.post("/api/reset", json={"token": token, "password": "brand-new-pw"}).status_code == 200
    assert client.post("/api/reset", json={"token": token, "password": "again-again"}).status_code == 400  # one use only
    assert client.post("/api/login", json={"email": "kid@example.com", "password": "brand-new-pw"}).status_code == 200


def test_change_password_and_email(client):
    _join(client)
    assert client.post("/api/me/password", json={"current": "wrong-one", "new": "whatever12"}).status_code == 400
    assert client.post("/api/me/password", json={"current": "sunflower1", "new": "tulip-time"}).status_code == 200
    assert client.patch("/api/me", json={"email": "new@example.com"}).json()["email"] == "new@example.com"
    client.post("/api/logout")
    assert client.post("/api/login", json={"email": "new@example.com", "password": "tulip-time"}).status_code == 200


def test_only_admin_cant_be_deleted(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "boss@example.com")
    _join(client, "boss@example.com")
    r = client.post("/api/me/delete", json={"password": "sunflower1"})
    assert r.status_code == 400 and "only admin" in r.json()["detail"]


# ---- batches, dates, soil ------------------------------------------------------------------------------

def test_three_rows_of_carrots_two_weeks_apart(client):
    _join(client)  # today is 10 Apr 2027 in these tests
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed", "soil": "clay"}).json()["spaces"][0]["id"]
    g = client.post("/api/crops", json={"plant_id": "carrots", "space_id": sid, "batches": 3, "every_weeks": 2,
                                        "quantity": 30}).json()
    carrots = sorted((c for c in g["crops"] if c["plant_id"] == "carrots"), key=lambda c: c["anchor"])
    assert len(carrots) == 3
    sows = [next(j for j in c["jobs"] if j["kind"] == "sow_out")["start"] for c in carrots]
    assert sows[1] > sows[0] and sows[2] > sows[1]
    assert g["spaces"][0]["soil"] == "clay"


def test_harvest_follows_the_real_sowing_date(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed"}).json()["spaces"][0]["id"]
    c = client.post("/api/crops", json={"plant_id": "radish", "space_id": sid}).json()["crops"][0]
    g = client.patch("/api/crops/%d" % c["id"], json={"plant_id": "radish", "sown_on": "2027-04-01"}).json()
    harvest = next(j for j in g["crops"][0]["jobs"] if j["kind"] == "harvest")
    assert harvest["start"] == "2027-04-29"  # 4 weeks after the sowing date entered, not the season
    assert client.patch("/api/crops/%d" % c["id"], json={"plant_id": "radish", "sown_on": "2030-01-01"}).status_code == 400


def test_locked_out_admin_gets_a_reset_link_in_the_logs(client, monkeypatch):
    from app import main
    monkeypatch.setenv("ADMIN_EMAIL", "boss@example.com")
    assert main.admin_reset_links() == []  # off unless ADMIN_RESET_LINK is set
    monkeypatch.setenv("ADMIN_RESET_LINK", "1")
    monkeypatch.setenv("RAILWAY_PUBLIC_DOMAIN", "example.up.railway.app")
    assert "just sign up" in main.admin_reset_links()[0]
    _join(client, "boss@example.com")
    client.post("/api/logout")
    link = main.admin_reset_links()[0]
    assert "https://example.up.railway.app/#/reset?token=" in link
    token = link.split("token=")[1]
    assert client.post("/api/reset", json={"token": token, "password": "fresh-start-1"}).status_code == 200


def test_layout_is_only_a_suggestion_until_agreed(client):
    _join(client)
    client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed", "width_m": 1.2, "length_m": 2.4})
    client.post("/api/spaces", json={"name": "Bed 2", "kind": "bed", "width_m": 1.2, "length_m": 2.4})
    g = client.post("/api/spaces", json={"name": "Pots", "kind": "pot"}).json()
    ids = {s["name"]: s["id"] for s in g["spaces"]}
    g = client.post("/api/crops/bulk", json={"crops": ["onions", "peas", "courgette", "basil", "carrots", "potatoes"]}).json()
    assert all(c["space_id"] is None for c in g["crops"])
    moves = client.get("/api/layout").json()["moves"]
    where = {next(c["plant_id"] for c in g["crops"] if c["id"] == m["crop_id"]): m["space_id"] for m in moves}
    assert where["basil"] == ids["Pots"]                       # pot-only plants go in pots
    assert where["onions"] != where["peas"]                     # bad neighbours kept apart
    assert {where["onions"], where["peas"]} <= {ids["Bed 1"], ids["Bed 2"], ids["Pots"]}
    assert all(c["space_id"] is None for c in client.get("/api/garden").json()["crops"])  # nothing saved yet
    g = client.post("/api/layout", json={"moves": [{"crop_id": m["crop_id"], "space_id": m["space_id"]} for m in moves]}).json()
    assert all(c["space_id"] is not None for c in g["crops"])


def test_built_bed_counts_as_built(client):
    _join(client)
    g = client.post("/api/spaces", json={"name": "Plot", "kind": "bed", "built": True}).json()
    assert g["spaces"][0]["built"] == 1 and "builder" in [b["id"] for b in g["new_badges"]]
