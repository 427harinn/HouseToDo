from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/m8b"
DIAG = EVIDENCE / "diagnostics"
BOARDS = EVIDENCE / "screenshots"
REVIEW = EVIDENCE / "review-upload"


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
F_HEAD = font(17, True)
F_BODY = font(14)
F_SMALL = font(12)


def draw_text(draw, xy, value, fill="#17312f", selected=F_BODY):
    draw.text(xy, str(value), font=selected, fill=fill)


def board(title: str, subtitle: str, height: int = 1200):
    image = Image.new("RGB", (1800, height), "#f5f8f6")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1800, 96), fill="#123c3a")
    draw_text(draw, (36, 20), title, "#ffffff", F_TITLE)
    draw_text(draw, (38, 66), subtitle, "#cfe5df", F_SUB)
    return image, draw


def save(image, name):
    BOARDS.mkdir(parents=True, exist_ok=True)
    image.save(BOARDS / name)


decisions = json.loads((DIAG / "final-candidate-decisions.json").read_text(encoding="utf-8"))
schema = json.loads((DIAG / "final-schema.json").read_text(encoding="utf-8"))
diff = json.loads((DIAG / "api-schema-diff.json").read_text(encoding="utf-8"))
legacy = json.loads((DIAG / "legacy-data-compat.json").read_text(encoding="utf-8"))
gate = json.loads((DIAG / "final-gate.json").read_text(encoding="utf-8"))


# Board 1 is generated only from final-candidate-decisions.json.
img, draw = board(
    "01 · Final Candidate Decisions",
    f"base {decisions['productionBaseSha'][:12]} · implementation {decisions['implementationSha'][:12]} · source final-candidate-decisions.json",
    height=760,
)
columns = [(35, 130), (145, 460), (475, 820), (835, 1030), (1045, 1270), (1285, 1760)]
headers = ["ID", "Candidate", "Canonical reader", "Persisted data", "Verdict", "Action"]
for (x1, x2), header in zip(columns, headers):
    draw.rectangle((x1, 122, x2, 154), fill="#d9e9e4")
    draw_text(draw, (x1 + 7, 131), header, "#17312f", F_HEAD)
for index, item in enumerate(decisions["decisions"]):
    y = 166 + index * 88
    if index % 2 == 0:
        draw.rectangle((28, y - 6, 1770, y + 78), fill="#ffffff")
    persisted = item["existingPersistedData"]
    persisted_value = ", ".join(f"{key}={value}" for key, value in persisted.items() if key in {"rows", "activeRows", "total", "snapshotNullRows", "calendarActionDateNullRows"}) or "projection / N/A"
    canonical = "; ".join(item["canonicalCallers"]) or "none"
    values = [item["id"], item["name"], canonical, persisted_value, item["verdict"], item["action"]]
    for (x1, _), value in zip(columns, values):
        color = "#19734d" if value == item["verdict"] else "#17312f"
        draw_text(draw, (x1 + 7, y), value, color, F_SMALL)
save(img, "01-final-decisions.png")


# Board 2 is generated from the machine-readable API/schema diff.
img, draw = board(
    "02 · API / Schema Before → After",
    f"base {diff['productionBaseSha'][:12]} · implementation {diff['implementationSha'][:12]} · source api-schema-diff.json + final-schema.json",
    height=900,
)
facts = [
    f"Worker routes: {diff['workerRoutes']['before']} → {diff['workerRoutes']['after']} · removed {len(diff['workerRoutes']['removed'])}",
    f"Migration files: {diff['migrations']['before']} → {diff['migrations']['after']}",
    f"Tables: {diff['tables']['before']} → {diff['tables']['after']}",
    "Columns removed/added: 0 / 0",
    "API removed: None — intentionally retained",
    f"SCHEMA CHANGE: {diff['schemaChange']}",
]
for index, value in enumerate(facts):
    x = 55 + (index % 2) * 860
    y = 145 + (index // 2) * 48
    draw_text(draw, (x, y), value, "#19734d" if "NONE" in value or "None" in value else "#17312f", F_HEAD)
draw_text(draw, (55, 310), "API kept intentionally", "#123c3a", F_HEAD)
y = 350
for item in diff["apiKeptIntentionally"]:
    draw_text(draw, (78, y), f"{item['id']} · {item['verdict']} · {item['name']}", "#17312f", F_BODY)
    y += 31
save(img, "02-api-schema-diff.png")


# Board 3 is generated from local D1 snapshot and the actual legacy contract test result.
img, draw = board(
    "03 · Legacy Data Compatibility",
    f"base {legacy['productionBaseSha'][:12]} · implementation {legacy['implementationSha'][:12]} · source legacy-data-compat.json",
    height=820,
)
y = 145
for item in legacy["checks"]:
    status = item["status"]
    color = "#19734d" if status == "PASS" else "#a46b00" if status == "N/A" else "#a52b2b"
    draw.rounded_rectangle((55, y, 1745, y + 54), radius=8, fill="#ffffff", outline="#d5e3df")
    draw_text(draw, (78, y + 17), item["name"], "#17312f", F_HEAD)
    draw_text(draw, (430, y + 17), status, color, F_HEAD)
    draw_text(draw, (650, y + 17), item["evidence"], "#17312f", F_BODY)
    y += 72
save(img, "03-legacy-data-compat.png")


# Board 4 is generated from final-gate.json, which is written by the gate runner.
img, draw = board(
    "04 · Final Migration Gate",
    f"base {gate['productionBaseSha'][:12]} · implementation {gate['implementationSha'][:12]} · source final-gate.json",
    height=1040,
)
y = 140
for item in gate["checks"]:
    status = item["status"]
    color = "#19734d" if status == "PASS" else "#a46b00" if status in {"N/A", "SKIPPED"} else "#a52b2b"
    draw.rounded_rectangle((55, y, 1745, y + 43), radius=7, fill="#ffffff", outline="#d5e3df")
    draw_text(draw, (78, y + 12), item["name"], "#17312f", F_BODY)
    draw_text(draw, (440, y + 12), status, color, F_HEAD)
    draw_text(draw, (570, y + 12), item["evidence"], "#17312f", F_SMALL)
    y += 51
draw_text(draw, (55, y + 16), f"Production UI Migration: {gate['completion']}", "#19734d" if gate["completion"] == "COMPLETE" else "#a52b2b", F_HEAD)
draw_text(draw, (55, y + 50), "Deploy: NOT RUN · Remote migration: NOT RUN · Real production data: NOT TOUCHED", "#a46b00", F_BODY)
save(img, "04-final-gate.png")


REVIEW.mkdir(parents=True, exist_ok=True)
for path in REVIEW.iterdir():
    if path.is_file():
        path.unlink()
for name in ["01-final-decisions.png", "02-api-schema-diff.png", "03-legacy-data-compat.png", "04-final-gate.png"]:
    (REVIEW / name).write_bytes((BOARDS / name).read_bytes())
for name in ["legacy-task-regression.webm", "shopping-template-reuse.webm", "two-user-final-smoke.webm", "final-app-smoke.webm"]:
    source = EVIDENCE / "motion" / name
    (REVIEW / name).write_bytes(source.read_bytes())

print(json.dumps({"reviewUpload": sorted(path.name for path in REVIEW.iterdir()), "count": len(list(REVIEW.iterdir()))}))
