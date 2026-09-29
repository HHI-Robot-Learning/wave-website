# WAVE project page

Static project page for *Object Count Generalization Is an Interface Problem: Warping a Frozen
Skill Instead of Retraining It* (WAVE), built on the
[Nerfies](https://github.com/nerfies/nerfies.github.io) template.

    python3 -m http.server 8000     # preview at http://localhost:8000

| Path | Contents |
|---|---|
| `index.html` | the page; `TODO` comments mark the author page links, paper links and BibTeX venue to fill in |
| `static/css/index.css`, `bulma*.css` | Nerfies template styles, unmodified |
| `static/css/wave.css` | additions for the charts and the baselines table |
| `static/js/charts.js` | interactive success-vs-count charts (hover, legend toggles, tabs) |
| `static/js/data.js` | chart data, generated, do not edit |
| `static/figures/` | architecture diagrams as standalone HTML, embedded as scaled iframes |
| `static/js/figure_notes.js` | hover notes and links on those diagrams; hotspot rectangles are in figure pixels and must be re-measured if a diagram's layout changes |
| `static/images/` | remaining paper figures copied from `../2026-ICLR-WAVE-NEW/figures` |
| `static/videos/` | task clips (abstract, gantry and Panda sections), cropped from the wandb `MOGB/wave` training montages |
| `static/js/warp_viewer.js`, `warp_data.js`, `static/videos/warp/` | the Warp Explorer section; data and episode videos come from a Warp Explorer recording via `python3 scripts/build_warp_data.py [runs/<run>/n<count>]` |
| `static/videos/sim/`, `static/videos/real_*` | task and real-robot videos, encoded from `~/Downloads/wave_videos_submission` by `python3 scripts/encode_videos.py [source dir]` |
| `scripts/build_data.py` | regenerates `data.js` from the paper's `count_curve_data.csv` |

After the paper's results change:

    python3 scripts/build_data.py
    cp ../2026-ICLR-WAVE-NEW/figures/necessity_episode.png static/images/
