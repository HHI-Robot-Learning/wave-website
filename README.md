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
| `static/images/` | figures and snapshots copied from `../2026-ICLR-WAVE-NEW/figures` |
| `static/videos/` | task clips (abstract, gantry and Panda sections), cropped from the wandb `MOGB/wave` training montages |
| `scripts/fetch_videos.py` | re-downloads and re-encodes those clips (`../26-MOGB/.venv/bin/python scripts/fetch_videos.py`) |
| `scripts/build_data.py` | regenerates `data.js` from the paper's `count_curve_data.csv` |

After the paper's results change:

    python3 scripts/build_data.py
    cp ../2026-ICLR-WAVE-NEW/figures/{architecture,warp_architecture,necessity_episode}.png static/images/
