"""Download the carousel videos from wandb (MOGB/wave) and encode them for the page.

Each paper run logs training montages (two environments side by side). This takes the latest
montage of the run the paper's snapshots come from, crops one environment and writes a small
H.264 MP4 to static/videos/<name>.mp4.

    ../26-MOGB/.venv/bin/python scripts/fetch_videos.py      # needs wandb, credentials in ~/.netrc, ffmpeg
"""
import re
import subprocess
import tempfile
from pathlib import Path

import wandb

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static/videos"

# name: (run id, ffmpeg crop w:h:x:y on the 1600-px montage, i.e. inside the left environment[, seconds to keep])
GANTRY = "560:420:120:302"
PANDA = "800:600:0:150"
PUSHER = "800:600:0:60"
VIDEOS = {
    "gantry_stacking_h3": ("wmcrtdwo", GANTRY),  # paper_gantry_towers_h3_n7_seed100
    "gantry_stacking_h6": ("s7yw1axz", GANTRY),  # paper_gantry_towers_h6_n7_seed100
    "gantry_pyramid": ("wrd58ka8", GANTRY),  # paper_gantry_pyramidgrow_n10_maxcon192_seed42
    "gantry_wall": ("q6wt03qv", GANTRY),  # paper_gantry_wall_n8_seed100
    "gantry_square": ("7wzr253v", GANTRY),  # paper_gantry_square_n9_seed1
    "gantry_line": ("2of9ppjv", "372:279:214:398"),  # paper_gantry_line_n6_seed1, wider arena
    "panda_stacking_h3": ("03mfzuez", PANDA),  # paper_panda_towers_h3_n7_seed1
    "panda_stacking_h3_abstract": ("03mfzuez", PANDA, 7),  # same run, first 7 s, shown under the abstract
    "panda_pyramid": ("s5qmyt61", PANDA),  # paper_panda_pyramid_n6_seed42
    "panda_wall": ("l3mwzdg8", PANDA),  # paper_panda_wall_n8_seed1
    "panda_push_line": ("myb1466s", PUSHER),  # paper_panda_push_line_n9_seed100
    "panda_push_square": ("ta778ec1", PUSHER),  # paper_panda_push_square_n9_seed42
}


def step(name):
    m = re.search(r"montage_(\d+)_", name)
    return int(m.group(1)) if m else -1


def main():
    api = wandb.Api(timeout=120)
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, (run_id, crop, *keep) in VIDEOS.items():
            run = api.run(f"MOGB/wave/{run_id}")
            latest = max((f for f in run.files(per_page=1000) if f.name.endswith(".mp4")), key=lambda f: step(f.name))
            src = latest.download(root=str(Path(tmp) / name), replace=True).name
            dst = OUT / f"{name}.mp4"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", src, "-an", *(["-t", str(keep[0])] if keep else []),
                 "-vf", f"crop={crop},scale=640:480:flags=lanczos,fps=24",
                 "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", str(dst)],
                check=True,
            )
            print(f"{name}: {run.name} {latest.name} -> {dst.relative_to(ROOT)} ({dst.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
