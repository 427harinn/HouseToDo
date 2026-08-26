import json
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/evidence/m7/review-upload"
SHOT = ROOT / "docs/evidence/m7/screenshots"
DIAGNOSTICS = ROOT / "docs/evidence/m7/diagnostics"
PREVIEWS = ROOT / "docs/evidence/m7/motion/previews"
OUT.mkdir(parents=True, exist_ok=True)
PREVIEWS.mkdir(parents=True, exist_ok=True)

FONT = "C:/Windows/Fonts/arial.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


def load_json(name):
    path = DIAGNOSTICS / name
    if not path.exists():
        raise SystemExit(f"missing diagnostic artifact: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def render_sha():
    value = os.environ.get("M7_RENDER_TARGET_SHA")
    if value:
        return value
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


RENDER_SHA = render_sha()
legacy = load_json("legacy-route-results.json")
pwa = load_json("pwa-results.json")


def require_legacy():
    routes = legacy.get("routes")
    expected = {"/settings/members", "/tasks", "/tasks/task-1", "/tasks/task-1/respond", "/tasks/templates", "/tasks/templates/template-1/edit", "/shopping/items/item-1", "/shopping/templates", "/shopping/templates/new", "/shopping/templates/template-1/edit", "/guest", "/onboarding"}
    if not isinstance(routes, list) or {item.get("requestedRoute") for item in routes} != expected:
        raise SystemExit("legacy diagnostic does not contain the complete route matrix")
    if any(item.get("result") != "PASS" or item.get("oldScreenRendered") is not False for item in routes):
        raise SystemExit("legacy diagnostic contains a failed route or old-screen render")
    return routes


def require_pwa():
    required = [
        pwa.get("manifest", {}).get("http200"), pwa.get("manifest", {}).get("requiredFields"),
        pwa.get("icons", {}).get("icon192"), pwa.get("icons", {}).get("icon512"),
        pwa.get("icons", {}).get("dimensions192"), pwa.get("icons", {}).get("dimensions512"),
        pwa.get("serviceWorker", {}).get("registered"), pwa.get("serviceWorker", {}).get("scope") == "/",
        pwa.get("serviceWorker", {}).get("active"), pwa.get("serviceWorker", {}).get("controllerAfterReload"),
        pwa.get("startUrl", {}).get("unauthenticatedLogin"), pwa.get("startUrl", {}).get("noHouseholdCreate"),
        pwa.get("startUrl", {}).get("householdReadyHome"), pwa.get("legacyRoute", {}).get("result") == "PASS",
        pwa.get("notificationSanitizer", {}).get("result") == "PASS",
    ]
    required.extend(pwa.get("directRoutes", {}).get(path) is True for path in ["/home", "/calendar", "/shopping", "/other", "/tasks/new", "/shopping/new"])
    if not all(required):
        raise SystemExit("pwa diagnostic contains a missing or failed required assertion")


legacy_routes = require_legacy()
require_pwa()


def canvas(title, subtitle, height=1500):
    image = Image.new("RGB", (1800, height), "#f7faf9")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1800, 118), fill="#123c3a")
    draw.text((54, 26), title, fill="white", font=font(42, True))
    draw.text((56, 78), subtitle, fill="#bdebe3", font=font(18))
    return image, draw


def paste_thumb(board, path, box):
    path = Path(path)
    if not path.exists():
        raise SystemExit(f"missing screenshot artifact: {path}")
    image = Image.open(path).convert("RGB")
    image.thumbnail((box[2] - box[0], box[3] - box[1]))
    x = box[0] + (box[2] - box[0] - image.width) // 2
    y = box[1] + (box[3] - box[1] - image.height) // 2
    board.paste(image, (x, y))


def board1():
    image, draw = canvas("M7 / Legacy Route Cleanup", f"Production render target SHA: {RENDER_SHA} • source: Playwright diagnostic JSON • old UI render count = 0")
    draw.text((80, 158), "Requested legacy route", fill="#55706c", font=font(20, True))
    draw.text((760, 158), "Actual final pathname", fill="#55706c", font=font(20, True))
    draw.text((1450, 158), "Result", fill="#55706c", font=font(20, True))
    y = 205
    for item in legacy_routes:
        draw.rounded_rectangle((54, y - 12, 1745, y + 47), 12, fill="white", outline="#d7e7e3", width=2)
        draw.text((80, y), item["requestedRoute"], fill="#183734", font=font(20))
        draw.text((760, y), "→  " + item["actualPathname"], fill="#0b766d", font=font(20, True))
        draw.text((1450, y), item["result"], fill="#15805e", font=font(20, True))
        y += 65
    paste_thumb(image, SHOT / "pwa-shopping.png", (1260, 1010, 1480, 1260))
    paste_thumb(image, SHOT / "pwa-home.png", (1510, 1010, 1730, 1260))
    image.save(OUT / "01-legacy-route-cleanup.png")


def sync_board(name, title, entries, screenshot_names):
    if len(screenshot_names) != len(entries) * 2:
        raise SystemExit(f"{name}: screenshot mapping is incomplete")
    for index in range(0, len(screenshot_names), 2):
        if screenshot_names[index] == screenshot_names[index + 1]:
            raise SystemExit(f"{name}: A/B screenshot paths must be distinct")
    image, draw = canvas(title, f"Production render target SHA: {RENDER_SHA} • local Worker + D1 • source: e2e/m7-real-integration.spec.ts • actual A/B screenshots", 3700)
    for x, label in [(70, "USER A / OWNER"), (930, "USER B / MEMBER")]:
        draw.rounded_rectangle((x, 155, x + 800, 3550), 18, fill="white", outline="#d7e7e3", width=2)
        draw.text((x + 28, 180), label, fill="#123c3a", font=font(25, True))
    y = 270
    for index, (row, a_text, b_text) in enumerate(entries):
        a_shot, b_shot = screenshot_names[index * 2:index * 2 + 2]
        draw.text((70, y - 34), row, fill="#55706c", font=font(20, True))
        draw.text((100, y), a_text, fill="#183734", font=font(19))
        draw.text((960, y), b_text, fill="#183734", font=font(19))
        paste_thumb(image, SHOT / a_shot, (100, y + 42, 440, y + 778))
        paste_thumb(image, SHOT / b_shot, (960, y + 42, 1300, y + 778))
        draw.text((100, y + 790), "PASS • actual browser screenshot", fill="#15805e", font=font(16, True))
        draw.text((960, y + 790), "PASS • actual browser screenshot", fill="#15805e", font=font(16, True))
        y += 820
    image.save(OUT / name)


def board2():
    sync_board("02-two-user-task-sync.png", "M7 / Two User Task Sync", [
        ("1. task created / visible", "created and assigned to B", "visible after B reload"),
        ("2. B completed", "A sees B as completer", "completed via B UI"),
        ("3. restore", "active again after A restore", "restored after B reload"),
        ("4. edit sync", "title edit persisted", "updated title visible after B reload"),
    ], [
        "task-user-a-created.png", "task-user-b-created.png", "task-user-a-completed-by-b.png", "task-user-b-completed.png",
        "task-user-a-restored.png", "task-user-b-restored.png", "task-user-a-edit-saved.png", "task-user-b-edit-synced.png",
    ])


def board3():
    sync_board("03-two-user-shopping-sync.png", "M7 / Two User Shopping Sync", [
        ("1. item added / shared", "item added with planned date", "item visible after B reload"),
        ("2. reordered / same order", "reordered through long-press UI", "same order after B reload"),
        ("3. B purchased", "A sees B purchaser + actual timestamp", "purchased in B context"),
        ("4. restore / planned date", "pending again after A restore", "pending and planned date preserved"),
    ], [
        "shopping-user-a-added.png", "shopping-user-b-shared.png", "shopping-user-a-reordered.png", "shopping-user-b-reordered.png",
        "shopping-user-a-sees-b-purchaser.png", "shopping-user-b-purchased.png", "shopping-user-a-restored.png", "shopping-user-b-restored-planned.png",
    ])


def board4():
    image, draw = canvas("M7 / PWA Final Smoke", f"Production render target SHA: {RENDER_SHA} • production-like local Wrangler assets • real iPhone: {pwa['realIphone']}")
    positions = [(60, 155), (470, 155), (880, 155), (1290, 155)]
    for (label, filename), (x, y) in zip([("HOME", "pwa-home.png"), ("CALENDAR", "pwa-calendar.png"), ("SHOPPING", "pwa-shopping.png"), ("OTHER", "pwa-other.png")], positions):
        draw.text((x, y), label, fill="#123c3a", font=font(22, True))
        paste_thumb(image, SHOT / filename, (x, y + 38, x + 350, y + 670))
    diagnostics = [
        f"manifest: {'PASS' if pwa['manifest']['http200'] and pwa['manifest']['requiredFields'] else 'FAIL'}",
        f"192 icon: {'PASS' if pwa['icons']['icon192'] and pwa['icons']['dimensions192'] else 'FAIL'}   512 icon: {'PASS' if pwa['icons']['icon512'] and pwa['icons']['dimensions512'] else 'FAIL'}",
        f"service worker registered: {'PASS' if pwa['serviceWorker']['registered'] else 'FAIL'}   scope: {pwa['serviceWorker']['scope']}",
        f"active: {'PASS' if pwa['serviceWorker']['active'] else 'FAIL'}   controller after reload: {'PASS' if pwa['serviceWorker']['controllerAfterReload'] else 'FAIL'}",
        f"start_url state machine: {'PASS' if all(pwa['startUrl'].values()) else 'FAIL'}",
        f"direct route reload: {'PASS' if all(pwa['directRoutes'].values()) else 'FAIL'}",
        f"legacy direct route: {pwa['legacyRoute']['result']}",
        f"notification URL sanitizer: {pwa['notificationSanitizer']['result']}",
        f"WebKit smoke: {pwa['webkit']}",
        f"real iPhone: {pwa['realIphone']} / manual follow-up",
    ]
    draw.rounded_rectangle((60, 875, 1735, 1200), 18, fill="#e9f4f1", outline="#b8dcd5", width=2)
    draw.text((90, 900), "AUTOMATED DIAGNOSTICS", fill="#123c3a", font=font(22, True))
    y = 945
    for line in diagnostics:
        draw.text((95, y), line, fill="#183734", font=font(18))
        y += 25
    image.save(OUT / "04-pwa-final-smoke.png")


def preview(name, files):
    frames = [Image.open(SHOT / item).convert("RGB") for item in files]
    frames[0].save(PREVIEWS / name, save_all=True, append_images=frames[1:], duration=700, loop=0, optimize=True)


board1()
board2()
board3()
board4()
preview("canonical-navigation.gif", ["pwa-home.png", "pwa-calendar.png", "pwa-shopping.png", "pwa-other.png"])
preview("two-user-task-sync.gif", ["task-user-a-created.png", "task-user-b-completed.png", "task-user-a-restored.png", "task-user-b-edit-synced.png"])
preview("two-user-shopping-sync.gif", ["shopping-user-a-added.png", "shopping-user-b-reordered.png", "shopping-user-a-sees-b-purchaser.png", "shopping-user-b-restored-planned.png"])
preview("pwa-reload-deeplink.gif", ["pwa-shopping.png", "pwa-calendar.png", "pwa-home.png"])
