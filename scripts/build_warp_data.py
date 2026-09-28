"""Build the data for the page's Warp Explorer section from a Warp Explorer recording.

    python3 scripts/build_warp_data.py [path/to/runs/<run>/n<count>]

Defaults to ../26-MOGB-Warp-Explorer/runs/h6n13_seed42/n7. Writes static/js/warp_data.js and
copies the episode videos to static/videos/warp/. The recording's data.js holds everything the
full explorer draws (33 MB); this keeps only what the page shows, per decision:

  * progress: cubes placed, the cube being worked on, whether one is carried,
  * for every physical quantity the warp edits, the share of its channels that are not at the
    identity (0-100), split into the input side (what the frozen skill sees) and the output side
    (what the robot is told to do),
  * the skill's own action and the executed action (after the output warp), per actuator,
and, one file per episode in static/js/warp_scene/, the data of the scene panel (see SCENE_GROUPS).
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "26-MOGB-Warp-Explorer/runs/h6n13_seed42/n7"
OUT_JS = ROOT / "static/js/warp_data.js"
OUT_SCENE = ROOT / "static/js/warp_scene"
OUT_VID = ROOT / "static/videos/warp"

# The scene panel ("true vs presented, with the candidate cloud") needs, per decision, the true
# positions, the applied warp of the position channels, and the policy's logits over the bins of
# those channels. As in the full explorer, the presented goal / object / jaws are
#   anchor + (1 + slope) * (true - anchor) + offset   per axis, anchored on the selected cube,
# and the cloud samples the position channels from softmax(logits / T). Only the x, y, z channels
# of goal, object and hand enter that formula, so only those 18 are kept.
SCENE_GROUPS = ["goal", "goal_slope", "obj", "obj_slope", "ee", "ee_slope"]

# Physical quantities, built from the recording's channel groups (meta.group_specs).
INPUT = [
    ("Goal", ["goal_slope", "goal", "goal_rot_slope", "goal_rot"]),
    ("Object", ["obj_slope", "obj", "obj_rot_slope", "obj_rot"]),
    ("Object velocity", ["obj_vel_gain", "obj_vel_off", "obj_angvel_gain", "obj_angvel_off"]),
    ("Hand", ["ee_slope", "ee", "ee_vel_gain", "ee_vel_off"]),
    ("Tracking errors", ["err_gain", "err_off", "srv_gain", "srv_off"]),
]
OUTPUT = [
    ("Arm motion", ["act_gain", "act_t"]),
    ("Gripper", ["grip_gain", "grip"]),
]


def main():
    text = (SRC / "data.js").read_text()
    rec = json.loads(text[text.index("WARP_EXPLORER_RUN(") + len("WARP_EXPLORER_RUN("):text.rindex(")")])
    meta = rec["meta"]

    offsets, o = {}, 0
    for name, n in meta["group_specs"]:
        offsets[name] = (o, n)
        o += n
    disabled = set(meta.get("disabled_groups", []))

    def columns(groups):
        cols = []
        for g in groups:
            if g in disabled:
                continue
            start, n = offsets[g]
            cols.extend(range(start, start + n))
        return cols

    quantities = [(label, columns(groups)) for label, groups in INPUT + OUTPUT]

    import base64
    import struct
    # scene columns: first three channels of each position group, in SCENE_GROUPS order
    scene_cols = [offsets[g][0] + d for g in SCENE_GROUPS for d in range(3)]
    pos_cols = meta["pos_cols"]
    pos_index = [pos_cols.index(c) for c in scene_cols]
    nb = meta["n_bins"]
    if OUT_SCENE.exists():
        shutil.rmtree(OUT_SCENE)
    OUT_SCENE.mkdir(parents=True)

    def r3(v):
        return [round(x, 3) for x in v]

    episodes = []
    OUT_VID.mkdir(parents=True, exist_ok=True)
    for i, ep in enumerate(rec["episodes"]):
        frames = []
        for f in ep["frames"]:
            w = f["w"]
            shares = [round(100 * sum(abs(w[c]) > 1e-9 for c in cols) / len(cols)) for _, cols in quantities]
            frames.append([sum(1 for s in f["sat"] if s), f["atom"], 1 if f["carried"] else 0] + shares
                          + [round(v, 2) for v in f["act_naive"]] + [round(v, 2) for v in f["act"]])
        # scene data, one lazily loaded file per episode
        raw = base64.b64decode(ep["rel_logits_b64"])
        rel = struct.unpack("<%dh" % (len(raw) // 2), raw)
        npc = ep["rel_shape"][1]
        logits = bytearray()
        for t in range(len(ep["frames"])):
            for k in pos_index:
                for b in range(nb):
                    v = rel[(t * npc + k) * nb + b]
                    if not -128 <= v <= 127:
                        sys.exit(f"logit {v} does not fit in int8")
                    logits.append(v & 0xFF)
        scene = {
            "frames": [[r3(p) for p in f["obj"]] + [r3(p) for p in f["goal"]] + [r3(f["ee"])]
                       for f in ep["frames"]],
            "sat": [[1 if x else 0 for x in f["sat"]] for f in ep["frames"]],
            "w": [[round(f["w"][c], 4) for c in scene_cols] for f in ep["frames"]],
            "logits": base64.b64encode(bytes(logits)).decode(),
        }
        (OUT_SCENE / f"ep{i}.js").write_text(
            f"window.WARP_SCENE_LOADED({i}," + json.dumps(scene, separators=(",", ":")) + ");\n")
        video = f"ep{i}.mp4"
        shutil.copy2(SRC / ep["video"], OUT_VID / video)
        episodes.append({"success": ep["success"], "video": f"static/videos/warp/{video}", "frames": frames})

    data = {
        "run": rec["label"],
        "n_obj": meta["n_obj"],
        "fps": 10,  # one video frame per decision (render_every_decisions = 1) at 10 fps
        "inputs": [label for label, _ in INPUT],
        "outputs": [label for label, _ in OUTPUT],
        "channels": [len(cols) for _, cols in quantities],
        "actions": meta["action_names"],
        "scene": {
            # per scene column: bin values and which bins are valid (as the full explorer samples them)
            "bins": [meta["bin_table"][c] for c in scene_cols],
            "mask": [[bool(x) for x in meta["bin_mask"][c]] for c in scene_cols],
            "ee_z_offset": meta["ee_z_offset"],
            "cube_half": meta["cube_half_extent"],
            "n_bins": nb,
            "files": [f"static/js/warp_scene/ep{i}.js" for i in range(len(rec["episodes"]))],
        },
        # frame = [placed, atom, carried, *shares(inputs + outputs), *skill action, *executed action]
        "episodes": episodes,
    }
    OUT_JS.write_text("// Generated by scripts/build_warp_data.py from a Warp Explorer recording. Do not edit.\n"
                      "window.WARP_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
    n = sum(len(e["frames"]) for e in episodes)
    print(f"wrote {OUT_JS.relative_to(ROOT)} ({OUT_JS.stat().st_size / 1e3:.0f} KB): "
          f"{len(episodes)} episodes, {n} decisions; videos in {OUT_VID.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
