"""Build the data for the page's Warp Explorer section from a Warp Explorer recording.

    python3 scripts/build_warp_data.py [path/to/runs/<run>/n<count>]

Defaults to ../26-MOGB-Warp-Explorer/runs/h6n13_seed42/n7. Writes static/js/warp_data.js and
copies the episode videos to static/videos/warp/. The recording's data.js holds everything the
full explorer draws (33 MB); this keeps only what the page shows, per decision:

  * progress: cubes placed, the cube being worked on, whether one is carried,
  * for every physical quantity the warp edits, how far the policy moved away from "no edit": the
    KL divergence KL(no edit || policy) = -log2 pi(no edit) per parameter, averaged over the
    quantity's parameters, in bits x100; split into the input side (what the frozen skill sees)
    and the output side (what the robot is told to do),
  * the skill's own action and the executed action (after the output warp), per actuator,
and, one file per episode in static/js/warp_3d/, the poses for the 3-D view (see PRESENTED).
"""
import json
import math
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "26-MOGB-Warp-Explorer/runs/h6n13_seed42/n7"
OUT_JS = ROOT / "static/js/warp_data.js"
OUT_VID = ROOT / "static/videos/warp"
OUT_3D = ROOT / "static/js/warp_3d"

# The 3-D view needs, per decision, the robot's joints, every cube's pose, the goals and the presented
# (warped) goal / object / jaws. The recording's qpos is [8 robot joints, then per cube x y z qw qx qy
# qz]; the presented points use the full explorer's formula
#   anchor + (1 + slope) * (true - anchor) + offset   per axis, anchored on the selected cube,
# with the x, y, z channels of these groups (offset group, slope group):
PRESENTED = {"goal": ("goal", "goal_slope"), "obj": ("obj", "obj_slope"), "jaw": ("ee", "ee_slope")}
N_ROBOT = 8

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

    if OUT_3D.exists():
        shutil.rmtree(OUT_3D)
    OUT_3D.mkdir(parents=True)
    n_obj, eez = meta["n_obj"], meta["ee_z_offset"]

    def r3(v):
        return [round(x, 3) for x in v]

    def presented(f):
        A, G = f["obj"][f["atom"]], f["goal"][f["atom"]]
        jaw = [f["ee"][0], f["ee"][1], f["ee"][2] - eez]
        true = {"goal": G, "obj": A, "jaw": jaw}
        out = []
        for key, (off_g, slope_g) in PRESENTED.items():
            o, sl = offsets[off_g][0], offsets[slope_g][0]
            out += [A[d] + (1 + f["w"][sl + d]) * (true[key][d] - A[d]) + f["w"][o + d] for d in range(3)]
        return r3(out)

    episodes = []
    OUT_VID.mkdir(parents=True, exist_ok=True)
    for i, ep in enumerate(rec["episodes"]):
        frames = []
        prev_w = [0.0] * meta["p_dim"]  # before the first decision every channel is at the identity
        for f in ep["frames"]:
            w = f["w"]
            # How far the policy moved away from "no edit", per quantity: for every parameter the KL
            # divergence KL(no edit || policy) = -log2 pi(no edit), averaged over the quantity's
            # parameters, in bits (stored x100). pi(identity) = exp(-authority_nats); the hold bin
            # repeats the previous value, so it also counts as "no edit" when that value is the
            # identity. The recorder floors probabilities at 1e-6, so a parameter is at most 19.9 bits.
            def kl(c):
                p_stay = math.exp(-f["authority_nats"][c])
                if abs(prev_w[c]) < 1e-9:
                    p_stay += f["p_hold"][c]
                return -math.log2(min(1.0, max(p_stay, 1e-6)))
            shares = [round(100 * sum(kl(c) for c in cols) / len(cols)) for _, cols in quantities]
            prev_w = w
            frames.append([sum(1 for s in f["sat"] if s), f["atom"], 1 if f["carried"] else 0] + shares
                          + [round(v, 2) for v in f["act_naive"]] + [round(v, 2) for v in f["act"]])
        # 3-D view data, one lazily loaded file per episode
        pose = []
        for f in ep["frames"]:
            q = f["qpos"]
            assert len(q) == N_ROBOT + 7 * n_obj, "unexpected qpos layout"
            for j in range(n_obj):
                assert max(abs(q[N_ROBOT + 7 * j + d] - f["obj"][j][d]) for d in range(3)) < 1e-3, "qpos cube != obj"
            pose.append({"q": r3(q), "g": [r3(g) for g in f["goal"]], "s": [1 if x else 0 for x in f["sat"]],
                         "p": presented(f)})
        (OUT_3D / f"ep{i}.js").write_text(
            f"window.WARP_3D_LOADED({i}," + json.dumps(pose, separators=(",", ":")) + ");\n")
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
        "view3d": {
            "files": [f"static/js/warp_3d/ep{i}.js" for i in range(len(rec["episodes"]))],
            "n_robot": N_ROBOT,
            "cube_half": meta["cube_half_extent"],
        },
        # upper end of the KL bars: the largest per-parameter KL the recording can represent,
        # -log2(1e-6) bits (its ceiling is stored in nats), since it floors probabilities at 1e-6
        "kl_max": meta["authority_nats_ceiling"] / math.log(2),
        # frame = [placed, atom, carried, *KL per quantity in bits x100 (inputs + outputs),
        #          *skill action, *executed action]
        "episodes": episodes,
    }
    OUT_JS.write_text("// Generated by scripts/build_warp_data.py from a Warp Explorer recording. Do not edit.\n"
                      "window.WARP_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
    n = sum(len(e["frames"]) for e in episodes)
    print(f"wrote {OUT_JS.relative_to(ROOT)} ({OUT_JS.stat().st_size / 1e3:.0f} KB): "
          f"{len(episodes)} episodes, {n} decisions; videos in {OUT_VID.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
