from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/m8a"
DIAG = EVIDENCE / "diagnostics"
BOARDS = EVIDENCE / "screenshots"
PREVIEWS = EVIDENCE / "motion/previews"


def font(size: int, bold: bool = False):
    names = [
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for name in names:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


F_TITLE = font(34, True)
F_SUB = font(18)
F_HEAD = font(15, True)
F_BODY = font(13)
F_SMALL = font(11)


def text(draw, xy, value, fill="#17312f", f=F_BODY):
    draw.text(xy, str(value), font=f, fill=fill)


def board(title: str, subtitle: str, width=1800, height=1200):
    image = Image.new("RGB", (width, height), "#f5f8f6")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width, 92), fill="#123c3a")
    text(draw, (36, 22), title, "#ffffff", F_TITLE)
    text(draw, (38, 68), subtitle, "#cfe5df", F_SUB)
    return image, draw


def save(image: Image.Image, name: str):
    BOARDS.mkdir(parents=True, exist_ok=True)
    image.save(BOARDS / name)


api = json.loads((DIAG / "api-reachability.json").read_text(encoding="utf-8"))
cleanup = json.loads((DIAG / "cleanup-result.json").read_text(encoding="utf-8"))
schema = json.loads((DIAG / "schema-snapshot.json").read_text(encoding="utf-8"))
contracts = json.loads((DIAG / "contract-results.json").read_text(encoding="utf-8"))


# Board 1: every row comes from api-reachability.json.
rows = sorted(api["routes"], key=lambda r: (r["canonicalFeature"], r["method"], r["path"]))
groups = {
    "Task": ("Task", "Task"),
    "Task Template": ("Task Template", "Task Template"),
    "Shopping": ("Shopping", "Shopping"),
    "Shopping Template": ("Shopping Template", "Shopping Template"),
}
def group_for(row):
    feature = row["canonicalFeature"]
    if "Shopping Template" in feature:
        return "Shopping Template"
    if "Shopping" in feature or row["path"].startswith("/api/shopping"):
        return "Shopping"
    if "Task Template" in feature or "task-template" in row["path"]:
        return "Task Template"
    if "Task" in feature or row["path"].startswith("/api/tasks"):
        return "Task"
    return "Other"

img, draw = board(
    "01 · API Reachability",
    f"base {api['productionBaseSha'][:12]}  ·  implementation {api['implementationSha'][:12]}  ·  source diagnostics/api-reachability.json",
    height=max(1200, 150 + len(rows) * 20),
)
cols = [(36, 92), (120, 282), (315, 585), (615, 850), (880, 1060), (1085, 1275), (1300, 1480), (1500, 1760)]
headers = ["Group", "Method / Endpoint", "Canonical caller", "Internal caller", "Verdict", "Final", "Handler", "Reason"]
for (x1, x2), h in zip(cols, headers):
    draw.rectangle((x1, 112, x2, 140), fill="#d9e9e4")
    text(draw, (x1 + 5, 119), h, "#17312f", F_HEAD)
for index, row in enumerate(rows):
    y = 146 + index * 20
    if index % 2 == 0:
        draw.rectangle((30, y - 2, 1770, y + 17), fill="#ffffff")
    verdict = row["verdict"]
    color = "#19734d" if verdict.startswith("KEEP") else "#a46b00" if verdict.startswith("DEFER") else "#a52b2b"
    values = [group_for(row), f"{row['method']} {row['path']}", ", ".join(row["frontendCaller"]) or "—", ", ".join(row["internalWorkerCaller"]) or "—", verdict, row["finalStatus"], row["routeHandler"], row["reason"] or "—"]
    for (x1, _), value in zip(cols, values):
        text(draw, (x1 + 5, y), value, color if value == verdict else "#17312f", F_SMALL)
save(img, "01-api-reachability.png")


# Board 2: counts and lists are derived from cleanup-result.json.
img, draw = board(
    "02 · Backend Cleanup Diff",
    f"source diagnostics/cleanup-result.json  ·  base {cleanup['productionBaseSha'][:12]}  ·  implementation {cleanup['implementationSha'][:12]}",
    height=1300,
)
route_count = cleanup["routeCount"]
text(draw, (50, 135), f"Public routes  Before {route_count['before']}   After {route_count['after']}   Removed {route_count['removed']}   Kept {route_count['kept']}", "#123c3a", F_HEAD)
sections = [
    ("Removed frontend wrappers", cleanup["removedFrontendWrappers"]),
    ("Removed service/repository methods", cleanup["removedInternalMethods"]),
    ("Removed Worker routes / handlers / tests", cleanup["removedWorkerRoutes"] + cleanup["removedRouteHandlers"] + cleanup["removedTests"]),
]
y = 190
for heading, items in sections:
    text(draw, (50, y), heading, "#123c3a", F_HEAD)
    y += 28
    if not items:
        text(draw, (70, y), "None — no route was proven dead against the external-consumer uncertainty rule.", "#a46b00", F_BODY)
        y += 24
    for item in items:
        value = item if isinstance(item, str) else item.get("name") or item.get("symbol")
        text(draw, (70, y), f"• {value}", "#17312f", F_BODY)
        y += 22
    y += 16
text(draw, (50, y), "Kept intentionally", "#123c3a", F_HEAD)
y += 28
for group, values in cleanup["intentionallyKept"].items():
    text(draw, (70, y), f"{group}: {', '.join(values) if isinstance(values, list) else values}", "#19734d", F_BODY)
    y += 22
save(img, "02-backend-cleanup.png")


# Board 3: statuses are read from contract-results.json.
img, draw = board("03 · Contract Regression", "source diagnostics/contract-results.json  ·  actual command/test outcomes", height=900)
y = 142
for item in contracts["checks"]:
    status = item["status"]
    color = "#19734d" if status == "PASS" else "#a46b00" if status in {"NOT_APPLICABLE", "SKIPPED"} else "#a52b2b"
    draw.rounded_rectangle((55, y, 1745, y + 54), radius=8, fill="#ffffff", outline="#d5e3df")
    text(draw, (78, y + 16), item["name"], "#17312f", F_HEAD)
    text(draw, (430, y + 16), status, color, F_HEAD)
    text(draw, (650, y + 16), item["evidence"], "#17312f", F_BODY)
    y += 64
save(img, "03-contract-regression.png")


# Board 4: schema/migration facts and M8B inventory are direct JSON fields.
img, draw = board(
    "04 · Data Safety / M8B Inventory",
    f"source diagnostics/schema-snapshot.json + api-reachability.json  ·  migration hash {schema['migrationHash'][:16]}",
    height=1250,
)
facts = [
    f"Migration files changed: {schema['migrationFilesChanged']}",
    f"New migration: {len(schema['newMigrationFiles'])}",
    f"DB schema diff: {schema['schemaDiff']}",
    f"Remote migration: {schema['remoteMigration']}",
    f"Deploy: {schema['deploy']}",
    f"M8B candidate count: {len(api['m8bCandidates'])}",
]
for i, value in enumerate(facts):
    text(draw, (55 + (i % 3) * 575, 138 + (i // 3) * 34), value, "#19734d" if value.endswith("0") or value.endswith("NOT RUN") else "#17312f", F_HEAD)
y = 230
for candidate in api["m8bCandidates"]:
    text(draw, (55, y), candidate["candidate"], "#17312f", F_HEAD)
    text(draw, (80, y + 22), f"reader: {candidate['currentReader']}  ·  writer: {candidate['currentWriter']}", "#17312f", F_SMALL)
    text(draw, (80, y + 40), f"risk: {candidate['risk']}  ·  action: {candidate['recommendedAction']}", "#a46b00" if "DEFER" in candidate["recommendedAction"] else "#19734d", F_SMALL)
    y += 78
save(img, "04-data-safety.png")


PREVIEWS.mkdir(parents=True, exist_ok=True)
for index in range(1, 5):
    image = Image.open(BOARDS / f"0{index}-{['api-reachability', 'backend-cleanup', 'contract-regression', 'data-safety'][index - 1]}.png")
    image.thumbnail((900, 650))
    image.save(PREVIEWS / f"0{index}-m8a-preview.gif", format="GIF", optimize=True)

print(json.dumps({"boards": sorted(str(path.relative_to(ROOT)) for path in BOARDS.glob("*.png")), "previews": sorted(str(path.relative_to(ROOT)) for path in PREVIEWS.glob("*.gif"))}))
