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
    # take the beetroot out of its bed: it's no longer "already planned" anywhere
    beet_crop = next(c for c in g["crops"] if c["plant_id"] == "beetroot")
    client.patch("/api/crops/%d" % beet_crop["id"], json={"plant_id": "beetroot", "clear_space": True})
    check = client.get("/api/check", params={"plant_id": "beetroot", "space_id": b1, "method": "sow_out", "after": free}).json()
    assert check["already"] == []


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


def test_forgot_password_emails_a_one_time_link(client, monkeypatch):
    from app import auth, mail
    auth._failures.clear()
    sent = []
    monkeypatch.setattr(mail, "send", lambda to, subject, text: sent.append((to, text)) or True)
    monkeypatch.setenv("PUBLIC_URL", "https://grow.example")
    _join(client, "kid@example.com")
    client.post("/api/logout")
    # same answer whether or not the account exists, and no email goes to a stranger
    assert client.post("/api/forgot", json={"email": "nobody@example.com"}).json() == {"ok": True}
    assert sent == []
    assert client.post("/api/forgot", json={"email": " Kid@Example.com "}).json() == {"ok": True}
    assert len(sent) == 1 and sent[0][0] == "kid@example.com"
    link = next(w for w in sent[0][1].split() if w.startswith("https://grow.example/#/reset?token="))
    token = link.split("token=")[1]
    assert client.post("/api/reset", json={"token": token, "password": "fresh-password"}).status_code == 200
    assert client.post("/api/reset", json={"token": token, "password": "again-again"}).status_code == 400
    client.post("/api/logout")
    assert client.post("/api/login", json={"email": "kid@example.com", "password": "fresh-password"}).status_code == 200


def test_forgot_password_is_rate_limited(client, monkeypatch):
    from app import auth, mail
    auth._failures.clear()
    monkeypatch.setattr(mail, "send", lambda *a: True)
    codes = [client.post("/api/forgot", json={"email": "x@example.com"}).status_code for _ in range(auth.MAX_FAILURES + 1)]
    assert codes[:auth.MAX_FAILURES] == [200] * auth.MAX_FAILURES and codes[-1] == 429
    auth._failures.clear()


def test_email_not_configured_sends_nothing(monkeypatch):
    from app import mail
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert mail.send("a@b.co", "hi", "there") is False


def test_legal_pages(client, monkeypatch):
    monkeypatch.setenv("CONTACT_EMAIL", "hello@example.com")
    for path, words in [("/privacy", "Privacy Policy"), ("/terms", "Terms of Use"),
                        ("/affiliate-disclosure", "As an Amazon Associate we earn from qualifying purchases")]:
        r = client.get(path)
        assert r.status_code == 200 and words in r.text and "hello@example.com" in r.text


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


def test_take_a_crop_out_of_its_bed(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed"}).json()["spaces"][0]["id"]
    c = client.post("/api/crops", json={"plant_id": "peas", "space_id": sid}).json()["crops"][0]
    assert c["space_id"] == sid
    g = client.patch("/api/crops/%d" % c["id"], json={"plant_id": "peas", "clear_space": True}).json()
    assert g["crops"][0]["space_id"] is None


def test_invites_are_counted_and_joins_credited(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "boss@example.com")
    _join(client, "boss@example.com")
    first = client.post("/api/invites").json()
    second = client.post("/api/invites").json()
    assert second["sent"] == 2 and second["joined"] == 0 and "/#/join?invite=" in second["link"]
    token = second["link"].split("invite=")[1]
    assert client.get("/api/invites/" + token).json() == {"name": "Sam"}
    client.post("/api/logout")
    r = client.post("/api/register", json={"name": "Alex", "email": "alex@example.com", "password": "carrots-99",
                                           "age_ok": True, "invite": token})
    assert r.status_code == 200
    client.post("/api/logout")
    client.post("/api/register", json={"name": "Jo", "email": "jo@example.com", "password": "carrots-99", "age_ok": True})
    client.post("/api/logout")
    client.post("/api/login", json={"email": "boss@example.com", "password": "sunflower1"})
    mine = client.get("/api/invites").json()
    assert mine["sent"] == 2 and mine["joined"] == 1 and mine["people"][0]["name"] == "Alex"
    assert "ambassador" in [b["id"] for b in client.get("/api/garden").json()["new_badges"]]
    admin = client.get("/api/admin").json()
    assert admin["invites"] == {"sent": 2, "joined": 1}
    alex = next(u for u in admin["users"] if u["name"] == "Alex")
    assert alex["invited_by_name"] == "Sam"
    assert next(u for u in admin["users"] if u["name"] == "Sam")["invites_joined"] == 1


def test_admin_can_correct_who_invited_someone(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "boss@example.com")
    _join(client, "friend@example.com")
    client.post("/api/logout")
    _join(client, "boss@example.com")
    users = client.get("/api/admin").json()["users"]
    friend = next(u for u in users if u["email"] == "friend@example.com")
    boss = next(u for u in users if u["email"] == "boss@example.com")
    out = client.post("/api/admin/users/%d/invited_by" % friend["id"], json={"inviter_id": boss["id"]}).json()
    assert next(u for u in out["users"] if u["id"] == friend["id"])["invited_by_name"] == "Sam"
    assert next(u for u in out["users"] if u["id"] == boss["id"])["invites_joined"] == 1


def test_reset_my_garden_keeps_the_account(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed"}).json()["spaces"][0]["id"]
    client.post("/api/crops", json={"plant_id": "peas", "space_id": sid})
    client.post("/api/spaces/%d/position" % sid, json={"x": 3.2, "y": 1.5})
    assert client.post("/api/me/reset-garden", json={"password": "wrong-pw"}).status_code == 400
    g = client.post("/api/me/reset-garden", json={"password": "sunflower1"}).json()
    assert g["spaces"] == [] and g["crops"] == [] and not any(b["earned_on"] for b in g["badges"])
    assert client.get("/api/me").status_code == 200  # still logged in, same account


def test_bed_position_is_saved(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed"}).json()["spaces"][0]["id"]
    g = client.post("/api/spaces/%d/position" % sid, json={"x": 3.25, "y": 1.5}).json()
    assert (g["spaces"][0]["pos_x"], g["spaces"][0]["pos_y"]) == (3.25, 1.5)


def test_moving_one_bed_pins_the_others(client):
    _join(client)
    a = client.post("/api/spaces", json={"name": "A", "kind": "bed"}).json()["spaces"][0]["id"]
    b = client.post("/api/spaces", json={"name": "B", "kind": "bed"}).json()["spaces"][-1]["id"]
    g = client.post("/api/spaces/positions", json={"positions": [{"id": a, "x": 0.4, "y": 0.6}, {"id": b, "x": 3, "y": 0.6}]}).json()
    assert {(s["pos_x"], s["pos_y"]) for s in g["spaces"]} == {(0.4, 0.6), (3.0, 0.6)}


def test_fill_a_bed_and_what_to_buy():
    garlic, carrots, onions = (catalogue.BY_ID[x] for x in ("garlic", "carrots", "onions"))
    whole = planner.fill_quantity(garlic, 2.88, 1.0)          # a standard 1.2 x 2.4m bed
    assert whole == 64 and planner.fill_quantity(garlic, 2.88, 0.5) == 32
    assert planner.buy_estimate(garlic, whole, "sow_out")["text"] == "Buy about 7 bulbs"
    assert planner.buy_estimate(garlic, 8, "sow_out")["text"] == "Buy about 1 bulb"
    assert planner.buy_estimate(onions, 115, "sow_out")["text"] == "Buy about 2 bags of onion sets (250g each)"
    assert planner.buy_estimate(carrots, 288, "sow_out")["seeds"] == 576  # sow double: some don't come up, some get thinned
    assert planner.buy_estimate(carrots, 288, "plants")["text"] == "Buy 288 plants"


def test_page_asks_for_the_newest_script(client):
    page = client.get("/").text
    assert "/static/app.js?v=" in page and "/static/style.css?v=" in page


def test_garden_plan_size_features_and_turning(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed", "width_m": 1.2, "length_m": 3}).json()["spaces"][0]["id"]
    g = client.post("/api/garden/size", json={"w": 30, "h": 20}).json()
    assert (g["garden"]["w"], g["garden"]["h"]) == (30, 20)
    g = client.post("/api/features", json={"kind": "tree", "name": "Apple tree", "x": 5, "y": 2, "w": 3, "h": 3}).json()
    tree = g["garden"]["features"][0]
    assert tree["name"] == "Apple tree" and (tree["x"], tree["w"]) == (5, 3)
    g = client.post("/api/spaces/positions", json={"positions": [{"feature": tree["id"], "x": 12, "y": 9}, {"id": sid, "x": 2, "y": 1}]}).json()
    assert (g["garden"]["features"][0]["x"], g["spaces"][0]["pos_x"]) == (12, 2)
    g = client.post("/api/spaces/%d/turn" % sid).json()
    assert (g["spaces"][0]["width_m"], g["spaces"][0]["length_m"]) == (3, 1.2)
    g = client.delete("/api/features/%d" % tree["id"]).json()
    assert g["garden"]["features"] == []
    assert client.post("/api/features", json={"kind": "rocket"}).status_code == 400


def test_map_outline_keeps_shape_not_location(client):
    _join(client)
    # an L-shaped plot, as metres from wherever the first tap was (the browser does that sum)
    pts = [[100, 50], [130, 50], [130, 60], [115, 60], [115, 70], [100, 70]]
    g = client.post("/api/garden/shape", json={"points": pts}).json()["garden"]
    assert (g["w"], g["h"]) == (30, 20)
    assert g["shape"][0] == [0, 0] and [30, 10] in g["shape"]   # moved to its own top-left corner
    assert client.post("/api/garden/shape", json={"points": [[0, 0], [5, 5]]}).status_code == 400
    g = client.post("/api/garden/size", json={"w": 12, "h": 8}).json()["garden"]
    assert g["shape"] is None   # typing a size replaces the outline


def test_beds_and_features_can_sit_at_any_angle(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed"}).json()["spaces"][0]["id"]
    g = client.post("/api/spaces/positions", json={"positions": [{"id": sid, "x": 2, "y": 1, "angle": 377.5}]}).json()
    assert g["spaces"][0]["angle"] == 17.5
    g = client.post("/api/spaces/positions", json={"positions": [{"id": sid, "x": 3, "y": 1}]}).json()
    assert g["spaces"][0]["angle"] == 17.5 and g["spaces"][0]["pos_x"] == 3   # moving keeps the angle
    fid = client.post("/api/features", json={"kind": "path", "x": 1, "y": 1}).json()["garden"]["features"][0]["id"]
    assert client.patch("/api/features/%d" % fid, json={"angle": -30}).json()["garden"]["features"][0]["angle"] == -30
    assert client.get("/api/garden").json()["garden"]["path_w"] == 0.5
    assert client.post("/api/garden/paths", json={"w": 0.6}).json()["garden"]["path_w"] == 0.6


def test_new_bed_can_be_placed_and_angled(client):
    _join(client)
    g = client.post("/api/spaces", json={"name": "Bed 2", "kind": "bed", "width_m": 1.2, "length_m": 2.4,
                                         "pos_x": 3.1, "pos_y": 0.6, "angle": 20, "soil": "clay", "built": True}).json()
    s = g["spaces"][0]
    assert (s["pos_x"], s["pos_y"], s["angle"], s["soil"], s["built"]) == (3.1, 0.6, 20, "clay", 1)


def test_editing_the_outline_keeps_beds_in_place(client):
    _join(client)
    sid = client.post("/api/spaces", json={"name": "Bed", "kind": "bed", "pos_x": 3, "pos_y": 2}).json()["spaces"][0]["id"]
    client.post("/api/garden/shape", json={"points": [[0, 0], [10, 0], [10, 8], [0, 8]]})
    # drag the top-left corner up and left by 1m: the outline now starts at -1, -1
    g = client.post("/api/garden/shape", json={"points": [[-1, -1], [10, 0], [10, 8], [0, 8]], "keep_beds": True}).json()
    assert g["garden"]["shape"][0] == [0, 0] and (g["garden"]["w"], g["garden"]["h"]) == (11, 9)
    bed = g["spaces"][0]
    assert (bed["pos_x"], bed["pos_y"]) == (4, 3)   # moved with the outline, so it's in the same real spot


def test_group_and_ungroup(client):
    _join(client)
    a = client.post("/api/spaces", json={"name": "A", "kind": "bed"}).json()["spaces"][0]["id"]
    b = client.post("/api/spaces", json={"name": "B", "kind": "bed"}).json()["spaces"][-1]["id"]
    f = client.post("/api/features", json={"kind": "path"}).json()["garden"]["features"][0]["id"]
    assert client.post("/api/plan/group", json={"spaces": [a]}).status_code == 400
    g = client.post("/api/plan/group", json={"spaces": [a, b], "features": [f]}).json()
    grp = g["spaces"][0]["grp"]
    assert grp and all(s["grp"] == grp for s in g["spaces"]) and g["garden"]["features"][0]["grp"] == grp
    g = client.post("/api/plan/ungroup", json={"grp": grp}).json()
    assert all(s["grp"] is None for s in g["spaces"]) and g["garden"]["features"][0]["grp"] is None


def test_fruit_trees_and_bushes(client):
    _join(client)
    fruit = client.get("/api/plants").json()["fruit"]
    apple = next(f for f in fruit if f["id"] == "apple_eating")
    assert apple["kind"] == "tree" and 9 in apple["pick"] and "Gala" in apple["examples"]
    g = client.post("/api/features", json={"kind": "tree", "name": "Eating apple", "variety": "apple_eating", "w": 3, "h": 3}).json()
    tree = g["garden"]["features"][0]
    assert tree["variety"] == "apple_eating"
    assert client.post("/api/features", json={"kind": "bush", "variety": "apple_eating"}).status_code == 400  # no apple bushes
    g = client.patch("/api/features/%d" % tree["id"], json={"variety": "pear", "name": "Pear"}).json()
    assert g["garden"]["features"][0]["variety"] == "pear" and g["garden"]["features"][0]["name"] == "Pear"


def test_companions_and_flowers_are_kept_apart(client):
    _join(client)
    plants = client.get("/api/plants").json()["plants"]
    groups = {p["id"]: p["group"] for p in plants}
    assert groups["carrots"] == "veg" and groups["french_marigold"] == "companion" and groups["sunflower"] == "flower"
    toms = next(p for p in plants if p["id"] == "tomatoes")
    assert any(x["plant_id"] == "french_marigold" for x in toms["good_with"])
    bed = client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed", "width_m": 1.2, "length_m": 2.4}).json()["spaces"][0]["id"]
    # flowers flower (no eating or storing jobs), and an empty bed's suggestions are fruit & veg only
    g = client.post("/api/crops", json={"plant_id": "cosmos", "space_id": bed}).json()
    jobs = g["crops"][0]["jobs"]
    assert any(j["kind"] == "harvest" and "flowering" in j["title"] for j in jobs)
    for s in g["spaces"]:
        for x in (s["suggestion"] or {}).get("plants", []):
            assert groups[x["plant_id"]] == "veg"
    fruit = {f["id"] for f in client.get("/api/plants").json()["fruit"]}
    assert {"loganberry", "waldo"} <= fruit


def test_bed_shapes_and_flower_plans(client):
    _join(client)
    g = client.post("/api/spaces", json={"name": "Round bed", "kind": "bed", "width_m": 2, "length_m": 2,
                                         "shape": {"type": "circle"}, "sun": "shade"}).json()
    s = g["spaces"][0]
    assert s["shape"] == {"type": "circle"} and s["sun"] == "shade"
    assert s["usage"]["area"] == 3.14  # pi x 1 x 1
    # freeform: corners in metres inside its box
    g = client.patch("/api/spaces/%d" % s["id"], json={"name": "Round bed", "kind": "bed", "width_m": 2, "length_m": 2,
                                                       "shape": {"type": "free", "pts": [[0, 0], [2, 0], [0, 2]]}}).json()
    assert g["spaces"][0]["usage"]["area"] == 2.0 and g["spaces"][0]["sun"] == "shade"  # sun kept when not sent
    assert client.patch("/api/spaces/%d" % s["id"], json={"name": "x", "kind": "bed", "shape": {"type": "free", "pts": [[0, 0]]}}).status_code == 400
    client.patch("/api/spaces/%d" % s["id"], json={"name": "Round bed", "kind": "bed", "width_m": 2, "length_m": 2, "shape": {"type": "circle"}})
    plan = client.get("/api/spaces/%d/flowers" % s["id"]).json()
    assert plan["sun"] == "shade" and plan["shape"] == "circle"
    shady = next(c for c in plan["combos"] if c["id"] == "shade")
    assert [z["zone"] for z in shady["zones"]][0] == "centre"  # tall ones in the middle of a round bed
    assert all(c["id"] not in ("bees", "cutting") for c in plan["combos"])  # sun-lovers aren't offered for shade
    border = client.get("/api/spaces/%d/flowers?sun=sun" % s["id"]).json()
    assert any(c["id"] == "bees" for c in border["combos"])
    # add a whole group to the bed at once
    adds = [{"plant_id": p["plant_id"], "quantity": p["qty"]} for z in shady["zones"] for p in z["plants"]]
    g = client.post("/api/crops/bulk", json={"crops": adds, "space_id": s["id"]}).json()
    assert len([c for c in g["crops"] if c["space_id"] == s["id"]]) == len(adds)


def test_herbs_mixes_and_varieties(client):
    _join(client)
    cat = client.get("/api/plants").json()
    groups = {p["id"]: p["group"] for p in cat["plants"]}
    assert groups["basil"] == "herb" and groups["parsley"] == "herb" and groups["carrots"] == "veg"
    assert sum(1 for g in groups.values() if g == "flower") == 50
    carrots = next(p for p in cat["plants"] if p["id"] == "carrots")
    assert "row_markers" in carrots["mixes"] and carrots["seedling"]
    nantes = next(v for v in carrots["varieties"] if v["name"] == "Nantes 2")
    assert len(nantes["links"]) == 3 and "Nantes" in nantes["links"][0]["url"]
    mix = next(m for m in cat["mixes"] if m["id"] == "row_markers")
    assert [x["plant_id"] for x in sorted(mix["plants"], key=lambda x: x["ready"])] == ["radish", "salad", "carrots"]
    apple = next(f for f in cat["fruit"] if f["id"] == "apple_eating")
    assert any(k["name"] == "Gala" for k in apple["kinds"])
    # a crop remembers its variety; a fruit tree remembers which apple it is
    g = client.post("/api/crops", json={"plant_id": "carrots", "variety": "Nantes 2"}).json()
    c = g["crops"][0]
    assert c["variety"] == "Nantes 2"
    g = client.patch("/api/crops/%d" % c["id"], json={"plant_id": "carrots", "variety": "Flyaway"}).json()
    assert g["crops"][0]["variety"] == "Flyaway"
    tree = client.post("/api/features", json={"kind": "tree", "variety": "apple_eating"}).json()["garden"]["features"][0]
    g = client.patch("/api/features/%d" % tree["id"], json={"cultivar": "Gala"}).json()
    assert g["garden"]["features"][0]["cultivar"] == "Gala"


def test_costs_and_more_companions(client):
    _join(client)
    plants = {p["id"]: p for p in client.get("/api/plants").json()["plants"]}
    assert plants["sunflower"]["helps"] and any(x["plant_id"] == "sunflower" for x in plants["sweetcorn"]["good_with"])
    assert any(x["plant_id"] == "sunflower" for x in plants["potatoes"]["bad_with"])
    bed = client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed"}).json()["spaces"][0]["id"]
    client.post("/api/crops", json={"plant_id": "carrots", "space_id": bed, "quantity": 30, "batches": 3, "every_weeks": 2})
    g = client.post("/api/crops", json={"plant_id": "tomatoes", "space_id": bed, "quantity": 4, "method": "plants"}).json()
    toms = next(c for c in g["crops"] if c["plant_id"] == "tomatoes")
    assert toms["cost"]["total"] == 10.0 and toms["cost_options"]["sow_in"] == 3.5  # 4 plants at £2.50, or one packet
    space = next(s for s in g["spaces"] if s["id"] == bed)
    assert space["cost"]["total"] == 12.5  # three rows of carrots share one packet: 90 carrots x2 spare = 180 seeds < 1000
    # bulbs are bought by the bag, not "as plants"
    g = client.post("/api/crops", json={"plant_id": "tulip", "space_id": bed, "quantity": 30}).json()
    tulips = next(c for c in g["crops"] if c["plant_id"] == "tulip")
    assert tulips["cost"]["what"] == "bags of bulbs" and tulips["cost"]["total"] == 15.0
    plan = client.get("/api/spaces/%d/flowers?sun=sun" % bed).json()
    assert all(c["cost"] > 0 for c in plan["combos"])


def test_every_plant_and_fruit_has_a_photo_with_credit(client):
    import os
    cat = client.get("/api/plants").json()
    root = os.path.join(os.path.dirname(__file__), "..")
    for item in cat["plants"] + [f for f in cat["fruit"] if not f.get("plain")]:
        ph = item["photo"]
        assert ph and ph["page"].startswith("https://commons.wikimedia.org/"), item["id"]
        assert os.path.getsize(os.path.join(root, ph["src"].lstrip("/"))) > 2000, item["id"]


def test_seed_saving(client):
    _join(client)
    plants = {p["id"]: p for p in client.get("/api/plants").json()["plants"]}
    assert plants["peas"]["save"]["ease"] == "easy" and plants["carrots"]["save"]["kind"] == "biennial"
    assert plants["potatoes"]["save"]["ease"] == "no" and plants["strawberries"]["save"]["how"] == "new plants"
    g = client.post("/api/crops", json={"plant_id": "peas"}).json()
    assert any(j["kind"] == "seeds" for j in g["crops"][0]["jobs"])
    g = client.post("/api/crops", json={"plant_id": "carrots"}).json()
    assert not any(j["kind"] == "seeds" for j in next(c for c in g["crops"] if c["plant_id"] == "carrots")["jobs"])


def test_pot_sizes_and_overwintering(client):
    _join(client)
    cat = client.get("/api/plants").json()
    assert any(z["key"] == "p30" for z in cat["pot_sizes"])
    plants = {p["id"]: p for p in cat["plants"]}
    assert plants["tomatoes"]["pot_fits"]["growbag"] == 3 and plants["tomatoes"]["pot_fits"]["p20"] == 0
    assert plants["potatoes"]["pot_fits"]["sack"] == 3 and plants["chillies"]["overwinter"]
    g = client.post("/api/spaces", json={"name": "Patio pots", "kind": "pot", "pot_size": "p30", "pot_count": 3}).json()
    pots = g["spaces"][0]
    assert pots["pot_size"] == "p30" and pots["pot_count"] == 3 and pots["usage"]["unit"] == "pots" and pots["usage"]["area"] == 3
    g = client.post("/api/crops", json={"plant_id": "chillies", "space_id": pots["id"], "quantity": 2, "method": "plants"}).json()
    assert g["spaces"][0]["usage"]["peak"] == 2.0  # one chilli per 30cm pot
    chilli = g["crops"][0]
    assert any(j["kind"] == "overwinter" for j in chilli["jobs"])
    check = client.get("/api/check", params={"plant_id": "courgette", "space_id": pots["id"], "quantity": 1}).json()
    assert check["space"]["fits"] is False  # a courgette needs a much bigger pot
    # two chillies won't fit in one big tub (one each) - so that's blocked; two tubs are fine
    assert client.patch("/api/spaces/%d" % pots["id"], json={"name": "Patio pots", "kind": "pot", "pot_size": "p50", "pot_count": 1}).status_code == 409
    g = client.patch("/api/spaces/%d" % pots["id"], json={"name": "Patio pots", "kind": "pot", "pot_size": "p50", "pot_count": 2}).json()
    assert g["spaces"][0]["pot_size"] == "p50" and g["spaces"][0]["usage"]["area"] == 2


def test_spring_wake_up_after_overwintering(client):
    _join(client)
    g = client.post("/api/crops", json={"plant_id": "chillies", "method": "plants"}).json()
    chilli = g["crops"][0]
    assert not any(j["key"].endswith(":wake") for j in chilli["jobs"])  # only once it's been brought in
    winter = next(j for j in chilli["jobs"] if j["key"].endswith(":winter"))
    client.post("/api/done", json={"key": winter["key"]})
    g = client.get("/api/garden").json()
    wake = next(j for j in g["crops"][0]["jobs"] if j["key"].endswith(":wake"))
    assert wake["title"] == "Wake up your overwintered chillies" and wake["start"][5:7] == "03"
    assert int(wake["start"][:4]) == int(winter["start"][:4]) + 1


def test_every_kind_of_job_can_be_ticked(client):
    _join(client)
    for pid in ("peas", "chillies", "tomatoes", "garlic", "carrots", "sweet_pea", "dahlia"):
        client.post("/api/crops", json={"plant_id": pid})
    g = client.get("/api/garden").json()
    for c in g["crops"]:
        for j in c["jobs"]:
            if j["action"] == "batch":
                continue
            assert client.post("/api/done", json={"key": j["key"]}).status_code == 200, j["key"]


def test_the_app_tells_phones_when_a_new_version_is_live(client):
    page = client.get("/")
    version = client.get("/api/version").json()["version"]
    assert 'name="app-version" content="%s"' % version in page.text
    assert "/static/app.js?v=%s" % version in page.text and page.headers["cache-control"] == "no-cache"
    assert client.get("/health").headers["x-app-version"] == version


def test_sown_together_stays_one_planting(client):
    _join(client)
    bed = client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed", "width_m": 2, "length_m": 2}).json()["spaces"][0]["id"]
    bed2 = client.post("/api/spaces", json={"name": "Bed 2", "kind": "bed"}).json()["spaces"][-1]["id"]
    trio = [{"plant_id": "sweetcorn", "quantity": 4}, {"plant_id": "french_beans", "quantity": 4}, {"plant_id": "squash", "quantity": 1}]
    g = client.post("/api/crops/bulk", json={"crops": trio, "space_id": bed, "mix": "three_sisters"}).json()
    crops = [c for c in g["crops"] if c["space_id"] == bed]
    assert len(crops) == 3 and {c["mix"] for c in crops} == {"three_sisters"} and len({c["mixgrp"] for c in crops}) == 1
    # they share one patch: the biggest footprint, not all three added up
    use = next(s for s in g["spaces"] if s["id"] == bed)["usage"]
    assert use["peak"] == 1.5  # the squash (1.5 m²) - not squash + sweetcorn (0.81) + beans (0.18)
    # moving one moves them all; taking one out takes them all out
    g = client.patch("/api/crops/%d" % crops[1]["id"], json={"plant_id": "french_beans", "space_id": bed2}).json()
    assert {c["space_id"] for c in g["crops"] if c["mix"]} == {bed2}
    # removing the whole planting
    g = client.delete("/api/crops/%d?whole_group=true" % crops[0]["id"]).json()
    assert not g["crops"]
    # split up: separate crops again
    g = client.post("/api/crops/bulk", json={"crops": trio, "space_id": bed, "mix": "three_sisters"}).json()
    first = g["crops"][0]
    g = client.patch("/api/crops/%d" % first["id"], json={"plant_id": first["plant_id"], "ungroup": True}).json()
    assert not any(c["mix"] for c in g["crops"])


def test_flower_groups_stay_together_but_take_their_own_room(client):
    _join(client)
    cat = client.get("/api/plants").json()
    assert len(cat["mixes"]) >= 12 and len(cat["combos"]) >= 16
    bed = client.post("/api/spaces", json={"name": "Border", "kind": "bed", "width_m": 1, "length_m": 4}).json()["spaces"][0]["id"]
    g = client.post("/api/crops/bulk", json={"crops": [{"plant_id": "cosmos", "quantity": 5}, {"plant_id": "cornflower", "quantity": 8}],
                                            "space_id": bed, "mix": "flower:bees"}).json()
    crops = [c for c in g["crops"] if c["space_id"] == bed]
    assert {c["mix"] for c in crops} == {"flower:bees"} and len({c["mixgrp"] for c in crops}) == 1
    # flowers in a group grow side by side, so their room adds up (unlike veg sown into the same patch)
    use = next(s for s in g["spaces"] if s["id"] == bed)["usage"]
    assert use["peak"] == round(5 * 0.16 + 8 * 0.0625, 2)
    assert client.post("/api/crops/bulk", json={"crops": ["radish", "salad"], "mix": "made-up"}).json()["crops"][-1]["mix"] is None


def test_flower_plan_can_fill_part_of_a_bed(client):
    _join(client)
    bed = client.post("/api/spaces", json={"name": "Border", "kind": "bed", "width_m": 1, "length_m": 4}).json()["spaces"][0]["id"]
    whole = client.get("/api/spaces/%d/flowers?sun=sun" % bed).json()
    half = client.get("/api/spaces/%d/flowers?sun=sun&fill=0.5" % bed).json()
    count = lambda plan: sum(x["qty"] for z in plan["combos"][0]["zones"] for x in z["plants"])
    assert count(half) < count(whole) and half["area"] == whole["area"] / 2
    # basil can go in a bed as well as a pot, so tomatoes, basil & marigolds can be planted in a bed
    assert "bed" in next(p for p in client.get("/api/plants").json()["plants"] if p["id"] == "basil")["where"]


def test_ongoing_jobs_come_back_each_month(client):
    _join(client)
    g = client.post("/api/crops", json={"plant_id": "garlic"}).json()
    weeding = [j for j in g["crops"][0]["jobs"] if j["title"].startswith("Pull out weeds")]
    assert len(weeding) == 4  # 16 weeks of weeding = a reminder every 4 weeks
    assert all(a["end"] <= b["start"] for a, b in zip(weeding, weeding[1:]))
    # ticking one leaves the next one waiting
    assert client.post("/api/done", json={"key": weeding[0]["key"]}).status_code == 200
    jobs = client.get("/api/garden").json()["crops"][0]["jobs"]
    status = {j["key"]: j["status"] for j in jobs}
    assert status[weeding[0]["key"]] == "done" and status[weeding[1]["key"]] != "done"


def test_next_weeding_is_four_weeks_after_you_did_it(client, monkeypatch):
    from datetime import date as _d
    from app import clock
    _join(client)
    g = client.post("/api/crops", json={"plant_id": "garlic"}).json()
    first = [j for j in g["crops"][0]["jobs"] if j["title"].startswith("Pull out weeds")][0]
    late = _d.fromisoformat(first["start"]) + __import__("datetime").timedelta(days=10)  # weeded 10 days late
    monkeypatch.setattr(clock, "today", lambda: late)
    client.post("/api/done", json={"key": first["key"]})
    jobs = [j for j in client.get("/api/garden").json()["crops"][0]["jobs"] if j["title"].startswith("Pull out weeds")]
    assert jobs[1]["start"] == (late + __import__("datetime").timedelta(weeks=4)).isoformat()


# ---- bed capacity ----------------------------------------------------------------------------------------
def _bed(client, w=1.0, l=1.0, name="Bed 1"):
    return [s for s in client.post("/api/spaces", json={"name": name, "kind": "bed", "width_m": w, "length_m": l}).json()["spaces"] if s["name"] == name][0]["id"]


def test_capacity_maths_and_the_ten_percent_boundary():
    from datetime import date
    from app import planner, plants as cat
    bed = {"id": 1, "kind": "bed", "width_m": 1.0, "length_m": 1.0}
    lettuce = cat.BY_ID["salad"]  # 10 x 20cm = 0.02 m2 each: 50 fill a square metre
    crop, jobs = planner.trial_crop(lettuce, "sow_out", 1, 50, date(2027, 3, 1), 0)
    assert planner.room_for(bed, [], crop, jobs) == 50
    assert planner.room_for(bed, [], crop, jobs, planner.OVERFILL_TOLERANCE) == 55
    full = lambda n: planner.capacity(bed, [(dict(crop, quantity=n), jobs)])
    assert full(50)["status"] == "ok"              # exactly 100%
    assert full(55)["status"] == "tight"           # 110%: allowed, with a warning
    assert full(56)["status"] == "over"            # 112%: blocked
    empty = planner.capacity(bed, [])
    assert not planner.blocks(empty, full(55)) and planner.blocks(empty, full(56))
    # tidying a bed that's already over is never blocked
    assert not planner.blocks(full(80), full(70))


def test_capacity_is_time_aware():
    from datetime import date
    from app import planner, plants as cat
    bed = {"id": 1, "kind": "bed", "width_m": 1.0, "length_m": 1.0}
    radish, garlic = cat.BY_ID["radish"], cat.BY_ID["garlic"]
    early, ej = planner.trial_crop(radish, "sow_out", 1, 220, date(2027, 3, 20), 0)   # fills the bed in spring
    late, lj = planner.trial_crop(garlic, "sow_out", 1, 20, date(2027, 3, 20), 0)     # goes in the autumn
    assert planner.capacity(bed, [(early, ej)])["pct"] >= 0.99
    assert planner.room_for(bed, [(early, ej)], late, lj) >= 20  # no overlap: the radishes are long gone


def test_every_way_of_adding_is_checked(client):
    _join(client)
    bed = _bed(client)                                   # 1 m2
    ok = client.post("/api/crops", json={"plant_id": "salad", "space_id": bed, "quantity": 30, "method": "sow_out"})
    assert ok.status_code == 200
    too_many = client.post("/api/crops", json={"plant_id": "salad", "space_id": bed, "quantity": 40, "method": "sow_out"})
    assert too_many.status_code == 409
    d = too_many.json()["detail"]
    assert "No room" in d["message"] and d["options"]["fewer"] == 20
    # a group added in one go
    assert client.post("/api/crops/bulk", json={"crops": [{"plant_id": "courgette", "quantity": 3}], "space_id": bed}).status_code == 409
    # more of what's there
    c = client.get("/api/garden").json()["crops"][0]
    assert client.patch("/api/crops/%d" % c["id"], json={"plant_id": "salad", "quantity": 80}).status_code == 409
    assert client.post("/api/crops/quantities", json={"items": [{"id": c["id"], "quantity": 80}]}).status_code == 409
    # moving something big into it
    other = _bed(client, 3, 3, "Big bed")
    g = client.post("/api/crops", json={"plant_id": "courgette", "space_id": other, "quantity": 3}).json()
    courgettes = next(x for x in g["crops"] if x["plant_id"] == "courgette")
    assert client.patch("/api/crops/%d" % courgettes["id"], json={"plant_id": "courgette", "space_id": bed}).status_code == 409
    # agreeing to a layout that would overflow it
    assert client.post("/api/layout", json={"moves": [{"crop_id": courgettes["id"], "space_id": bed}]}).status_code == 409
    # making the bed smaller
    assert client.patch("/api/spaces/%d" % bed, json={"name": "Bed 1", "kind": "bed", "width_m": 0.5, "length_m": 0.5}).status_code == 409
    # nothing changed by the blocked attempts
    g = client.get("/api/garden").json()
    assert [x["quantity"] for x in g["crops"] if x["space_id"] == bed] == [30]
    assert next(s for s in g["spaces"] if s["id"] == bed)["width_m"] == 1.0


def test_a_little_over_is_allowed_with_a_warning(client):
    _join(client)
    bed = _bed(client)
    check = client.get("/api/check", params={"plant_id": "salad", "space_id": bed, "quantity": 54, "method": "sow_out"}).json()
    assert check["capacity"]["status"] == "tight" and not check["capacity"]["blocked"]
    assert check["capacity"]["room"] == 50 and check["capacity"]["limit"] == 55
    assert client.post("/api/crops", json={"plant_id": "salad", "space_id": bed, "quantity": 54, "method": "sow_out"}).status_code == 200


def test_no_room_offers_other_beds_and_a_later_start(client):
    _join(client)
    small = _bed(client, 1, 1, "Small")
    big = _bed(client, 2, 2, "Roomy")
    client.post("/api/crops", json={"plant_id": "radish", "space_id": small, "quantity": 220, "method": "sow_out"})
    check = client.get("/api/check", params={"plant_id": "salad", "space_id": small, "quantity": 20, "method": "sow_out"}).json()
    opts = check["capacity"]["options"]
    assert check["capacity"]["blocked"] and opts["beds"][0]["name"] == "Roomy" and opts["beds"][0]["fits"] >= 20
    # or sow it later, once the radishes are cleared - still inside the lettuce's own season
    assert opts["later"] and opts["later"]["goes_in"] >= opts["later"]["after"]



def test_start_indoors_goes_in_when_the_bed_frees_up():
    from datetime import date
    from app import planner, plants as cat
    bed = {"id": 1, "kind": "bed", "width_m": 1.0, "length_m": 1.0}
    today = date(2026, 10, 13)
    radish, jobs = planner.trial_crop(cat.BY_ID["radish"], "sow_out", 1, 220, today, 0)
    radish.update(id=5, sown_on="2027-04-20", harvested_on="2027-05-20")   # fills the bed until 10 June
    jobs = planner.crop_jobs(radish, 0, set(), today)
    fit = planner.earliest_fit(bed, [(radish, jobs)], cat.BY_ID["courgette"], "sow_in", 1, today, 0)
    assert fit == {"after": "2027-06-10", "goes_in": "2027-06-10"}   # sown indoors in May, out the day there's room
    # lettuce's indoor season (to 10 April) is over by then, so that isn't offered - sowing later outside is
    assert planner.earliest_fit(bed, [(radish, jobs)], cat.BY_ID["salad"], "sow_in", 20, today, 0) is None
    assert planner.earliest_fit(bed, [(radish, jobs)], cat.BY_ID["salad"], "sow_out", 20, today, 0)["goes_in"] == "2027-06-10"


# ---- onboarding ----------------------------------------------------------------------------------------
def test_quiz_answers_are_saved_checked_and_can_be_skipped(client):
    me = _join(client)
    assert me["onboarding"] is None                       # a new user: the app sends them to the quiz
    p = client.patch("/api/me/onboarding", json={"changes": {"experience": "beginner", "space": "pots", "goals": ["herbs_flowers", "nope"],
                                                             "time": "lots"}}).json()
    assert p["experience"] == "beginner" and p["space"] == "pots" and p["goals"] == ["herbs_flowers"] and p["time"] is None
    p = client.patch("/api/me/onboarding", json={"changes": {"skip": True, "skippedAt": "2026-10-13"}}).json()
    assert p["time"] == "moderate" and p["experience"] == "beginner" and p["skippedAt"]   # answered stays, the rest defaults
    assert client.get("/api/me").json()["onboarding"]["space"] == "pots"


def test_tour_path_follows_the_space_and_experience_changes_it(client):
    from app import onboarding as ob
    assert [ob.path_for({"space": s}) for s in ("pots", "small", "medium", "large")] == ["A", "B", "C", "C"]
    assert ob.path_for(None) == "B"                        # skipped: a small garden
    some = ob.tour({"space": "small", "experience": "some"})
    assert some["path"] == "B" and len(some["steps"]) == 6 and not any("why" in s for s in some["steps"])
    beginner = ob.tour({"space": "small", "experience": "beginner"})
    assert all(s.get("why") for s in beginner["steps"][:-1])  # plain-English "why this matters" on each step
    confident = ob.tour({"space": "large", "experience": "confident"})
    assert confident["path"] == "C" and len(confident["steps"]) == 5   # 3 steps, the advanced pointer, the checklist
    assert ob.tour({"space": "pots"}, path="C")["path"] == "C"         # replaying a different path from Help
    _ = client


def test_starter_plan_suits_the_month_space_and_time(monkeypatch):
    from datetime import date
    from app import onboarding as ob, plants as cat
    october = date(2026, 10, 13)
    plan = ob.starter_plan({"space": "small", "goals": ["veg"], "time": "moderate"}, october, 0)
    ids = [x["plant_id"] for x in plan]
    assert 3 <= len(plan) <= 5 and ({"garlic", "broad_beans", "onions"} & set(ids))   # autumn planting
    assert all(x["from"] <= "2027-03-01" for x in plan[:3])
    pots = ob.starter_plan({"space": "pots", "goals": ["veg", "herbs_flowers"], "time": "minimal"}, october, 0)
    assert len(pots) <= 3 and all("pot" in cat.BY_ID[x["plant_id"]]["where"] and cat.BY_ID[x["plant_id"]]["level"] == 1 for x in pots)
    kids = ob.starter_plan({"space": "medium", "goals": ["kids"], "time": "plenty"}, date(2027, 4, 1), 0)
    assert kids and all(x["plant_id"] in ob.KID_FAVOURITES for x in kids)


def test_sample_gardens_load_and_clear_without_touching_real_data(client, monkeypatch):
    from datetime import date
    from app import clock
    monkeypatch.setattr(clock, "today", lambda: date(2026, 7, 1))
    _join(client)
    mine = _bed(client, 1.2, 2.4, "My bed")
    client.post("/api/crops", json={"plant_id": "radish", "space_id": mine, "quantity": 10})
    g = client.post("/api/sample", json={"kind": "B"}).json()
    samples = [s for s in g["spaces"] if s["is_sample"]]
    assert len(samples) == 4 and g["has_sample"]
    # dates are worked out from today: carrots sown 50 days ago
    carrots = next(c for c in g["crops"] if c["is_sample"] and c["plant_id"] == "carrots")
    assert carrots["sown_on"] == "2026-05-12"
    # Bed 2 is a deliberate squeeze: warned about, not blocked
    from app import planner
    bed2 = next(s for s in samples if s["name"] == "Bed 2")
    assert 1.0 < bed2["usage"]["peak"] / bed2["usage"]["area"] <= 1.1
    # the checklist only counts the user's own garden; samples never earn badges
    assert g["checklist"] == {"firstCrop": True, "firstBed": True, "reminders": False}
    # an allotment sample sets the plot size, rotation groups on the beds - and clearing puts things back
    g = client.post("/api/sample", json={"kind": "C"}).json()
    assert g["garden"]["w"] == 10 and g["garden"]["h"] == 20 and len(g["garden"]["features"]) == 4
    assert sorted(s["rotation"] for s in g["spaces"] if s["is_sample"] and s["rotation"] is not None) == [0, 1, 2, 3, 4]
    assert not any(s["name"] == "Bed 2" for s in g["spaces"])           # loading one sample replaces the other
    g = client.delete("/api/sample").json()
    assert [s["name"] for s in g["spaces"]] == ["My bed"] and [c["plant_id"] for c in g["crops"]] == ["radish"]
    assert g["garden"]["w"] is None and not g["garden"]["features"] and not g["has_sample"]


def test_samples_are_left_out_of_alerts_and_the_calendar_feed(client):
    _join(client)
    client.post("/api/sample", json={"kind": "A"})
    me = client.get("/api/me").json()
    feed = client.get(me["calendar_path"]).text
    assert "tomatoes" not in feed.lower() and "chillies" not in feed.lower()


def test_tour_steps_show_how_with_moving_demos():
    from app import onboarding as ob
    for space, clips in (("small", {"real_map", "sat_veg"}), ("pots", {"pot_fit", "add_veg", "real_map"}), ("large", {"real_map", "sat_veg"})):
        assert {s.get("clip") for s in ob.tour({"space": space})["steps"]} >= clips


def test_starter_plan_puts_food_before_flowers():
    from datetime import date
    from app import onboarding, plants as catalogue
    flower = lambda pid: catalogue.BY_ID[pid]["group"] in ("flower", "companion")
    for day in (date(2026, 10, 13), date(2026, 4, 1)):
        mixed = onboarding.starter_plan({"goals": ["veg", "herbs_flowers"], "space": "small"}, day, 0)
        ids = [x["plant_id"] for x in mixed]
        assert sum(flower(i) for i in ids) <= 1 and not flower(ids[0])
        only = onboarding.starter_plan({"goals": ["herbs_flowers"], "space": "small"}, day, 0)
        assert any(flower(x["plant_id"]) for x in only)  # still flowers when that's all they asked for


def test_build_it_guides_have_everything(client):
    from app import builds, plants as catalogue
    data = client.get("/api/plants").json()["build"]
    ids = [b["id"] for b in data["builds"]]
    assert ids == ["raised_bed", "bean_wigwam", "sweet_pea_wigwam", "bean_aframe", "pea_frame", "broad_bean_string", "tomato_stakes", "tomato_strings", "hoop_tunnel", "bottle_cloche", "cold_frame", "staging", "compost_bin", "water_butt"]
    for b in data["builds"]:
        assert b["steps"] and b["tools"] and b["materials"] and b["why"]
        assert all(st["check"] for st in b["steps"]), b["id"]  # a "check before moving on" line for every step
        assert all(p in catalogue.BY_ID for p in b["for"]) and (b["for"] or b.get("good_for"))
        assert [s["pic"] for s in b["steps"]] == list(range(1, len(b["steps"]) + 1))  # a picture for every step
        for m in b["materials"]:
            for item in m.get("choose") or [m]:
                assert item.get("free") or item["links"], item
    by_id = {b["id"]: b for b in data["builds"]}
    assert by_id["bottle_cloche"]["total"] == 0 and by_id["cold_frame"]["total"] > 40
    shops_used = {l["shop"] for b in data["builds"] for m in b["materials"] for l in m.get("links", [])}
    assert {"B&Q", "Wickes", "Suttons", "Thompson & Morgan", "Amazon"} <= shops_used
    assert any("diy.com/search?term=" in l["url"] for l in by_id["cold_frame"]["materials"][0]["links"])


def test_build_it_links_each_plant_to_the_right_structures(client):
    """Supports only for plants that need holding up, covers only for ones with pests to keep off, the cold frame
    only for things you start indoors, and nothing that isn't about one plant (a raised bed, a water butt) on a plant."""
    from app import planner, plants as catalogue
    builds = {b["id"]: b for b in client.get("/api/plants").json()["build"]["builds"]}
    by_role = lambda role: [b for b in builds.values() if b["role"] == role]
    for b in by_role("bed") + by_role("garden"):
        assert b["for"] == [], b["id"]
    # every plant that has a 'put in supports' job has a support guide, and every support guide's plant needs one
    for pid, prep in catalogue.PREP.items():
        assert any(pid in b["for"] for b in by_role("support")), pid
    for b in by_role("support"):
        for pid in b["for"]:
            assert pid in catalogue.PREP or pid in b["notes"], (b["id"], pid)
    assert [b["id"] for b in by_role("support") if "broad_beans" in b["for"]] == ["broad_bean_string"]
    for b in by_role("protect"):
        for pid in b["for"]:
            assert catalogue.BY_ID[pid]["pests"]["cover"], (b["id"], pid)
    for pid in builds["cold_frame"]["for"]:
        assert "sow_in" in planner.methods_for(catalogue.BY_ID[pid]), pid
    assert {"kale", "broccoli", "sweet_pea", "tomatoes"} <= set(builds["cold_frame"]["for"])


def test_onion_and_garlic_check_comes_back_until_they_have_rooted():
    """'Push any that have popped out back in' comes back 4 days after each tick, one at a time, and stops once
    they've had 4 weeks to root."""
    from datetime import date, timedelta
    from app import planner
    sown = date(2026, 10, 10)
    crop = {"id": 1, "plant_id": "garlic", "method": "sow_out", "anchor": "2026-10-01", "anchor_end": "2026-11-30",
            "sown_on": sown.isoformat(), "planted_on": None, "harvested_on": None, "space_id": None}
    checks = lambda done, today: [j for j in planner.crop_jobs(crop, 0, done, today) if j["key"].startswith("c1:care0")]
    first = checks({}, date(2026, 10, 12))
    assert len(first) == 1 and first[0]["start"] == "2026-10-10"
    # ticked on the 14th: the next one's due on the 18th, and it's the only one still to do
    later = checks({"c1:care0": "2026-10-14"}, date(2026, 10, 14))
    assert [j["status"] for j in later][0] == "done" and later[1]["start"] == "2026-10-18" and len(later) == 2
    # keep ticking every 4 days: it stops 4 weeks after sowing, by 7 November
    done, day = {}, sown
    for n in range(20):
        open_ = [j for j in checks(done, day) if j["status"] != "done"]
        if not open_:
            break
        day = date.fromisoformat(open_[0]["start"]) + timedelta(days=1)
        done[open_[0]["key"]] = day.isoformat()
    assert not [j for j in checks(done, day) if j["status"] != "done"]
    assert max(date.fromisoformat(j["start"]) for j in checks(done, day)) < sown + timedelta(weeks=4)


def _winter_crop(plant_id, method="sow_out", **kw):
    crop = {"id": 1, "plant_id": plant_id, "method": method, "anchor": "2026-10-01", "anchor_end": "2026-11-30",
            "sown_on": "2026-10-10", "planted_on": None, "harvested_on": None, "space_id": None}
    return dict(crop, **kw)


def test_winter_jobs_for_the_garden_and_fruit():
    from datetime import date
    from app import winter
    today = date(2026, 10, 25)
    bed = {"id": 1, "kind": "bed"}
    apple = {"id": 7, "kind": "tree", "variety": "apple_eating", "cultivar": "Gala"}
    plum = {"id": 8, "kind": "tree", "variety": "plum", "cultivar": None}
    jobs = {j["key"]: j for j in winter.garden_jobs([bed], [apple, plum], [], {}, today, 0)}
    assert {"g:beds:2026", "g:water:2026", "g:tools:2026", "g:plan:2026", "g:prune7:2026", "g:bare:2026"} <= set(jobs)
    assert "g:snow:2026" not in jobs  # nothing under cover to knock the snow off
    assert "g:prune8:2026" not in jobs  # plums are only pruned in summer
    assert "g:clean:2027" not in jobs and not any(j["key"].startswith("g:clean") for j in jobs.values())  # no pots or greenhouse
    assert all(j["crop_id"] is None and j["steps"] for j in jobs.values())
    assert jobs["g:beds:2026"]["start"] == "2026-11-01" and jobs["g:prune7:2026"]["title"].startswith("Prune your gala")
    # a pot or a greenhouse brings the clean-up job; ticking this year's doesn't tick next year's
    assert any(j["key"].startswith("g:clean") for j in winter.garden_jobs([{"id": 2, "kind": "pot"}], [], [], {}, today, 0))
    ticked = {j["key"]: j for j in winter.garden_jobs([bed], [], [], {"g:beds:2026": "2026-11-03"}, date(2026, 12, 20), 0)}
    assert "g:beds:2027" in ticked and ticked["g:beds:2027"]["status"] == "later"
    assert any(j["key"] == "g:snow:2026" for j in winter.garden_jobs([bed], [], [_winter_crop("kale")], {}, today, 0))
    assert any(j["key"] == "g:snow:2026" for j in winter.garden_jobs([bed], [{"id": 3, "kind": "greenhouse"}], [], {}, today, 0))
    assert not winter.garden_jobs([], [], [], {}, today, 0)  # nothing planned, nothing to do


def test_winter_jobs_for_particular_crops():
    from datetime import date
    from app import planner
    today = date(2026, 10, 25)
    jobs = lambda crop, done=None, t=today: {j["key"]: j for j in planner.crop_jobs(crop, 0, done or {}, t)}
    assert "c1:firm" in jobs(_winter_crop("garlic"))  # garlic planted in October is in the ground that winter
    assert "c1:firm" not in jobs(_winter_crop("garlic", anchor="2027-03-01", anchor_end="2027-03-31", sown_on="2027-03-05"))  # lifted before then
    rhubarb = _winter_crop("rhubarb", "plants", planted_on="2026-10-10", sown_on=None)
    assert {"c1:mulch", "c1:force"} <= set(jobs(rhubarb))
    assert "c1:tidy" in jobs(_winter_crop("strawberries", "plants", planted_on="2026-09-01", sown_on=None, anchor="2026-09-01"))
    assert "c1:mulch" in jobs(_winter_crop("blueberries", "plants", planted_on="2026-10-10", sown_on=None))
    # seed potatoes are chitted before planting - and the job goes once they're in the ground
    potatoes = _winter_crop("potatoes", anchor="2027-03-20", anchor_end="2027-04-20", sown_on=None)
    chit = jobs(potatoes)["c1:chit"]
    assert chit["start"] == "2027-02-06" and chit["status"] != "done"
    assert jobs(dict(potatoes, sown_on="2027-03-22"))["c1:chit"]["status"] == "done"


def test_stored_crops_are_checked_for_rot_until_used():
    from datetime import date, timedelta
    from app import planner
    harvested = date(2026, 8, 1)
    onions = _winter_crop("onions", harvested_on=harvested.isoformat())
    rot = lambda done, t: [j for j in planner.crop_jobs(onions, 0, done, t) if j["key"].startswith("c1:rot")]
    first = rot({}, date(2026, 9, 1))
    assert len(first) == 1 and first[0]["start"] == "2026-08-22"
    after = rot({"c1:rot": "2026-08-30"}, date(2026, 9, 1))
    assert [j["key"] for j in after] == ["c1:rot", "c1:rot_1"] and after[1]["start"] == "2026-09-27"
    carrots = planner.crop_jobs(_winter_crop("carrots", harvested_on="2026-08-01"), 0, {}, date(2026, 9, 1))
    assert not [j for j in carrots if j["key"].startswith("c1:rot")]  # only things that go into store


def test_winter_jobs_reach_the_app_and_can_be_ticked(client):
    _join(client)
    assert client.post("/api/spaces", json={"name": "Bed 1", "kind": "bed", "width_m": 1.2, "length_m": 2.4}).status_code in (200, 201)
    garden = client.get("/api/garden").json()
    keys = [j["key"] for j in garden["garden_jobs"]]
    beds = next(k for k in keys if k.startswith("g:beds:"))
    assert client.post("/api/done", json={"key": beds}).status_code == 200
    again = {j["key"]: j["status"] for j in client.get("/api/garden").json()["garden_jobs"]}
    assert again[beds] == "done"
    assert client.post("/api/done", json={"key": beds, "undo": True}).status_code == 200
    assert client.post("/api/done", json={"key": "g:evil;drop:2026"}).status_code == 400
    assert client.post("/api/done", json={"key": "c1:firm"}).status_code in (404, 403, 400)  # not someone else's crop
