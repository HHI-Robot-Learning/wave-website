"""Encode the submission videos (wave_videos_submission/) for the page into static/videos/.

    python3 scripts/encode_videos.py [path/to/wave_videos_submission]

Simulation: one successful episode per embodiment and task, in real time (gantry 15 cubes, Panda
9-10 cubes), re-encoded as H.264 with the index at the front so they stream. Real world: the
ten-episode video (5x speed, silent audio track dropped) and the five-cube tower (real time,
with sound).
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads/wave_videos_submission"
OUT = ROOT / "static/videos"

SIM = {
    "sim/gantry_stacking_h3.mp4": "gantry/gantry_stacking_h3_15cubes.mp4",
    "sim/gantry_stacking_h6.mp4": "gantry/gantry_stacking_h6_15cubes.mp4",
    "sim/gantry_pyramid.mp4": "gantry/gantry_pyramid_15cubes.mp4",
    "sim/gantry_wall.mp4": "gantry/gantry_wall_15cubes.mp4",
    "sim/gantry_square.mp4": "gantry/gantry_square_15cubes.mp4",
    "sim/gantry_line.mp4": "gantry/gantry_line_15cubes.mp4",
    "sim/panda_stacking_h3.mp4": "panda_gripper/panda_gripper_stacking_h3_10cubes.mp4",
    "sim/panda_pyramid.mp4": "panda_gripper/panda_gripper_pyramid_10cubes.mp4",
    "sim/panda_wall.mp4": "panda_gripper/panda_gripper_wall_9cubes.mp4",
    "sim/panda_push_line.mp4": "panda_pusher/panda_pusher_line_10cubes.mp4",
    "sim/panda_push_square.mp4": "panda_pusher/panda_pusher_square_10cubes.mp4",
}
REAL = {
    # output: (source, crf, keep audio)
    "real_panda_two_towers.mp4": ("real_world/real_panda_stacking_h3_10episodes.mp4", 30, False),
    "real_panda_tower5.mp4": ("real_world/real_panda_stacking_5cube_tower.mp4", 27, True),
}


def find(rel):
    hits = list(SRC.rglob(Path(rel).name))
    if not hits:
        sys.exit(f"missing {rel} under {SRC}")
    return hits[0]


def encode(src, dst, crf, audio):
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
           "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-movflags", "+faststart"]
    cmd += ["-c:a", "aac", "-b:a", "96k"] if audio else ["-an"]
    subprocess.run(cmd + [str(dst)], check=True)
    print(f"{dst.relative_to(ROOT)}  {dst.stat().st_size / 1e6:.1f} MB")


for out, rel in SIM.items():
    encode(find(rel), OUT / out, 26, False)
for out, (rel, crf, audio) in REAL.items():
    encode(find(rel), OUT / out, crf, audio)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "3", "-i", str(OUT / out), "-frames:v", "1", "-q:v", "4",
                    str(OUT / out.replace(".mp4", ".jpg"))], check=True)
