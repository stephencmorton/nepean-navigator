#!/usr/bin/env python3
"""Extract map observations and generate hallway centerlines from the master SVG.

Usage:
    python3 tools/extract_svg_map.py --module-output hallway-paths.js
    python3 tools/extract_svg_map.py --input public --output /tmp/school-map.json

Centerlines are calculated from the medial axes of large blue hallway outlines
in tools/floorplans.svg. Smaller blue shapes are omitted as stair and fixture
symbols. Directions and turns follow the generated centerline graph.
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


SVG_NS = "http://www.w3.org/2000/svg"
BLUE = {"#284283", "#284283ff"}
RED = {"#f51e0d", "#f51e0dff", "#ed111a", "#ed111aff"}
BROWN = {"#803300", "#803300ff"}
BLACK = {"#000000", "#000000ff", "#010101", "#010101ff"}
SHAPE_TAGS = {"path", "rect", "polygon", "polyline", "line", "circle", "ellipse"}
TRANSFORM_RE = re.compile(r"([A-Za-z]+)\s*\(([^)]*)\)")
NUMBER_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?")

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
    tokens = re.findall(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?", value)
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


def canvas_coordinate(value: float) -> float:
    """Normalize tiny SVG round-trip noise without rounding real route edits."""
    nearest = round(value)
    if abs(value - nearest) < 0.0001:
        return float(nearest)
    return fmt(value)


def linear_polygons(value: str) -> list[list[tuple[float, float]]]:
    """Read closed subpaths made from SVG M/L/H/V commands."""
    tokens = re.findall(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?", value)
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


def polygon_area(polygon: list[tuple[float, float]]) -> float:
    return abs(sum(polygon[i][0] * polygon[(i + 1) % len(polygon)][1] -
                   polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
                   for i in range(len(polygon))) / 2)


def hallway_mask(layer: ET.Element, vb: list[float]) -> set[tuple[int, int]]:
    """Rasterize named hallway areas, with the legacy color/size fallback."""
    mask: set[tuple[int, int]] = set()
    for element, matrix, style, ids in walk(layer, IDENTITY, {}, []):
        # The descriptive hallway IDs live on their groups, so the geometry
        # below them can be selected independent of its Inkscape-generated ID.
        # Older drawings without named hallway groups still use blue and area.
        named_hallway = is_named_hallway(ids)
        if not (named_hallway or classify_shape(style) & {"blueFeatures"}):
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
            # Keep the old size filter for unnamed blue symbols; named hallway
            # regions are explicit and do not need to be inferred by size.
            if named_hallway or polygon_area(polygon) >= 450:
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
    layers: dict[int, ET.Element] = {}
    for element in root.iter():
        label = element.get("{http://www.inkscape.org/namespaces/inkscape}label", "")
        match = re.fullmatch(r"([0-3])_floor", label)
        if match:
            layers[int(match.group(1))] = element
    if set(layers) != set(range(4)):
        raise ValueError(f"{source}: expected layers 0_floor through 3_floor")
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
    route_paths: dict[str, list[list[list[float]]]] = {}
    for element, matrix, style, ids in walk(root, IDENTITY, {}, []):
        tag = element.tag.rsplit("}", 1)[-1]
        if style.get("display") == "none" or style.get("visibility") == "hidden":
            continue
        attrs = element_attrs(element)
        route_node = element.get("data-route-node")
        if tag == "polyline" and route_node:
            source_points = [
                (float(parts[0]), float(parts[1]))
                for point in (element.get("points") or "").strip().split()
                if len(parts := point.split(",")) == 2
            ]
            # Normalize to the app's 773 × 742 image coordinate system. The
            # source group transform maps these points into the SVG viewBox.
            route_paths.setdefault(route_node, []).append([
                [canvas_coordinate(point[0] * 773 / vb[2]), canvas_coordinate(point[1] * 742 / vb[3])]
                for point in (transform_point(matrix, x, y) for x, y in source_points)
            ])
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
        "routePaths": route_paths,
        "otherFeatures": [f for f in features if not set(f["categories"]).intersection({"blueFeatures", "buildingGeometry", "entrances", "stairwells", "redStairMarkers"})],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("public"), help="directory containing exported floor-N.svg files for observations")
    parser.add_argument("--source", type=Path, default=Path("tools/floorplans.svg"), help="master Inkscape SVG used to derive centerlines")
    parser.add_argument("--output", type=Path, help="JSON output path (defaults to stdout)")
    parser.add_argument("--module-output", type=Path, help="write extracted editable route polylines as an ES module")
    args = parser.parse_args()
    paths = sorted(args.input.glob("floor-*.svg"))
    if not paths:
        parser.error(f"no floor-*.svg files found in {args.input}")
    floors = [extract_file(path) for path in paths]
    route_paths = extract_centerlines(args.source)
    for floor in floors:
        floor["generatedCenterlines"] = route_paths[str(floor["floor"])]
    if args.module_output:
        floor_one = next((floor for floor in floors if floor["floor"] == 1), None)
        if floor_one is None:
            parser.error("--input must include public/floor-1.svg to extract entrance artwork")
        vb_x, vb_y, vb_width, vb_height = floor_one["viewBox"]
        entrance_artwork = [
            [round((feature["center"][0] - vb_x) * 773 / vb_width, 3),
             round((feature["center"][1] - vb_y) * 742 / vb_height, 3)]
            for feature in floor_one["entrances"] if feature.get("center")
        ]
        module = "// Generated as medial-axis centerlines from blue hallway outlines in tools/floorplans.svg.\n"
        module += "// Run: python3 tools/extract_svg_map.py --module-output hallway-paths.js\n"
        module += "export const hallwayPaths = " + json.dumps(route_paths, indent=2, ensure_ascii=False) + ";\n"
        module += "export const entranceArtwork = " + json.dumps(entrance_artwork, indent=2, ensure_ascii=False) + ";\n"
        args.module_output.parent.mkdir(parents=True, exist_ok=True)
        args.module_output.write_text(module, encoding="utf-8")
        print(f"Wrote {args.module_output} ({len(route_paths)} hallway plans)")
    data = {
        "schemaVersion": 1,
        "coordinateSystem": "Each floor's SVG viewBox coordinates after ancestor transforms.",
        "routingModel": {
            "hallways": "Named hallway areas in tools/floorplans.svg are rasterized and thinned into per-floor medial-axis networks; older drawings fall back to large blue areas.",
            "direction": "Implicit in traversal of the extracted centerline graph from the route origin toward its destination.",
            "turns": "Derived from successive ordered centerline vectors at a junction; no left/right turn is stored on a floor connection. turn_between() implements this for SVG coordinates.",
            "stairs": "Named stairwell geometry is grouped by descriptive ID. UP/DN labels and red arrows remain source observations for in-hallway stairs; cross-floor matches require review.",
        },
        "declaredConnections": [
            {"from": "5-1", "to": "4-1", "kind": "hallway", "viaStairwell": "J",
             "source": "user-described Gym-to-stairwell-J hallway"}
        ],
        "floors": floors,
    }
    serialized = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
        print(f"Wrote {args.output} ({len(floors)} floors; {sum(len(f['blueFeatures']) for f in floors)} blue geometry candidates)")
    else:
        sys.stdout.write(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
