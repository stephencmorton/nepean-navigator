#!/usr/bin/env python3
"""Generate the app's map geometry from the master SVG.

Usage:
    python3 tools/extract_svg_map.py --module-output map-geometry.js
    python3 tools/extract_svg_map.py --input public --output /tmp/school-map.json

Centerlines are calculated from the medial axes of the named hallway outlines
(groups with IDs like hallway-1 or hallway3-0) in tools/floorplans.svg, then
split between buildings by their building-<b>-<floor> outlines. Stairwells,
hallway steps, entrances, and room markers come from their named groups.
See "Drawing rules for floorplans.svg" in CONTRIBUTING.md.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from export_floor_svgs import floor_layers


SVG_NS = "http://www.w3.org/2000/svg"
BLUE = {"#284283", "#284283ff"}
RED = {"#f51e0d", "#f51e0dff", "#ed111a", "#ed111aff"}
BROWN = {"#803300", "#803300ff"}
BLACK = {"#000000", "#000000ff", "#010101", "#010101ff"}
SHAPE_TAGS = {"path", "rect", "polygon", "polyline", "line", "circle", "ellipse"}
TRANSFORM_RE = re.compile(r"([A-Za-z]+)\s*\(([^)]*)\)")
NUMBER_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?")
PATH_TOKEN_RE = re.compile(r"[A-Za-z]|" + NUMBER_RE.pattern)

# Affine matrices use SVG's [a c e; b d f; 0 0 1] convention.
IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def multiply(left: tuple[float, ...], right: tuple[float, ...]) -> tuple[float, ...]:
    a, b, c, d, e, f = left
    g, h, i, j, k, l = right
    return (
        a * g + c * h,
        b * g + d * h,
        a * i + c * j,
        b * i + d * j,
        a * k + c * l + e,
        b * k + d * l + f,
    )


def parse_transform(value: str | None) -> tuple[float, ...]:
    result = IDENTITY
    if not value:
        return result
    for name, raw_args in TRANSFORM_RE.findall(value):
        args = [float(v) for v in NUMBER_RE.findall(raw_args)]
        matrix = IDENTITY
        if name == "matrix" and len(args) == 6:
            matrix = tuple(args)
        elif name == "translate" and args:
            matrix = (1, 0, 0, 1, args[0], args[1] if len(args) > 1 else 0)
        elif name == "scale" and args:
            matrix = (args[0], 0, 0, args[1] if len(args) > 1 else args[0], 0, 0)
        elif name == "rotate" and args:
            angle = math.radians(args[0])
            cosine, sine = math.cos(angle), math.sin(angle)
            rotation = (cosine, sine, -sine, cosine, 0, 0)
            if len(args) >= 3:
                cx, cy = args[1:3]
                matrix = multiply(multiply((1, 0, 0, 1, cx, cy), rotation), (1, 0, 0, 1, -cx, -cy))
            else:
                matrix = rotation
        elif name == "skewX" and args:
            matrix = (1, 0, math.tan(math.radians(args[0])), 1, 0, 0)
        elif name == "skewY" and args:
            matrix = (1, math.tan(math.radians(args[0])), 0, 1, 0, 0)
        result = multiply(result, matrix)
    return result


def transform_point(matrix: tuple[float, ...], x: float, y: float) -> list[float]:
    a, b, c, d, e, f = matrix
    return [round(a * x + c * y + e, 5), round(b * x + d * y + f, 5)]


def turn_between(incoming: tuple[float, float], outgoing: tuple[float, float]) -> str:
    """Return the turn for ordered vectors in SVG coordinates (positive Y is down)."""
    cross = incoming[0] * outgoing[1] - incoming[1] * outgoing[0]
    dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1]
    if abs(cross) < 1e-9:
        return "straight" if dot >= 0 else "reverse"
    return "right" if cross > 0 else "left"


def path_endpoints(value: str) -> list[tuple[float, float]]:
    """Read endpoints for the common straight path commands used by markers."""
    tokens = PATH_TOKEN_RE.findall(value)
    points: list[tuple[float, float]] = []
    command = None
    x = y = 0.0
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]
            i += 1
            if command in "Zz":
                continue
        if command is None:
            break
        lower = command.lower()
        relative = command.islower()
        if lower in {"m", "l", "t"} and i + 1 < len(tokens) and not tokens[i].isalpha() and not tokens[i + 1].isalpha():
            nx, ny = float(tokens[i]), float(tokens[i + 1])
            x, y = (x + nx, y + ny) if relative else (nx, ny)
            points.append((x, y)); i += 2
            if lower == "m": command = "l" if relative else "L"
        elif lower == "h" and i < len(tokens) and not tokens[i].isalpha():
            nx = float(tokens[i]); x = x + nx if relative else nx
            points.append((x, y)); i += 1
        elif lower == "v" and i < len(tokens) and not tokens[i].isalpha():
            ny = float(tokens[i]); y = y + ny if relative else ny
            points.append((x, y)); i += 1
        else:
            # Curves/arcs are not needed for the straight red stair arrows.
            # Skip their numeric payload while preserving later commands.
            i += 1
    return points


def parse_style(style: str | None) -> dict[str, str]:
    values = {}
    for declaration in (style or "").split(";"):
        if ":" in declaration:
            key, value = declaration.split(":", 1)
            values[key.strip().lower()] = value.strip().lower()
    return values


def color(value: str | None) -> str | None:
    if not value or value.lower() in {"none", "context-stroke", "currentcolor"}:
        return None
    return value.strip().lower()


def fmt(value: float) -> float:
    return round(value, 5)


def linear_polygons(value: str) -> list[list[tuple[float, float]]]:
    """Read closed subpaths made from SVG M/L/H/V commands."""
    tokens = PATH_TOKEN_RE.findall(value)
    polygons: list[list[tuple[float, float]]] = []
    points: list[tuple[float, float]] = []
    x = y = sx = sy = 0.0
    command: str | None = None
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]
            i += 1
            if command.upper() == "Z":
                if len(points) >= 4:
                    polygons.append(points)
                points = []
                x, y = sx, sy
                command = None
                continue
        if command is None:
            continue
        name, relative = command.upper(), command.islower()
        if name in {"M", "L"} and i + 1 < len(tokens) and not tokens[i].isalpha():
            nx, ny = float(tokens[i]), float(tokens[i + 1])
            x, y = (x + nx, y + ny) if relative else (nx, ny)
            if name == "M":
                if points:
                    points = []
                sx, sy = x, y
                points.append((x, y))
                command = "l" if relative else "L"
            else:
                points.append((x, y))
            i += 2
        elif name == "H" and i < len(tokens) and not tokens[i].isalpha():
            nx = float(tokens[i]); x = x + nx if relative else nx
            points.append((x, y)); i += 1
        elif name == "V" and i < len(tokens) and not tokens[i].isalpha():
            ny = float(tokens[i]); y = y + ny if relative else ny
            points.append((x, y)); i += 1
        else:
            # Curves and arcs are not hallway-outline primitives in this map.
            # Skip their subpath but continue at the next move command.
            points = []
            command = None
            while i < len(tokens) and not tokens[i].isalpha():
                i += 1
    return polygons


def hallway_mask(layer: ET.Element, vb: list[float]) -> set[tuple[int, int]]:
    """Rasterize the named hallway areas of one floor layer."""
    mask: set[tuple[int, int]] = set()
    for element, matrix, _style, ids in walk(layer, IDENTITY, {}, []):
        # The descriptive hallway IDs live on their groups, so the geometry
        # below them can be selected independent of its Inkscape-generated ID.
        if not is_named_hallway(ids):
            continue
        tag = element.tag.rsplit("}", 1)[-1]
        outlines: list[list[tuple[float, float]]] = []
        if tag == "path":
            outlines = linear_polygons(element.get("d", ""))
        elif tag == "rect":
            x, y = float(element.get("x", "0")), float(element.get("y", "0"))
            width, height = float(element.get("width", "0")), float(element.get("height", "0"))
            if width > 0 and height > 0:
                outlines = [[(x, y), (x + width, y), (x + width, y + height), (x, y + height)]]
        for outline in outlines:
            polygon = [
                (point[0] * 773 / vb[2], point[1] * 742 / vb[3])
                for point in (transform_point(matrix, x, y) for x, y in outline)
            ]
            mask.update(polygon_mask(polygon))
    return mask


def is_named_hallway(ids: list[str]) -> bool:
    return any(re.fullmatch(r"hallway[a-z0-9]*-\d+", identifier, re.IGNORECASE) for identifier in ids)


def named_categories(ids: list[str]) -> set[str]:
    """Return categories carried by descriptive IDs on elements or ancestors."""
    categories: set[str] = set()
    for identifier in ids:
        if re.fullmatch(r"hallway[a-z0-9]*-\d+", identifier, re.IGNORECASE):
            categories.add("blueFeatures")
        if re.fullmatch(r"entrance-[a-z0-9]+-\d+", identifier, re.IGNORECASE):
            categories.add("entrances")
        if re.fullmatch(r"building-[a-z0-9]+-\d+", identifier, re.IGNORECASE):
            categories.add("buildingGeometry")
        if re.fullmatch(r"(?:gstairs|stairwell|stairs)-[a-z0-9]+-\d+", identifier, re.IGNORECASE):
            categories.add("stairwells")
    return categories


def descriptive_name(ids: list[str]) -> str | None:
    """Return the deepest recognized descriptive group ID, if present."""
    patterns = (
        r"hallway[a-z0-9]*-\d+", r"entrance-[a-z0-9]+-\d+",
        r"building-[a-z0-9]+-\d+", r"(?:gstairs|stairwell|stairs)-[a-z0-9]+-\d+",
    )
    for identifier in reversed(ids):
        if any(re.fullmatch(pattern, identifier, re.IGNORECASE) for pattern in patterns):
            return identifier
    return None


def simplify_line(line: list[tuple[int, int]], tolerance: float = 1.2) -> list[list[float]]:
    if len(line) <= 2:
        return [[float(x), float(y)] for x, y in line]
    a, b = line[0], line[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    distances = [abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / length
                 if length else math.dist((x, y), a) for x, y in line[1:-1]]
    if not distances or max(distances) <= tolerance:
        return [[float(x), float(y)] for x, y in (a, b)]
    split = distances.index(max(distances)) + 1
    return simplify_line(line[:split + 1], tolerance)[:-1] + simplify_line(line[split:], tolerance)


def skeleton_polylines(skeleton: set[tuple[int, int]]) -> list[list[list[float]]]:
    """Trace and simplify the medial-axis graph as ordered line segments."""
    neighbors: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for x, y in skeleton:
        adjacent = [(x + dx, y + dy) for dx, dy in
                    ((0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1))]
        neighbors[(x, y)] = [point for point in adjacent if point in skeleton]
    visited: set[tuple[tuple[int, int], tuple[int, int]]] = set()

    def edge(a: tuple[int, int], b: tuple[int, int]):
        return (a, b) if a < b else (b, a)

    polylines: list[list[list[float]]] = []
    node_pixels = {point for point in skeleton if len(neighbors[point]) != 2}
    clusters: list[set[tuple[int, int]]] = []
    remaining = set(node_pixels)
    while remaining:
        seed = remaining.pop()
        cluster, pending = {seed}, [seed]
        while pending:
            point = pending.pop()
            adjacent = [other for other in neighbors[point] if other in remaining]
            remaining.difference_update(adjacent)
            cluster.update(adjacent)
            pending.extend(adjacent)
        clusters.append(cluster)
    cluster_for = {point: i for i, cluster in enumerate(clusters) for point in cluster}
    representatives = []
    for cluster in clusters:
        cx = sum(x for x, _ in cluster) / len(cluster)
        cy = sum(y for _, y in cluster) / len(cluster)
        representatives.append(min(cluster, key=lambda point: (point[0] - cx) ** 2 + (point[1] - cy) ** 2))

    for cluster_index, cluster in enumerate(clusters):
        start = representatives[cluster_index]
        for pixel in cluster:
            for next_point in neighbors[pixel]:
                if next_point in node_pixels or edge(pixel, next_point) in visited:
                    continue
                line = [start, next_point]
                visited.add(edge(pixel, next_point))
                previous, current = pixel, next_point
                while current not in node_pixels:
                    candidate = next(point for point in neighbors[current] if point != previous)
                    if edge(current, candidate) in visited:
                        break
                    visited.add(edge(current, candidate))
                    line.append(candidate)
                    previous, current = current, candidate
                end_index = cluster_for.get(current)
                if end_index is not None:
                    line.append(representatives[end_index])
                simplified = simplify_line(line)
                if len(simplified) >= 2 and sum(math.dist(a, b) for a, b in zip(simplified, simplified[1:])) >= 5:
                    polylines.append(simplified)
    for start in skeleton:
        for next_point in neighbors[start]:
            if edge(start, next_point) in visited:
                continue
            line = [start, next_point]
            visited.add(edge(start, next_point))
            previous, current = start, next_point
            while current != start:
                choices = [point for point in neighbors[current] if point != previous]
                if not choices:
                    break
                candidate = choices[0]
                if edge(current, candidate) in visited:
                    break
                visited.add(edge(current, candidate))
                line.append(candidate)
                previous, current = current, candidate
            simplified = simplify_line(line)
            if len(simplified) >= 2 and sum(math.dist(a, b) for a, b in zip(simplified, simplified[1:])) >= 5:
                polylines.append(simplified)
    unique = {}
    for line in polylines:
        forward = tuple(tuple(point) for point in line)
        reverse = tuple(reversed(forward))
        unique[min(forward, reverse)] = line
    return list(unique.values())


def extract_centerlines(source: Path) -> dict[str, list[list[list[float]]]]:
    """Generate one traced hallway network per floor from blue SVG outlines."""
    root = ET.parse(source).getroot()
    vb = [float(value) for value in root.get("viewBox", "0 0 0 0").split()]
    if len(vb) != 4 or vb[2] <= 0 or vb[3] <= 0:
        raise ValueError(f"{source}: invalid or missing viewBox")
    layers = floor_layers(root, source)
    result = {}
    for floor, layer in sorted(layers.items()):
        # The master file stores its Inkscape editing visibility. The selected
        # layer must still be read even when it was hidden when the file saved.
        style = parse_style(layer.get("style"))
        style["display"] = "inline"
        layer.set("style", ";".join(f"{key}:{value}" for key, value in style.items()))
        mask = hallway_mask(layer, vb)
        if not mask:
            raise ValueError(f"{source}: floor {floor} has no blue hallway outline geometry")
        centerline = thin_mask(mask)
        paths = skeleton_polylines(centerline)
        if not paths:
            raise ValueError(f"{source}: floor {floor} hallway outline produced no centerline")
        result[str(floor)] = paths
    return result


def polygon_mask(polygon: list[tuple[float, float]]) -> set[tuple[int, int]]:
    """Rasterize an orthogonal hallway outline at one app pixel per unit."""
    mask: set[tuple[int, int]] = set()
    for y in range(742):
        scan_y = y + 0.5
        intersections = []
        for (x1, y1), (x2, y2) in zip(polygon, polygon[1:] + polygon[:1]):
            if (y1 <= scan_y < y2) or (y2 <= scan_y < y1):
                intersections.append(x1 + (scan_y - y1) * (x2 - x1) / (y2 - y1))
        intersections.sort()
        for left, right in zip(intersections[::2], intersections[1::2]):
            for x in range(max(0, math.ceil(left - 0.5)), min(773, math.ceil(right - 0.5))):
                mask.add((x, y))
    return mask


def thin_mask(mask: set[tuple[int, int]]) -> set[tuple[int, int]]:
    """Zhang-Suen thinning leaves a one-pixel medial skeleton of the halls."""
    while True:
        changed = False
        for phase in (0, 1):
            remove = []
            for x, y in mask:
                if not (0 < x < 772 and 0 < y < 741):
                    continue
                neighbors = [
                    (x, y - 1) in mask, (x + 1, y - 1) in mask,
                    (x + 1, y) in mask, (x + 1, y + 1) in mask,
                    (x, y + 1) in mask, (x - 1, y + 1) in mask,
                    (x - 1, y) in mask, (x - 1, y - 1) in mask,
                ]
                count = sum(neighbors)
                transitions = sum(not neighbors[i] and neighbors[(i + 1) % 8] for i in range(8))
                if count < 2 or count > 6 or transitions != 1:
                    continue
                if phase == 0 and ((neighbors[0] and neighbors[2] and neighbors[4]) or
                                   (neighbors[2] and neighbors[4] and neighbors[6])):
                    continue
                if phase == 1 and ((neighbors[0] and neighbors[2] and neighbors[6]) or
                                   (neighbors[0] and neighbors[4] and neighbors[6])):
                    continue
                remove.append((x, y))
            if remove:
                mask.difference_update(remove)
                changed = True
        if not changed:
            return mask


def element_attrs(element: ET.Element) -> dict[str, Any]:
    tag = element.tag.rsplit("}", 1)[-1]
    attrs: dict[str, Any] = {}
    for name in ("d", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "rx", "ry", "r", "cx", "cy", "points"):
        if name in element.attrib:
            attrs[name] = element.attrib[name]
    if "href" in element.attrib:
        attrs["href"] = element.attrib["href"]
    if tag == "text":
        attrs["text"] = " ".join("".join(element.itertext()).split())
    return attrs


def walk(element: ET.Element, parent_matrix: tuple[float, ...], parent_style: dict[str, str], parent_ids: list[str]):
    tag = element.tag.rsplit("}", 1)[-1]
    matrix = multiply(parent_matrix, parse_transform(element.get("transform")))
    style = dict(parent_style)
    style.update(parse_style(element.get("style")))
    for key in ("fill", "stroke", "opacity", "display", "visibility", "stroke-width", "marker-end", "marker-start"):
        if element.get(key) is not None:
            style[key] = element.get(key, "")
    # A child cannot make itself visible through a hidden parent layer.
    if style.get("display") == "none" or style.get("visibility") == "hidden":
        return
    ids = parent_ids + ([element.get("id")] if element.get("id") else [])
    yield element, matrix, style, ids
    for child in list(element):
        yield from walk(child, matrix, style, ids)


def classify_shape(style: dict[str, str], ids: list[str] | None = None) -> set[str]:
    fill, stroke = color(style.get("fill")), color(style.get("stroke"))
    cats: set[str] = named_categories(ids or [])
    if fill in BLUE or stroke in BLUE:
        cats.add("blueFeatures")
    if fill in RED or stroke in RED:
        cats.add("redStairMarkers")
    if fill in BROWN or stroke in BROWN:
        cats.add("entrances")
    if fill in BLACK or stroke in BLACK:
        cats.add("buildingGeometry")
    return cats


def extract_file(path: Path) -> dict[str, Any]:
    root = ET.parse(path).getroot()
    view_box = root.get("viewBox", "0 0 0 0").split()
    if len(view_box) != 4:
        raise ValueError(f"{path}: invalid or missing viewBox")
    vb = [float(part) for part in view_box]
    floor_match = re.search(r"floor-(\d+)\.svg$", path.name)
    if not floor_match:
        raise ValueError(f"{path}: filename must be floor-N.svg")
    floor = int(floor_match.group(1))

    features: list[dict[str, Any]] = []
    labels: list[dict[str, Any]] = []
    for element, matrix, style, ids in walk(root, IDENTITY, {}, []):
        tag = element.tag.rsplit("}", 1)[-1]
        if style.get("display") == "none" or style.get("visibility") == "hidden":
            continue
        attrs = element_attrs(element)
        if tag in SHAPE_TAGS:
            categories = classify_shape(style, ids)
            if not categories:
                continue
            # A matching ancestor id chain preserves grouping and source references.
            feature = {
                "id": element.get("id"),
                "sourceGroupIds": ids[:-1],
                "descriptiveName": descriptive_name(ids),
                "tag": tag,
                "categories": sorted(categories),
                "fill": color(style.get("fill")),
                "stroke": color(style.get("stroke")),
                "strokeWidth": style.get("stroke-width"),
                "markerEnd": style.get("marker-end"),
                "transform": list(matrix),
                "geometry": attrs,
            }
            if tag == "rect" and all(k in attrs for k in ("x", "y", "width", "height")):
                x, y = float(attrs["x"]), float(attrs["y"])
                w, h = float(attrs["width"]), float(attrs["height"])
                feature["corners"] = [
                    transform_point(matrix, x, y), transform_point(matrix, x + w, y),
                    transform_point(matrix, x + w, y + h), transform_point(matrix, x, y + h),
                ]
                feature["center"] = transform_point(matrix, x + w / 2, y + h / 2)
            features.append(feature)
        elif tag == "text":
            text = attrs.get("text", "")
            if not text:
                continue
            x_values = element.findall(f".//{{{SVG_NS}}}tspan")
            x_raw = element.get("x") or (x_values[0].get("x") if x_values else "0")
            y_raw = element.get("y") or (x_values[0].get("y") if x_values else "0")
            try:
                x, y = float(NUMBER_RE.search(x_raw).group()), float(NUMBER_RE.search(y_raw).group())
            except (AttributeError, ValueError):
                x, y = 0.0, 0.0
            labels.append({
                "id": element.get("id"), "text": text,
                "color": color(style.get("fill")) or color(style.get("stroke")),
                "point": transform_point(matrix, x, y), "sourceGroupIds": ids[:-1],
                "descriptiveName": descriptive_name(ids),
            })

    # Arrow direction is encoded by the nearby UP/DN text; retain both as
    # separate source features so a reviewer can confirm visual associations.
    stairs = []
    for marker in (f for f in features if "redStairMarkers" in f["categories"]):
        d = marker["geometry"].get("d", "")
        endpoints = path_endpoints(d)
        samples = [transform_point(tuple(marker["transform"]), *point) for point in endpoints]
        midpoint = [sum(point[axis] for point in samples) / len(samples) for axis in (0, 1)] if samples else None
        candidates = []
        for label in labels:
            if label["text"].upper() not in {"UP", "DN"} or midpoint is None:
                continue
            distance = math.dist(midpoint, label["point"])
            if distance <= 10:
                candidates.append((distance, label))
        candidates.sort(key=lambda item: item[0])
        stairs.append({"arrow": marker, "directionLabels": [label for _, label in candidates[:1]],
                       "directionLabelDistance": round(candidates[0][0], 3) if candidates else None})

    buildings = []
    for label in labels:
        if label["text"].upper() in {"MAIN BUILDING", "MATHSCIENCE", "MATH SCIENCE", "ART", "ENGLISH", "GYM", "MUSICAUDITORIUM", "MUSIC", "AUDITORIUM", "CAFETERIA", "FRENCH"}:
            buildings.append(label)

    return {
        "floor": floor,
        "source": path.as_posix(),
        "viewBox": [fmt(v) for v in vb],
        "buildingsAndRoomDescriptions": buildings,
        "labels": labels,
        "entrances": [f for f in features if "entrances" in f["categories"]],
        "stairwells": [f for f in features if "stairwells" in f["categories"]],
        "blueFeatures": [f for f in features if "blueFeatures" in f["categories"]],
        "buildingGeometry": [f for f in features if "buildingGeometry" in f["categories"]],
        "hallwayStairMarkers": stairs,
        "otherFeatures": [f for f in features if not set(f["categories"]).intersection({"blueFeatures", "buildingGeometry", "entrances", "stairwells", "redStairMarkers"})],
    }


FEATURE_RE = re.compile(r"(building|gstairs|steps|entrance)-([a-z0-9-]+)-(\d+)|room-(\d{4})(?:-[a-z0-9-]+)?", re.IGNORECASE)
STEPS_RE = re.compile(r"(.+?)-(half-flight|full-flight|flight|\d+-steps)", re.IGNORECASE)
# Hallway pieces, stairs and steps outside every building outline belong to the
# nearest building on their floor when it is within this many canvas units.
MAX_GAP = 100
# Buildings whose hallway ends are closer than this get a computed port.
PORT_GAP = 30


def canvas_point(matrix: tuple[float, ...], x: float, y: float, vb: list[float]) -> tuple[float, float]:
    px, py = transform_point(matrix, x, y)
    return ((px - vb[0]) * 773 / vb[2], (py - vb[1]) * 742 / vb[3])


def shape_points(element: ET.Element, matrix: tuple[float, ...], vb: list[float]) -> list[tuple[float, float]]:
    """Return canvas points outlining a straight-sided shape, or the centre of a circle."""
    tag = element.tag.rsplit("}", 1)[-1]
    if tag == "path":
        return [canvas_point(matrix, x, y, vb) for x, y in path_endpoints(element.get("d", ""))]
    if tag == "rect":
        x, y = float(element.get("x", "0")), float(element.get("y", "0"))
        w, h = float(element.get("width", "0")), float(element.get("height", "0"))
        return [canvas_point(matrix, px, py, vb) for px, py in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]
    if tag in {"circle", "ellipse"}:
        return [canvas_point(matrix, float(element.get("cx", "0")), float(element.get("cy", "0")), vb)]
    return []


def layer_features(layer: ET.Element, floor: int, vb: list[float], source: Path) -> dict[str, dict[str, Any]]:
    """Collect the points, arrows and labels of each named feature group on one floor."""
    features: dict[str, dict[str, Any]] = {}
    for element, matrix, style, ids in walk(layer, IDENTITY, {}, []):
        identifier = element.get("id")
        match = FEATURE_RE.fullmatch(identifier or "")
        if match and match.group(3):
            suffix = match.group(3)
            if int(suffix) != floor:
                raise ValueError(f"{source}: {identifier} is on layer {floor}_floor but its name says floor {suffix}")
        owner = next((i for i in reversed(ids) if FEATURE_RE.fullmatch(i)), None)
        if owner is None:
            continue
        feature = features.setdefault(owner, {"points": [], "arrows": [], "labels": []})
        tag = element.tag.rsplit("}", 1)[-1]
        points = shape_points(element, matrix, vb)
        feature["points"] += points
        if tag == "path" and style.get("marker-end", "none") != "none" and color(style.get("stroke")) in RED and len(points) >= 2:
            feature["arrows"].append((points[0], points[-1]))
        if tag == "text":
            feature["labels"].append(" ".join("".join(element.itertext()).split()))
    return features


def bbox(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))


def centre(points: list[tuple[float, float]]) -> list[float]:
    x0, y0, x1, y1 = bbox(points)
    return [round((x0 + x1) / 2, 1), round((y0 + y1) / 2, 1)]


def rect_distance(point: tuple[float, float], rect: tuple[float, float, float, float]) -> float:
    dx = max(rect[0] - point[0], 0, point[0] - rect[2])
    dy = max(rect[1] - point[1], 0, point[1] - rect[3])
    return math.hypot(dx, dy)


def rect_depth(point: tuple[float, float], rect: tuple[float, float, float, float]) -> float:
    return min(point[0] - rect[0], rect[2] - point[0], point[1] - rect[1], rect[3] - point[1])


def owner_of(point, footprints: dict[str, list[tuple[float, ...]]], present: set[str]) -> str | None:
    """Return the building containing a point (the deepest, if outlines overlap), else the nearest one."""
    inside = [(max(rect_depth(point, rect) for rect in footprints[b] if rect_distance(point, rect) == 0), b)
              for b in present if any(rect_distance(point, rect) == 0 for rect in footprints[b])]
    if inside:
        return max(inside)[1]
    distance, building = min((min(rect_distance(point, rect) for rect in footprints[b]), b) for b in present)
    return building if distance <= MAX_GAP else None


def split_by_building(lines, footprints, present):
    """Split centerline polylines where they pass from one building's outline to another's."""
    pieces: dict[str, list[list[list[float]]]] = {}
    unassigned = 0.0
    for line in lines:
        current, points = None, []
        for a, b in zip(line, line[1:]):
            length = math.dist(a, b)
            steps = max(1, math.ceil(length / 0.5))
            for i in range(steps):
                t0, t1 = i / steps, (i + 1) / steps
                mid = (a[0] + (b[0] - a[0]) * (t0 + t1) / 2, a[1] + (b[1] - a[1]) * (t0 + t1) / 2)
                start = [round(a[0] + (b[0] - a[0]) * t0, 1), round(a[1] + (b[1] - a[1]) * t0, 1)]
                building = owner_of(mid, footprints, present)
                if building != current:
                    if points and points[-1] != start:
                        points.append(start)
                    if current is not None and len(points) >= 2:
                        pieces.setdefault(current, []).append(points)
                    current, points = building, [start]
                if building is None:
                    unassigned += length / steps
            end = [round(b[0], 1), round(b[1], 1)]
            if points[-1] != end:
                points.append(end)
        if current is not None and len(points) >= 2:
            pieces.setdefault(current, []).append(points)
    return pieces, unassigned


def project(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length_squared = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length_squared)) if length_squared else 0.0
    return [a[0] + t * dx, a[1] + t * dy]


def closest_points(lines_a, lines_b):
    """Return (distance, point on a, point on b) for the closest approach of two polyline sets."""
    best = (math.inf, None, None)
    segments_a = [(p, q) for line in lines_a for p, q in zip(line, line[1:])]
    segments_b = [(p, q) for line in lines_b for p, q in zip(line, line[1:])]
    for a0, a1 in segments_a:
        for b0, b1 in segments_b:
            for point, (s0, s1), from_a in ((a0, (b0, b1), True), (a1, (b0, b1), True), (b0, (a0, a1), False), (b1, (a0, a1), False)):
                other = project(point, s0, s1)
                distance = math.dist(point, other)
                if distance < best[0] - 1e-9:
                    best = (distance, point, other) if from_a else (distance, other, point)
    return best


def components(lines) -> int:
    """Count the connected pieces of a set of polylines that share exact vertices."""
    parent: dict[tuple[float, float], tuple[float, float]] = {}

    def root(point):
        while parent.setdefault(point, point) != point:
            point = parent[point]
        return point
    for line in lines:
        for p, q in zip(line, line[1:]):
            parent[root(tuple(p))] = root(tuple(q))
    return len({root(point) for point in list(parent)})


def steps_feature(name: str, feature: dict[str, Any], source: Path) -> dict[str, Any]:
    match = STEPS_RE.fullmatch(name)
    if not match:
        raise ValueError(f"{source}: steps-{name} must end in half-flight, flight, full-flight or <n>-steps before the floor")
    labels = [label.upper() for label in feature["labels"] if label.upper() in {"UP", "DN"}]
    if len(feature["arrows"]) != 1 or len(labels) != 1:
        raise ValueError(f"{source}: steps-{name} needs exactly one red arrow and one UP or DN label")
    (tail, head), = feature["arrows"]
    dx, dy = head[0] - tail[0], head[1] - tail[1]
    arrow = [1 if dx > 0 else -1, 0] if abs(dx) >= abs(dy) else [0, 1 if dy > 0 else -1]
    uphill = arrow if labels[0] == "UP" else [-value for value in arrow]
    extent = match.group(2).lower().replace("full-flight", "flight").replace("-steps", " steps")
    return {"point": centre(feature["points"]), "extent": extent, "uphill": uphill}


def extract_geometry(source: Path) -> dict[str, Any]:
    """Build the generated map-geometry module data from the master SVG."""
    centerlines = extract_centerlines(source)
    root = ET.parse(source).getroot()
    vb = [float(value) for value in root.get("viewBox", "0 0 0 0").split()]
    per_floor = {}
    for floor, layer in sorted(floor_layers(root, source).items()):
        style = parse_style(layer.get("style"))
        style["display"] = "inline"
        layer.set("style", ";".join(f"{key}:{value}" for key, value in style.items()))
        per_floor[floor] = layer_features(layer, floor, vb, source)

    footprints: dict[str, list[tuple[float, ...]]] = {}
    present: dict[int, set[str]] = {}
    for floor, features in per_floor.items():
        for identifier, feature in features.items():
            match = re.fullmatch(r"building-(\d)[a-z]?-\d+", identifier)
            if match:
                rect = tuple(round(value, 1) for value in bbox(feature["points"]))
                if rect not in footprints.setdefault(match.group(1), []):
                    footprints[match.group(1)].append(rect)
                present.setdefault(floor, set()).add(match.group(1))

    floors: dict[str, dict[str, Any]] = {}
    entrances: dict[str, dict[str, list[float]]] = {}
    rooms: dict[str, list[float]] = {}
    warnings = []
    for floor, features in per_floor.items():
        buildings = present.get(floor, set())
        pieces, unassigned = split_by_building(centerlines[str(floor)], footprints, buildings)
        if unassigned:
            warnings.append(f"floor {floor}: {unassigned:.0f} units of hallway are more than {MAX_GAP} from any building")
        for building in sorted(buildings):
            floors[f"{building}-{floor}"] = {"paths": pieces.get(building, []), "stairs": {}, "steps": {}, "ports": {}}
        for identifier, feature in sorted(features.items()):
            kind, _, rest = identifier.partition("-")
            if kind == "building" or not feature["points"]:
                continue
            name = rest.rsplit("-", 1)[0]
            if kind == "room":
                if int(rest[0]) != floor:
                    warnings.append(f"{identifier} is on layer {floor}_floor but room {rest[:4]} is on floor {rest[0]}; ignored")
                else:
                    rooms[rest[:4]] = centre(feature["points"])
                continue
            if kind == "entrance":
                entrances.setdefault(name.upper(), {})[str(floor)] = centre(feature["points"])
                continue
            building = owner_of(tuple(centre(feature["points"])), footprints, buildings)
            if building is None:
                raise ValueError(f"{source}: {identifier} is more than {MAX_GAP} units from any building on floor {floor}")
            node = floors[f"{building}-{floor}"]
            if kind == "gstairs":
                node["stairs"][name] = centre(feature["points"])
            else:
                steps = steps_feature(name, feature, source)
                node["steps"][STEPS_RE.fullmatch(name).group(1)] = steps
        nodes = [f"{building}-{floor}" for building in sorted(buildings)]
        for node in nodes:
            if components(floors[node]["paths"]) > 1:
                warnings.append(f"{node}: its hallway is in {components(floors[node]['paths'])} disconnected pieces")
        for i, a in enumerate(nodes):
            for b in nodes[i + 1:]:
                if floors[a]["paths"] and floors[b]["paths"]:
                    distance, point_a, point_b = closest_points(floors[a]["paths"], floors[b]["paths"])
                    if distance <= PORT_GAP:
                        floors[a]["ports"][b.split("-")[0]] = [round(value, 1) for value in point_a]
                        floors[b]["ports"][a.split("-")[0]] = [round(value, 1) for value in point_b]
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    artwork = [centre(feature["points"]) for identifier, feature in sorted(per_floor[1].items())
               if identifier.startswith("entrance-")]
    return {"footprints": {b: [list(rect) for rect in rects] for b, rects in sorted(footprints.items())},
            "floors": dict(sorted(floors.items())), "entrances": dict(sorted(entrances.items())),
            "rooms": dict(sorted(rooms.items())), "entranceArtwork": artwork}


def js_value(value: Any, indent: int = 0) -> str:
    """Format JSON-compatible data, keeping short values on one line."""
    text = json.dumps(value, separators=(", ", ": "))
    if len(text) + indent <= 120 or not isinstance(value, (dict, list)):
        return text
    pad = " " * (indent + 2)
    if isinstance(value, dict):
        items = [f"{pad}{json.dumps(key)}: {js_value(item, indent + 2)}," for key, item in value.items()]
        return "{\n" + "\n".join(items) + "\n" + " " * indent + "}"
    return "[\n" + "\n".join(f"{pad}{js_value(item, indent + 2)}," for item in value) + "\n" + " " * indent + "]"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("public"), help="directory containing exported floor-N.svg files for observations")
    parser.add_argument("--source", type=Path, default=Path("tools/floorplans.svg"), help="master Inkscape SVG used to derive the map geometry")
    parser.add_argument("--output", type=Path, help="JSON observations output path (defaults to stdout unless --module-output is given)")
    parser.add_argument("--module-output", type=Path, help="write the generated map geometry as an ES module")
    args = parser.parse_args()
    if args.module_output:
        geometry = extract_geometry(args.source)
        module = "// Generated from tools/floorplans.svg; do not edit. Coordinates use the 773 x 742 map canvas.\n"
        module += "// Run: python3 tools/extract_svg_map.py --module-output map-geometry.js\n"
        module += "".join(f"export const {name} = {js_value(value)};\n" for name, value in geometry.items())
        args.module_output.parent.mkdir(parents=True, exist_ok=True)
        args.module_output.write_text(module, encoding="utf-8")
        print(f"Wrote {args.module_output} ({len(geometry['floors'])} building floors)")
        if not args.output:
            return 0
    paths = sorted(args.input.glob("floor-*.svg"))
    if not paths:
        parser.error(f"no floor-*.svg files found in {args.input}")
    floors = [extract_file(path) for path in paths]
    route_paths = extract_centerlines(args.source)
    for floor in floors:
        floor["generatedCenterlines"] = route_paths[str(floor["floor"])]
    data = {
        "schemaVersion": 1,
        "coordinateSystem": "Each floor's SVG viewBox coordinates after ancestor transforms.",
        "routingModel": {
            "hallways": "Named hallway areas in tools/floorplans.svg are rasterized and thinned into per-floor medial-axis networks.",
            "direction": "Implicit in traversal of the extracted centerline graph from the route origin toward its destination.",
            "turns": "Derived from successive ordered centerline vectors at a junction; no left/right turn is stored on a floor connection. turn_between() implements this for SVG coordinates.",
            "stairs": "Named stairwell geometry is grouped by descriptive ID. UP/DN labels and red arrows remain source observations for in-hallway stairs; cross-floor matches require review.",
        },
        "floors": floors,
    }
    serialized = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
        print(f"Wrote {args.output} ({len(floors)} floors; {sum(len(f['blueFeatures']) for f in floors)} blue geometry candidates)")
    elif not args.module_output:
        sys.stdout.write(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
