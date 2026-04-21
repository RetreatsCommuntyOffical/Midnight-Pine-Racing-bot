# -*- coding: utf-8 -*-
"""
Midnight Pine Racing - Assetto Corsa Python HUD

Phase 6 (HUD): score/combo/speed/drift live in-game overlay.
Phase 7 (Routes): route and official-run state shown in HUD.
"""

from __future__ import division

import json
import os
import threading
import time

try:
    import ac  # type: ignore
except Exception:
    ac = None

try:
    import acsys  # type: ignore
except Exception:
    acsys = None

try:
    import ConfigParser as configparser
except Exception:
    import configparser

try:
    import urllib2 as urllib_request
except Exception:
    import urllib.request as urllib_request

APP_NAME = "Midnight Pine HUD"
APP_KEY = "midnight_pine_hud"

_DEFAULT_CONFIG = {
    "telemetry_url": "http://127.0.0.1:3000/api/telemetry",
    "poll_interval_ms": 150,
    "timeout_ms": 700,
    "speed_alpha": 0.35,
}

_runtime_lock = threading.Lock()
_runtime_running = False
_runtime_thread = None
_runtime_last_ok = 0.0
_runtime_last_err = ""
_runtime_data = {
    "status": "offline",
    "source": "none",
    "speed": 0.0,
    "rpm": 0.0,
    "gear": "N",
    "score": 0,
    "combo": 1.0,
    "maxCombo": 1.0,
    "driftScore": 0,
    "avgSpeed": 0,
    "clean": True,
    "route": "None",
    "positionX": 0.0,
    "positionZ": 0.0,
    "run": {
        "active": False,
        "status": "IDLE",
        "official": False,
        "durationSec": 0,
    },
}

_ui = {
    "app": None,
    "labels": {},
    "last_paint": 0.0,
    "smoothed_speed": 0.0,
    "cfg": dict(_DEFAULT_CONFIG),
}


def _log(msg):
    line = "[{}] {}".format(APP_KEY, msg)
    if ac is not None:
        try:
            ac.log(line)
            return
        except Exception:
            pass
    print(line)


def _safe_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _read_config():
    cfg = dict(_DEFAULT_CONFIG)
    here = os.path.dirname(os.path.abspath(__file__))
    ini_path = os.path.join(here, "settings.ini")
    if not os.path.exists(ini_path):
        return cfg

    parser = configparser.ConfigParser()
    try:
        parser.read(ini_path)
    except Exception as exc:
        _log("settings.ini parse failed: {}".format(exc))
        return cfg

    if parser.has_option("telemetry", "url"):
        cfg["telemetry_url"] = parser.get("telemetry", "url").strip() or cfg["telemetry_url"]

    if parser.has_option("telemetry", "poll_interval_ms"):
        cfg["poll_interval_ms"] = max(60, _safe_int(parser.get("telemetry", "poll_interval_ms"), 150))

    if parser.has_option("telemetry", "timeout_ms"):
        cfg["timeout_ms"] = max(200, _safe_int(parser.get("telemetry", "timeout_ms"), 700))

    if parser.has_option("smoothing", "speed_alpha"):
        alpha = _safe_float(parser.get("smoothing", "speed_alpha"), 0.35)
        cfg["speed_alpha"] = max(0.05, min(1.0, alpha))

    return cfg


def _fetch_json(url, timeout_sec):
    req = urllib_request.Request(url)
    try:
        req.add_header("Accept", "application/json")
    except Exception:
        pass

    res = urllib_request.urlopen(req, timeout=timeout_sec)
    raw = res.read()
    if not isinstance(raw, str):
        raw = raw.decode("utf-8", "ignore")
    return json.loads(raw)


def _normalize_payload(payload):
    run = payload.get("run") or {}
    return {
        "status": str(payload.get("status", "offline")),
        "source": str(payload.get("source", "none")),
        "speed": _safe_float(payload.get("speed", 0.0), 0.0),
        "rpm": _safe_float(payload.get("rpm", 0.0), 0.0),
        "gear": str(payload.get("gear", "N")),
        "score": _safe_int(payload.get("score", 0), 0),
        "combo": _safe_float(payload.get("combo", 1.0), 1.0),
        "maxCombo": _safe_float(payload.get("maxCombo", 1.0), 1.0),
        "driftScore": _safe_int(payload.get("driftScore", 0), 0),
        "avgSpeed": _safe_int(payload.get("avgSpeed", 0), 0),
        "clean": bool(payload.get("clean", True)),
        "route": str(payload.get("route", "None")),
        "positionX": _safe_float(payload.get("positionX", 0.0), 0.0),
        "positionZ": _safe_float(payload.get("positionZ", 0.0), 0.0),
        "run": {
            "active": bool(run.get("active", False)),
            "status": str(run.get("status", "IDLE")),
            "official": bool(run.get("official", False)),
            "durationSec": _safe_int(run.get("durationSec", 0), 0),
        },
    }


def _poll_worker():
    global _runtime_last_ok
    global _runtime_last_err

    cfg = _ui["cfg"]
    url = cfg["telemetry_url"]
    timeout_sec = max(0.2, cfg["timeout_ms"] / 1000.0)
    sleep_sec = max(0.06, cfg["poll_interval_ms"] / 1000.0)

    _log("poll worker online: {}".format(url))

    while _runtime_running:
        start = time.time()
        try:
            payload = _fetch_json(url, timeout_sec)
            norm = _normalize_payload(payload)
            with _runtime_lock:
                _runtime_data.update(norm)
                _runtime_last_ok = time.time()
                _runtime_last_err = ""
        except Exception as exc:
            with _runtime_lock:
                _runtime_data["status"] = "offline"
                _runtime_last_err = str(exc)

        elapsed = time.time() - start
        remaining = sleep_sec - elapsed
        if remaining > 0:
            time.sleep(remaining)

    _log("poll worker offline")


def _set_text(key, text):
    label = _ui["labels"].get(key)
    if label is None or ac is None:
        return
    try:
        ac.setText(label, text)
    except Exception:
        pass


def _set_color(key, r, g, b, a=1.0):
    label = _ui["labels"].get(key)
    if label is None or ac is None:
        return
    try:
        ac.setFontColor(label, r, g, b, a)
    except Exception:
        pass


def _fmt_time(seconds):
    s = max(0, int(seconds))
    m = s // 60
    s2 = s % 60
    return "{:02d}:{:02d}".format(m, s2)


def _paint(now):
    with _runtime_lock:
        data = dict(_runtime_data)
        run = dict(_runtime_data.get("run") or {})
        last_ok = _runtime_last_ok
        last_err = _runtime_last_err

    speed = _safe_float(data.get("speed", 0.0), 0.0)
    alpha = _ui["cfg"].get("speed_alpha", 0.35)
    _ui["smoothed_speed"] = (_ui["smoothed_speed"] * (1.0 - alpha)) + (speed * alpha)

    stale = (now - last_ok) > 2.0
    online = (str(data.get("status", "offline")).lower() == "online") and not stale

    status_text = "ONLINE" if online else "OFFLINE"
    source_text = str(data.get("source", "none")).upper()
    _set_text("status", "STATUS: {} ({})".format(status_text, source_text))

    if online:
        _set_color("status", 0.2, 0.95, 0.35, 1.0)
    else:
        _set_color("status", 0.95, 0.25, 0.25, 1.0)

    route_name = str(data.get("route", "None"))
    _set_text("route", "ROUTE: {}".format(route_name))

    official = bool(run.get("official", False))
    run_state = str(run.get("status", "IDLE")).upper()
    run_badge = "OFFICIAL" if official else "UNOFFICIAL"
    _set_text("run", "RUN: {} [{}]".format(run_state, run_badge))
    _set_text("timer", "TIME: {}".format(_fmt_time(run.get("durationSec", 0))))

    _set_text("score", "SCORE: {:,}".format(max(0, _safe_int(data.get("score", 0), 0))))
    _set_text("combo", "COMBO: x{:.2f}  (MAX x{:.2f})".format(
        max(1.0, _safe_float(data.get("combo", 1.0), 1.0)),
        max(1.0, _safe_float(data.get("maxCombo", 1.0), 1.0)),
    ))

    _set_text("drift", "DRIFT: {:,}".format(max(0, _safe_int(data.get("driftScore", 0), 0))))
    _set_text("speed", "SPEED: {:03d} km/h".format(max(0, _safe_int(_ui["smoothed_speed"], 0))))
    _set_text("rpm", "RPM: {:,}".format(max(0, _safe_int(data.get("rpm", 0), 0))))
    _set_text("gear", "GEAR: {}".format(str(data.get("gear", "N"))))

    clean = bool(data.get("clean", True))
    _set_text("clean", "CLEAN: {}".format("YES" if clean else "NO"))
    _set_color("clean", 0.25, 0.92, 0.35, 1.0) if clean else _set_color("clean", 0.95, 0.3, 0.3, 1.0)

    _set_text("avg", "AVG SPEED: {} km/h".format(max(0, _safe_int(data.get("avgSpeed", 0), 0))))

    px = _safe_float(data.get("positionX", 0.0), 0.0)
    pz = _safe_float(data.get("positionZ", 0.0), 0.0)
    _set_text("pos", "POS: X {:.1f}  Z {:.1f}".format(px, pz))

    if not online and last_err:
        err = last_err
        if len(err) > 52:
            err = err[:49] + "..."
        _set_text("error", "LINK: {}".format(err))
    else:
        _set_text("error", "LINK: OK")


def _create_label(key, text, x, y, scale=14):
    if ac is None:
        return None
    label = ac.addLabel(_ui["app"], text)
    ac.setPosition(label, x, y)
    ac.setFontSize(label, scale)
    return label


def acMain(ac_version):
    global _runtime_running
    global _runtime_thread

    _ui["cfg"] = _read_config()

    if ac is None:
        return APP_NAME

    app = ac.newApp(APP_NAME)
    _ui["app"] = app

    ac.setSize(app, 430, 338)
    ac.setTitle(app, "MIDNIGHT PINE | LIVE HUD")

    _ui["labels"]["status"] = _create_label("status", "STATUS: BOOTING", 16, 34, 15)
    _ui["labels"]["route"] = _create_label("route", "ROUTE: None", 16, 58, 14)
    _ui["labels"]["run"] = _create_label("run", "RUN: IDLE [UNOFFICIAL]", 16, 82, 14)
    _ui["labels"]["timer"] = _create_label("timer", "TIME: 00:00", 16, 104, 14)

    _ui["labels"]["score"] = _create_label("score", "SCORE: 0", 16, 132, 17)
    _ui["labels"]["combo"] = _create_label("combo", "COMBO: x1.00  (MAX x1.00)", 16, 158, 15)
    _ui["labels"]["drift"] = _create_label("drift", "DRIFT: 0", 16, 182, 14)

    _ui["labels"]["speed"] = _create_label("speed", "SPEED: 000 km/h", 16, 208, 18)
    _ui["labels"]["rpm"] = _create_label("rpm", "RPM: 0", 16, 236, 14)
    _ui["labels"]["gear"] = _create_label("gear", "GEAR: N", 220, 236, 14)

    _ui["labels"]["clean"] = _create_label("clean", "CLEAN: YES", 16, 260, 14)
    _ui["labels"]["avg"] = _create_label("avg", "AVG SPEED: 0 km/h", 140, 260, 14)
    _ui["labels"]["pos"] = _create_label("pos", "POS: X 0.0  Z 0.0", 16, 284, 14)
    _ui["labels"]["error"] = _create_label("error", "LINK: waiting", 16, 308, 12)

    _runtime_running = True
    _runtime_thread = threading.Thread(target=_poll_worker)
    _runtime_thread.daemon = True
    _runtime_thread.start()

    _log("acMain ready")
    return APP_NAME


def acUpdate(delta_t):
    if ac is None:
        return 0

    now = time.time()
    if now - _ui["last_paint"] < 0.05:
        return 0

    _ui["last_paint"] = now
    _paint(now)
    return 0


def acShutdown():
    global _runtime_running
    _runtime_running = False
    _log("shutdown")
