from pathlib import Path
import subprocess
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MOTION = ROOT / "docs" / "evidence" / "m5" / "motion"
PREVIEWS = MOTION / "previews"
FFMPEG = Path(r"C:\Users\rinnr\AppData\Local\ms-playwright\ffmpeg-1011\ffmpeg-win64.exe")

for name in ("members-invite", "notifications-settings", "household-settings", "account-actions"):
    output = PREVIEWS / f"{name}.gif"
    with tempfile.TemporaryDirectory(prefix=f"m5-{name}-") as temp:
        frames = Path(temp)
        subprocess.run([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-i", str(MOTION / f"{name}.webm"), "-r", "10", "-f", "image2", str(frames / "frame-%04d.png")], check=True)
        images = [Image.open(path).convert("RGB") for path in sorted(frames.glob("frame-*.png"))]
        if not images:
            raise RuntimeError(f"No frames extracted for {name}")
        images[0].save(output, save_all=True, append_images=images[1:], duration=100, loop=0, optimize=False)
        for image in images:
            image.close()
