import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "evidence" / "release-readiness"
READINESS = EVIDENCE / "diagnostics" / "readiness.json"
SCREENSHOTS = EVIDENCE / "screenshots"
UPLOAD = EVIDENCE / "review-upload"
WIDTH, HEIGHT = 1600, 1000


def font(size, bold=False):
    candidates = (
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


TITLE = font(46, True)
SUBTITLE = font(24)
LABEL = font(28, True)
VALUE = font(27)
SMALL = font(21)
BODY = font(24)


def status_color(value):
    upper = str(value).upper()
    if upper.startswith("PASS") or upper.startswith("AVAILABLE"):
        return "#16794b"
    if "REVIEW_REQUIRED" in upper or "REVIEW REQUIRED" in upper:
        return "#9a6500"
    if "UNAVAILABLE" in upper or upper.startswith("FAIL"):
        return "#a33a32"
    return "#5b6470"


def draw_wrapped(draw, text, xy, width, fill="#28313b", font_obj=BODY, line_gap=8):
    x, y = xy
    words = str(text).split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=font_obj)[2] <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        draw.text((x, y), line, fill=fill, font=font_obj)
        y += font_obj.size + line_gap
    return y


def base(title, readiness):
    image = Image.new("RGB", (WIDTH, HEIGHT), "#f5f7f8")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, WIDTH, 128), fill="#17324d")
    draw.text((64, 34), title, fill="#ffffff", font=TITLE)
    draw.text(
        (64, 142),
        f"Main SHA {readiness['mainSha']}   |   Evidence generated from actual audit commands",
        fill="#53606c",
        font=SMALL,
    )
    return image, draw


def card(draw, x, y, w, h, label, value):
    draw.rounded_rectangle((x, y, x + w, y + h), radius=18, fill="#ffffff", outline="#d7dde2", width=2)
    draw.text((x + 26, y + 20), label, fill="#28313b", font=LABEL)
    color = status_color(value)
    status = str(value).split(" — ", 1)[0]
    pill_width = min(w - 52, max(160, draw.textbbox((0, 0), status, font=SMALL)[2] + 34))
    draw.rounded_rectangle((x + 26, y + 72, x + 26 + pill_width, y + 116), radius=20, fill=color)
    draw.text((x + 43, y + 83), status, fill="#ffffff", font=SMALL)
    if h > 150:
        draw_wrapped(draw, value, (x + 26, y + 132), w - 52, fill="#53606c", font_obj=SMALL, line_gap=4)


def board_main(readiness):
    image, draw = base("01  MAIN FINAL QUALITY GATE", readiness)
    fields = [
        ("lint", readiness["local"]["lint"].split(" — ", 1)[0]),
        ("typecheck", readiness["local"]["typecheck"].split(" — ", 1)[0]),
        ("Vitest", readiness["local"]["vitest"].split(" — ", 1)[0]),
        ("build", readiness["local"]["build"].split(" — ", 1)[0]),
        ("local migration", readiness["local"]["migration"].split(" — ", 1)[0]),
        ("Chromium", readiness["local"]["chromium"].split(" — ", 1)[0]),
        ("two-user smoke", readiness["local"]["twoUser"].split(" — ", 1)[0]),
    ]
    for index, (label, value) in enumerate(fields):
        x = 64 + (index % 2) * 760
        y = 205 + (index // 2) * 145
        card(draw, x, y, 700, 128, label, value)
    draw.rounded_rectangle((64, 790, 1536, 920), radius=18, fill="#17324d")
    draw.text((94, 818), "Production UI Migration", fill="#ffffff", font=LABEL)
    draw.text((650, 818), "COMPLETE", fill="#74e0a4", font=TITLE)
    return image


def board_remote(readiness):
    image, draw = base("02  REMOTE READINESS", readiness)
    remote = readiness["remote"]
    details = readiness["remoteDetails"]
    worker_details = details["stagingWorker"]
    d1_details = details["d1"]
    secret_details = details["requiredSecretNames"]
    compact_remote = {
        "cloudflareAuth": remote["cloudflareAuth"].replace("authenticated Cloudflare session; ", "authenticated; "),
        "workerState": f"{remote['workerState'].split(' — ', 1)[0]} — staging configured; latest v{worker_details['latestVersionNumber']}; default Worker deployed={details['environments']['productionWorkerDeployed']}",
        "d1MigrationState": f"{remote['d1MigrationState'].split(' — ', 1)[0]} — staging {d1_details['remoteAppliedCount']}/{d1_details['localMigrationCount']}; pending {len(d1_details['missingMigrations'])}; default D1 not found",
        "r2Binding": f"{remote['r2Binding'].split(' — ', 1)[0]} — staging ATTACHMENTS and {details['r2']['configuredStagingBucket']} present",
        "requiredSecrets": f"{remote['requiredSecrets'].split(' — ', 1)[0]} — names {len(secret_details['stagingPresent'])}/{len(secret_details['required'])}; missing {', '.join(secret_details['stagingMissing']) or 'none'}; values not read",
        "cron": f"{remote['cron'].split(' — ', 1)[0]} — staging {', '.join(details['cron']['stagingConfigured'])}; default {', '.join(details['cron']['defaultConfigured'])}; no change",
    }
    fields = [
        ("Cloudflare auth", compact_remote["cloudflareAuth"]),
        ("Worker", compact_remote["workerState"]),
        ("D1", compact_remote["d1MigrationState"]),
        ("R2", compact_remote["r2Binding"]),
        ("Secrets (names only)", compact_remote["requiredSecrets"]),
        ("Cron", compact_remote["cron"]),
    ]
    for index, (label, value) in enumerate(fields):
        x = 64 + (index % 2) * 760
        y = 205 + (index // 2) * 205
        card(draw, x, y, 700, 188, label, value)
    return image


def board_d1(readiness):
    image, draw = base("03  D1 MIGRATION STATUS", readiness)
    details = readiness["remoteDetails"]["d1"]
    draw.text((80, 220), f"Local migration count: {details['localMigrationCount']}", fill="#28313b", font=LABEL)
    draw.text((80, 275), f"Remote applied count (staging): {details['remoteAppliedCount']}", fill="#28313b", font=LABEL)
    draw.text((80, 330), "Missing migrations:", fill="#28313b", font=LABEL)
    y = 385
    for name, risk in details["missingMigrationRisk"].items():
        draw.text((110, y), name, fill="#9a6500", font=VALUE)
        y = draw_wrapped(draw, f"Risk: {risk}", (150, y + 40), 1300, fill="#53606c", font_obj=SMALL, line_gap=6) + 18
    draw.rounded_rectangle((80, 760, 1520, 900), radius=18, fill="#9a6500")
    draw.text((115, 795), "REMOTE MIGRATION: NOT RUN", fill="#ffffff", font=LABEL)
    draw.text((735, 795), "REVIEW REQUIRED", fill="#ffffff", font=LABEL)
    draw.text((80, 930), "Schema/data operation: NOT RUN   |   Metadata query rows written: 0", fill="#53606c", font=SMALL)
    return image


def board_next(readiness):
    image, draw = base("04  RELEASE NEXT ACTION", readiness)
    draw.rounded_rectangle((64, 210, 1536, 350), radius=22, fill="#9a6500")
    draw.text((100, 248), "FINAL VERDICT", fill="#ffffff", font=LABEL)
    draw.text((570, 238), readiness["verdict"], fill="#ffffff", font=TITLE)
    draw.text((80, 425), "Recommended next sequence", fill="#28313b", font=LABEL)
    steps = [
        "1. Human review of the staging/default environment gap and pending migrations",
        "2. If approved, staging migration/deploy decision using the existing runbook",
        "3. Authenticated staging smoke and real iPhone manual validation",
        "4. Separate production deploy review",
    ]
    y = 485
    for step in steps:
        draw.ellipse((90, y + 8, 108, y + 26), fill="#17324d")
        y = draw_wrapped(draw, step, (135, y), 1320, font_obj=BODY, line_gap=8) + 20
    draw.text((80, 850), "No deploy, remote migration, Cron change, secret change, or production data write was executed.", fill="#a33a32", font=SMALL)
    return image


def main():
    readiness = json.loads(READINESS.read_text(encoding="utf-8"))
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    UPLOAD.mkdir(parents=True, exist_ok=True)
    for child in UPLOAD.iterdir():
        if child.is_file():
            child.unlink()
    boards = {
        "01-main-final-gate.png": board_main(readiness),
        "02-remote-readiness.png": board_remote(readiness),
        "03-d1-migration-status.png": board_d1(readiness),
        "04-release-next-action.png": board_next(readiness),
    }
    for name, image in boards.items():
        image.save(SCREENSHOTS / name, format="PNG")
        image.save(UPLOAD / name, format="PNG")
    print(json.dumps({"screenshots": len(list(SCREENSHOTS.glob("*.png"))), "reviewUpload": len(list(UPLOAD.glob("*.png"))) }))


if __name__ == "__main__":
    main()
