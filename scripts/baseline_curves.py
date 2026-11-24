import re
import subprocess
import tempfile
import xml.etree.ElementTree as ElementTree
from pathlib import Path

SVG_NAMESPACE = "{http://www.w3.org/2000/svg}"
# Line colors of the paper's count_curve.py baseline figure, one per baseline.
BASELINE_BY_COLOR = {
    "#1f5fbf": "wave",
    "#e0457b": "fixed_input_edit",
    "#2a8f5c": "finetune",
    "#8c6d3f": "cropft0",
    "#d4a017": "cropft1",
    "#b8701e": "eit",
    "#3a3a3a": "eit_distilled",
    "#7b3fa0": "jsrl",
    "#c2443c": "hrl",
    "#3f8fa0": "croptd7",
}
OBJECT_COUNTS = range(1, 31)
SEED_RANGE_BAND_OPACITY = "0.15"


def hex_color(svg_rgb_percent):
    percentages = [float(value.strip().rstrip("%")) for value in svg_rgb_percent[4:-1].split(",")]
    return "#" + "".join(f"{round(percent * 2.55):02x}" for percent in percentages)


def coordinates(path_data):
    numbers = [float(number) for number in re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", path_data)]
    return list(zip(numbers[0::2], numbers[1::2]))


def element_baseline(element):
    stroke = element.get("stroke", "")
    color = stroke if stroke.startswith("rgb") else element.get("fill", "")
    return BASELINE_BY_COLOR.get(hex_color(color)) if color.startswith("rgb") else None


def vertical_crossings(polygon, x_position):
    """Every y at which the closed polygon crosses the vertical line at x_position."""
    crossings = []
    for (x_start, y_start), (x_end, y_end) in zip(polygon, polygon[1:] + polygon[:1]):
        if abs(x_end - x_start) < 1e-6:
            if abs(x_start - x_position) < 0.05:
                crossings += [y_start, y_end]
        elif min(x_start, x_end) - 1e-6 <= x_position <= max(x_start, x_end) + 1e-6:
            crossings.append(y_start + (y_end - y_start) * (x_position - x_start) / (x_end - x_start))
    return crossings


def baseline_curves(figure_pdf):
    """Per baseline, [object count, mean success, seed minimum, seed maximum] for counts 1 to 30,
    read from the vector paths of one of the paper's baseline figures (line_baselines.pdf or
    tower_baselines.pdf). Means come from the 30 markers of each curve, which matplotlib places
    at the exact data points; the seed range comes from the shaded band. The y axis is
    calibrated on two points of the figure itself: TD7 on the crop is 0 at every count, and WAVE
    is 1 at one object."""
    with tempfile.TemporaryDirectory() as scratch_directory:
        svg_path = Path(scratch_directory) / "figure.svg"
        subprocess.run(["pdftocairo", "-svg", str(figure_pdf), str(svg_path)], check=True,
                       stderr=subprocess.DEVNULL)
        root = ElementTree.parse(svg_path).getroot()

    marker_positions = {}
    bands = {}
    for element in root.iter(SVG_NAMESPACE + "path"):
        baseline = element_baseline(element)
        if baseline is None:
            continue
        if element.get("fill-opacity") == SEED_RANGE_BAND_OPACITY:
            bands[baseline] = coordinates(element.get("d"))
            continue
        matrix = [float(value) for value in re.findall(r"-?\d+\.?\d*", element.get("transform", ""))]
        if len(matrix) == 6 and matrix[4] != 0.0:
            marker_positions.setdefault(baseline, {})[round(matrix[4], 2)] = matrix[5]

    x_positions = sorted({x for positions in marker_positions.values() for x in positions})
    assert len(x_positions) == len(OBJECT_COUNTS), f"expected 30 marker columns, found {len(x_positions)}"
    zero_markers = set(round(y, 3) for y in marker_positions["croptd7"].values())
    assert len(zero_markers) == 1, "TD7 on the crop is no longer flat at 0, recalibrate the y axis"
    y_at_zero = marker_positions["croptd7"][x_positions[0]]
    y_at_one = marker_positions["wave"][x_positions[0]]
    assert y_at_one == min(y for positions in marker_positions.values() for y in positions.values())

    def success(y):
        return (y_at_zero - y) / (y_at_zero - y_at_one)

    curves = {}
    for baseline, positions in marker_positions.items():
        assert len(positions) == len(OBJECT_COUNTS), f"{baseline}: {len(positions)} markers"
        points = []
        for object_count, x_position in zip(OBJECT_COUNTS, x_positions):
            mean = success(positions[x_position])
            crossings = vertical_crossings(bands[baseline], x_position) if baseline in bands else []
            seed_values = [success(y) for y in crossings] or [mean]
            points.append([object_count, round(mean, 3), round(min(seed_values), 3), round(max(seed_values), 3)])
        curves[baseline] = points
    return curves
