from pathlib import Path

import cv2


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "docs/evidence/m8b/motion/raw"
OUTPUT = ROOT / "docs/evidence/m8b/motion/two-user-final-smoke.webm"
OWNER = RAW / "two-user-final-smoke-owner.webm"
MEMBER = RAW / "two-user-final-smoke-member.webm"

owner = cv2.VideoCapture(str(OWNER))
member = cv2.VideoCapture(str(MEMBER))
if not owner.isOpened() or not member.isOpened():
    raise RuntimeError("two-user raw recordings could not be opened")

fps = min(owner.get(cv2.CAP_PROP_FPS) or 25, member.get(cv2.CAP_PROP_FPS) or 25)
width = int(owner.get(cv2.CAP_PROP_FRAME_WIDTH) or 390)
height = int(owner.get(cv2.CAP_PROP_FRAME_HEIGHT) or 844)
total = max(
    int(owner.get(cv2.CAP_PROP_FRAME_COUNT)),
    int(member.get(cv2.CAP_PROP_FRAME_COUNT)),
)
writer = cv2.VideoWriter(
    str(OUTPUT),
    cv2.VideoWriter_fourcc(*"VP80"),
    fps,
    (width * 2, height),
)
if not writer.isOpened():
    raise RuntimeError("WebM compositor could not open VP80 writer")

last_owner = None
last_member = None
for _ in range(total):
    owner_ok, owner_frame = owner.read()
    member_ok, member_frame = member.read()
    if owner_ok:
        last_owner = owner_frame
    if member_ok:
        last_member = member_frame
    if last_owner is None or last_member is None:
        continue
    owner_frame = last_owner.copy()
    member_frame = last_member.copy()
    cv2.rectangle(owner_frame, (0, 0), (width, 42), (18, 60, 58), -1)
    cv2.rectangle(member_frame, (0, 0), (width, 42), (18, 60, 58), -1)
    cv2.putText(owner_frame, "USER A / OWNER", (14, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(member_frame, "USER B / MEMBER", (14, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    writer.write(cv2.hconcat([owner_frame, member_frame]))

owner.release()
member.release()
writer.release()
print({"output": str(OUTPUT), "fps": fps, "frames": total})
