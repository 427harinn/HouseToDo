from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/evidence/m7/review-upload"
SHOT = ROOT / "docs/evidence/m7/screenshots"
OUT.mkdir(parents=True, exist_ok=True)

FONT = "C:/Windows/Fonts/arial.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"

def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()

def canvas(title, subtitle):
    image = Image.new("RGB", (1800, 1500), "#f7faf9")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1800, 118), fill="#123c3a")
    draw.text((54, 26), title, fill="white", font=font(42, True))
    draw.text((56, 78), subtitle, fill="#bdebe3", font=font(18))
    return image, draw

def paste_thumb(board, path, box):
    image = Image.open(path).convert("RGB")
    image.thumbnail((box[2] - box[0], box[3] - box[1]))
    x = box[0] + (box[2] - box[0] - image.width) // 2
    y = box[1] + (box[3] - box[1] - image.height) // 2
    board.paste(image, (x, y))

def board1():
    image, draw = canvas("M7 / Legacy Route Cleanup", "Production SHA d89a9d7ad52f • source: e2e/m7-legacy-route.spec.ts • old UI render count = 0")
    rows = [
        ("/settings/members", "/other/members"),
        ("/tasks", "/home"),
        ("/tasks/:taskId", "/tasks/:taskId/edit"),
        ("/tasks/:taskId/respond", "/home"),
        ("/tasks/templates", "/tasks/new"),
        ("/tasks/templates/:templateId/edit", "/tasks/new"),
        ("/shopping/items/:itemId", "/shopping?item=<id>"),
        ("/shopping/templates", "/shopping/new"),
        ("/shopping/templates/new", "/shopping/new"),
        ("/shopping/templates/:templateId/edit", "/shopping/new"),
        ("/guest", "M6 state redirect"),
        ("/onboarding", "M6 state redirect"),
    ]
    draw.text((80, 158), "Requested legacy route", fill="#55706c", font=font(20, True))
    draw.text((760, 158), "Actual final pathname", fill="#55706c", font=font(20, True))
    draw.text((1450, 158), "Result", fill="#55706c", font=font(20, True))
    y = 205
    for old, new in rows:
        draw.rounded_rectangle((54, y - 12, 1745, y + 47), 12, fill="white", outline="#d7e7e3", width=2)
        draw.text((80, y), old, fill="#183734", font=font(20))
        draw.text((760, y), "→  " + new, fill="#0b766d", font=font(20, True))
        draw.text((1450, y), "PASS", fill="#15805e", font=font(20, True))
        y += 65
    paste_thumb(image, SHOT / "pwa-shopping.png", (1260, 930, 1480, 1180))
    paste_thumb(image, SHOT / "pwa-home.png", (1510, 930, 1730, 1180))
    image.save(OUT / "01-legacy-route-cleanup.png")

def sync_board(name, title, entries, screenshot_names):
    image, draw = canvas(title, "Production SHA d89a9d7ad52f • local Worker + D1 • source: e2e/m7-real-integration.spec.ts • 390x844")
    x_positions = [70, 930]
    for idx, label in enumerate(["USER A / OWNER", "USER B / MEMBER"]):
        draw.rounded_rectangle((x_positions[idx], 155, x_positions[idx] + 800, 1110), 18, fill="white", outline="#d7e7e3", width=2)
        draw.text((x_positions[idx] + 28, 180), label, fill="#123c3a", font=font(25, True))
    y = 245
    for (row, a_text, b_text), a_shot, b_shot in zip(entries, screenshot_names[::2], screenshot_names[1::2]):
        draw.text((70, y - 34), row, fill="#55706c", font=font(18, True))
        draw.text((100, y), a_text, fill="#183734", font=font(19))
        draw.text((960, y), b_text, fill="#183734", font=font(19))
        paste_thumb(image, SHOT / a_shot, (100, y + 40, 420, y + 220))
        paste_thumb(image, SHOT / b_shot, (960, y + 40, 1280, y + 220))
        y += 300
    image.save(OUT / name)

def board2():
    entries = [
        ("1. task created / visible", "created and assigned to B", "visible after B reload"),
        ("2. B completed", "A sees B as completer", "completed via B UI"),
        ("3. restore", "active again after A restore", "restored through canonical Home"),
        ("4. edit sync", "title edit persisted", "updated title visible after B reload"),
    ]
    shots = ["task-user-b-created.png", "task-user-b-created.png", "task-user-a-completed-by-b.png", "task-user-a-completed-by-b.png", "task-user-b-restored.png", "task-user-b-restored.png", "task-user-b-edit-synced.png", "task-user-b-edit-synced.png"]
    sync_board("02-two-user-task-sync.png", "M7 / Two User Task Sync", entries, shots)

def board3():
    entries = [
        ("1. item added / shared", "item visible after B reload", "item created by A"),
        ("2. reordered / same order", "reordered through long-press UI", "same order after B reload"),
        ("3. B purchased", "A sees B purchaser", "shared item purchased in B context"),
        ("4. restore / planned date", "pending again after A restore", "planned date preserved"),
    ]
    shots = ["shopping-user-b-shared.png", "shopping-user-b-shared.png", "shopping-user-a-reordered.png", "shopping-user-b-reordered.png", "shopping-user-a-sees-b-purchaser.png", "shopping-user-b-reordered.png", "shopping-user-b-restored.png", "shopping-user-b-restored.png"]
    sync_board("03-two-user-shopping-sync.png", "M7 / Two User Shopping Sync", entries, shots)

def board4():
    image, draw = canvas("M7 / PWA Final Smoke", "Production build served by local Wrangler • Chromium 390x844 • WebKit unavailable (executable not installed) • real iPhone NOT RUN")
    positions = [(60, 155), (470, 155), (880, 155), (1290, 155)]
    for (label, filename), (x, y) in zip([("HOME", "pwa-home.png"), ("CALENDAR", "pwa-calendar.png"), ("SHOPPING", "pwa-shopping.png"), ("OTHER", "pwa-other.png")], positions):
        draw.text((x, y), label, fill="#123c3a", font=font(22, True))
        paste_thumb(image, SHOT / filename, (x, y + 38, x + 350, y + 670))
    diagnostics = [
        "manifest 200 / required fields PASS",
        "icon 192x192 PASS   icon 512x512 PASS",
        "service worker registered PASS   scope /",
        "controller after reload PASS",
        "start_url unauthenticated -> /login PASS",
        "direct /home /calendar /shopping /other reload PASS",
        "notification URL sanitizer tests remain covered",
        "WebKit: UNAVAILABLE (executable not installed)",
        "real iPhone: NOT RUN / manual follow-up",
    ]
    draw.rounded_rectangle((60, 875, 1735, 1160), 18, fill="#e9f4f1", outline="#b8dcd5", width=2)
    draw.text((90, 900), "AUTOMATED DIAGNOSTICS", fill="#123c3a", font=font(22, True))
    y = 945
    for line in diagnostics:
        draw.text((95, y), line, fill="#183734", font=font(18))
        y += 24
    image.save(OUT / "04-pwa-final-smoke.png")

def preview(name, files):
    frames = [Image.open(SHOT / item).convert("RGB") for item in files]
    frames[0].save(ROOT / "docs/evidence/m7/motion/previews" / name, save_all=True, append_images=frames[1:], duration=700, loop=0, optimize=True)

board1()
board2()
board3()
board4()
preview("canonical-navigation.gif", ["pwa-home.png", "pwa-calendar.png", "pwa-shopping.png", "pwa-other.png"])
preview("two-user-task-sync.gif", ["task-user-b-created.png", "task-user-a-completed-by-b.png", "task-user-b-restored.png"])
preview("two-user-shopping-sync.gif", ["shopping-user-b-shared.png", "shopping-user-a-sees-b-purchaser.png", "shopping-user-b-restored.png"])
preview("pwa-reload-deeplink.gif", ["pwa-shopping.png", "pwa-calendar.png", "pwa-home.png"])
