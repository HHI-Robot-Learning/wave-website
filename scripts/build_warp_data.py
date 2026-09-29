"""Build the data of the page's Warp Explorer section from the Warp Explorer recordings.

    python3 scripts/build_warp_data.py [recordings dir]

The recordings dir (default ../warp_recordings) holds one render per task, as written by the
Warp Explorer's recorder (render_warp_3d.py): <dir>/web_<task>_n<cubes>/warp3d.json + ep*.mp4.
Outputs:
  static/js/warp_data.js            index: tasks, labels, channel counts, bar and 3-D settings
  static/js/warp_tasks/<task>.js    per task, loaded when the task is opened: per decision
                                    progress, KL per quantity, skill vs executed action, 3-D pose
  static/videos/warp/<task>/ep*.mp4 the recorded episode videos

Per decision and quantity, the warp bars show how far the policy moved away from "no edit": the
KL divergence KL(no edit || policy) = -log2 pi(no edit) per warp parameter, averaged over the
quantity's parameters, in bits (stored x100). pi(identity) = exp(-authority_nats); the hold bin
repeats the previous value, so it also counts as "no edit" when that value is the identity.
The 3-D view gets the robot joints and every cube's pose (the recording's qpos), the goals, and
the presented goal / object / jaws: anchor + (1 + slope) * (true - anchor) + offset per axis,
anchored on the selected cube (the full explorer's formula).
"""
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "warp_recordings"
OUT_INDEX = ROOT / "static/js/warp_data.js"
OUT_TASKS = ROOT / "static/js/warp_tasks"
OUT_VID = ROOT / "static/videos/warp"

# task key, label, embodiment group, robot / scene of the 3-D view, recording directory
TASKS = [
    ("gantry_stacking_h3", "Stacking (h=3)", "Gantry", "gantry", "gantry_wide", "web_gantry_stacking_h3_n15"),
    ("gantry_stacking_h6", "Stacking (h=6)", "Gantry", "gantry", "gantry_wide", "web_gantry_stacking_h6_n15"),
    ("gantry_pyramid", "Pyramid", "Gantry", "gantry", "gantry_wide", "web_gantry_pyramid_n15"),
    ("gantry_wall", "Wall", "Gantry", "gantry", "gantry_wide", "web_gantry_wall_n15"),
    ("gantry_square", "Square", "Gantry", "gantry", "gantry_wide", "web_gantry_square_n15"),
    ("gantry_line", "Line", "Gantry", "gantry", "gantry_wide30", "web_gantry_line_n15"),
    ("panda_stacking_h3", "Stacking (h=3)", "Panda gripper", "panda_gripper", "panda_stack", "web_panda_stacking_h3_n7"),
    ("panda_pyramid", "Pyramid", "Panda gripper", "panda_gripper", "panda_stack", "web_panda_pyramid_n6"),
    ("panda_wall", "Wall", "Panda gripper", "panda_gripper", "panda_stack", "web_panda_wall_n8"),
    ("panda_push_line", "Line", "Panda pusher", "panda_pusher", "panda_push", "web_panda_push_line_n10"),
    ("panda_push_square", "Square", "Panda pusher", "panda_pusher", "panda_push", "web_panda_push_square_n10"),
]

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
PRESENTED = {"goal": ("goal", "goal_slope"), "obj": ("obj", "obj_slope"), "jaw": ("ee", "ee_slope")}


def r3(v, nd=3):
    return [round(x, nd) for x in v]


def video_fps(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=r_frame_rate", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    a, b = out.split("/")
    return float(a) / float(b)


def action_names(meta, rec_dir):
    """The recorder names actions after the gantry's axes; on the Panda arm they are the seven joint
    commands (plus the grip on the gripper), so they are relabeled there."""
    names = meta["action_names"]
    if "panda" in rec_dir.name:
        names = [f"joint {i + 1}" for i in range(7)] + (["jaw grip"] if len(names) > 7 else [])
    return names


def load_recording(d):
    text = (d / "warp3d.json").read_text()
    if text.lstrip().startswith("WARP_EXPLORER_RUN("):
        text = text[text.index("(") + 1:text.rindex(")")]
    return json.loads(text)


def build_task(key, rec_dir):
    rec = load_recording(rec_dir)
    meta = rec["meta"]
    offsets, o = {}, 0
    for name, n in meta["group_specs"]:
        offsets[name] = (o, n)
        o += n
    disabled = set(meta.get("disabled_groups", []))

    def columns(groups):
        cols = []
        for g in groups:
            if g in offsets and g not in disabled:
                start, n = offsets[g]
                cols.extend(range(start, start + n))
        return cols

    quantities = [columns(groups) for _, groups in INPUT + OUTPUT]
    n_obj, eez = meta["n_obj"], meta.get("ee_z_offset", 0.0)
    ee_point = meta.get("ee_is_point", True) is not False
    p_floor = math.exp(-meta.get("authority_nats_ceiling", -math.log(1e-6)))

    def presented(f):
        A, G = f["obj"][f["atom"]], f["goal"][f["atom"]]
        true = {"goal": G, "obj": A, "jaw": [f["ee"][0], f["ee"][1], f["ee"][2] - eez]}
        out = []
        for key_, (off_g, slope_g) in PRESENTED.items():
            if key_ == "jaw" and not ee_point:
                continue
            o_, s_ = offsets[off_g][0], offsets[slope_g][0]
            out += [A[d] + (1 + f["w"][s_ + d]) * (true[key_][d] - A[d]) + f["w"][o_ + d] for d in range(3)]
        return r3(out)

    vid_dir = OUT_VID / key
    if vid_dir.exists():
        shutil.rmtree(vid_dir)
    vid_dir.mkdir(parents=True)
    episodes, n_robot, fps = [], None, None
    for i, ep in enumerate(rec["episodes"]):
        frames, poses = [], []
        prev_w = [0.0] * meta["p_dim"]  # before the first decision every channel is at the identity
        for f in ep["frames"]:
            def kl(c):
                p_stay = math.exp(-f["authority_nats"][c])
                if abs(prev_w[c]) < 1e-9:
                    p_stay += f["p_hold"][c]
                return -math.log2(min(1.0, max(p_stay, p_floor)))
            shares = [round(100 * sum(kl(c) for c in cols) / len(cols)) if cols else -1 for cols in quantities]
            frames.append([sum(1 for s in f["sat"] if s), f["atom"], 1 if f["carried"] else 0] + shares
                          + [round(v, 2) for v in f["act_naive"]] + [round(v, 2) for v in f["act"]])
            prev_w = f["w"]
            q = f["qpos"]
            n_robot = len(q) - 7 * n_obj
            poses.append({"q": r3(q), "g": [r3(g) for g in f["goal"]], "s": [1 if x else 0 for x in f["sat"]],
                          "a": f["atom"], "p": presented(f)})
        src_video = rec_dir / (ep.get("video") or f"ep{i}.mp4")
        shutil.copy2(src_video, vid_dir / f"ep{i}.mp4")
        fps = fps or video_fps(src_video)
        episodes.append({"success": bool(ep["success"]), "video": f"static/videos/warp/{key}/ep{i}.mp4",
                         "frames": frames, "pose": poses})
    (OUT_TASKS / f"{key}.js").write_text(
        "// Generated by scripts/build_warp_data.py. Do not edit.\n"
        f"window.WARP_TASK_LOADED({json.dumps(key)}," + json.dumps({"episodes": episodes}, separators=(",", ":")) + ");\n")
    info = {
        "n_obj": n_obj,
        "fps": round(fps, 4),
        "channels": [len(c) for c in quantities],
        "actions": action_names(meta, rec_dir),
        "n_robot": n_robot,
        "cube_half": meta["cube_half_extent"],
        "ee_point": ee_point,
        "episodes": [{"success": e["success"], "decisions": len(e["frames"])} for e in episodes],
        "harvest": meta.get("harvest_yield"),
        "kl_max": meta.get("authority_nats_ceiling", -math.log(1e-6)) / math.log(2),
    }
    n = sum(len(e["frames"]) for e in episodes)
    size = (OUT_TASKS / f"{key}.js").stat().st_size / 1e6
    print(f"{key:20s} {len(episodes)} episodes, {n:5d} decisions, {n_obj:2d} cubes, "
          f"{sum(e['success'] for e in episodes)} successful, {size:.1f} MB")
    return info


def main():
    if OUT_TASKS.exists():
        shutil.rmtree(OUT_TASKS)
    OUT_TASKS.mkdir(parents=True)
    tasks, kl_max = [], None
    for key, label, group, robot, scene, rec in TASKS:
        rec_dir = SRC / rec
        if not (rec_dir / "warp3d.json").exists():
            print(f"{key:20s} missing {rec_dir}/warp3d.json, skipped")
            continue
        info = build_task(key, rec_dir)
        kl_max = info.pop("kl_max")
        tasks.append(dict(key=key, label=label, group=group, robot=robot, scene=scene,
                          file=f"static/js/warp_tasks/{key}.js", **info))
    index = {
        "kl_max": kl_max,
        "inputs": [label for label, _ in INPUT],
        "outputs": [label for label, _ in OUTPUT],
        # frame = [placed, atom, carried, *KL per quantity in bits x100 (-1: the task has no such
        #          channels), *skill action, *executed action]
        "tasks": tasks,
    }
    OUT_INDEX.write_text("// Generated by scripts/build_warp_data.py from Warp Explorer recordings. Do not edit.\n"
                         "window.WARP_DATA = " + json.dumps(index, separators=(",", ":")) + ";\n")
    print(f"wrote {OUT_INDEX.relative_to(ROOT)} with {len(tasks)} tasks")


if __name__ == "__main__":
    main()
