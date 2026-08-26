from pathlib import Path

import cv2
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MOTION = ROOT / "docs/evidence/m8b/motion"
PREVIEWS = MOTION / "previews"
PREVIEWS.mkdir(parents=True, exist_ok=True)

for source in sorted(MOTION.glob("*.webm")):
    capture = cv2.VideoCapture(str(source))
    frames = []
    index = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if index % 5 == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(rgb)
            image.thumbnail((195, 422))
            frames.append(image.copy())
        index += 1
    capture.release()
    if not frames:
        raise RuntimeError(f"No frames decoded from {source}")
    frames[0].save(
        PREVIEWS / f"{source.stem}.gif",
        save_all=True,
        append_images=frames[1:],
        duration=200,
        loop=0,
        optimize=True,
    )

print({"previews": sorted(path.name for path in PREVIEWS.glob("*.gif"))})
