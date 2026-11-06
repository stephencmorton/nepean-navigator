#!/usr/bin/env python3
"""Export the four floor layers in tools/floorplans.svg as public SVGs.

Each export keeps only its own floor layer and the shared definitions. Inkscape
and Sodipodi editor metadata is removed, as are data-only elements that exist
only for the extractor: room-* markers, rooms-* and approach-* paths, and any
<floor>_data sublayer.
"""

from __future__ import annotations

import argparse
import copy
import re
import xml.etree.ElementTree as ET
from pathlib import Path


INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"
SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)
ET.register_namespace("inkscape", INKSCAPE_NS)
ET.register_namespace("sodipodi", SODIPODI_NS)


DATA_ONLY_RE = re.compile(r"(?:room-\d{4}(?:-[a-z0-9-]+)?|rooms-[a-z0-9-]+|approach-[a-z0-9-]+)", re.IGNORECASE)
EDITOR_NAMESPACES = (f"{{{INKSCAPE_NS}}}", f"{{{SODIPODI_NS}}}")


def show_layer(layer: ET.Element) -> None:
    declarations = [d for d in layer.get("style", "").split(";") if d.partition(":")[0].strip() not in {"display", ""}]
    layer.set("style", ";".join(declarations + ["display:inline"]))


def is_data_only(element: ET.Element) -> bool:
    label = element.get(f"{{{INKSCAPE_NS}}}label", "")
    return bool(DATA_ONLY_RE.fullmatch(element.get("id", "")) or re.fullmatch(r"[0-3]_data", label))


def strip_for_users(element: ET.Element) -> None:
    """Remove editor metadata and data-only elements below an exported element."""
    for child in list(element):
        if child.tag.startswith(EDITOR_NAMESPACES) or child.tag == f"{{{SVG_NS}}}metadata" or is_data_only(child):
            element.remove(child)
        else:
            strip_for_users(child)
    for name in [name for name in element.attrib if name.startswith(EDITOR_NAMESPACES)]:
        del element.attrib[name]


def floor_layers(root: ET.Element, source: Path) -> dict[int, ET.Element]:
    """Return the 0_floor through 3_floor Inkscape layers, keyed by floor."""
    layers: dict[int, ET.Element] = {}
    for element in root.iter():
        label = element.get(f"{{{INKSCAPE_NS}}}label", "")
        match = re.fullmatch(r"([0-3])_floor", label)
        if match:
            floor = int(match.group(1))
            if floor in layers:
                raise ValueError(f"{source}: more than one layer labeled {label}")
            layers[floor] = element
    if set(layers) != set(range(4)):
        raise ValueError(f"{source}: expected layers 0_floor through 3_floor; found {sorted(layers)}")
    return layers


def export_layers(source: Path, output_dir: Path) -> list[Path]:
    tree = ET.parse(source)
    root = tree.getroot()
    layers = floor_layers(root, source)

    if root.find(f"{{{SVG_NS}}}defs") is None:
        raise ValueError(f"{source}: missing SVG defs")
    if any(layer not in list(root) for layer in layers.values()):
        raise ValueError(f"{source}: floor layers must be direct children of the SVG root")
    if len({layer.get("transform") for layer in layers.values()}) > 1:
        raise ValueError(f"{source}: floor layers must share one transform so the floors stay aligned")

    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for floor in range(4):
        exported = copy.deepcopy(root)
        for layer in list(exported):
            label = layer.get(f"{{{INKSCAPE_NS}}}label", "")
            match = re.fullmatch(r"([0-3])_floor", label)
            if not match:
                continue
            if int(match.group(1)) == floor:
                show_layer(layer)
            else:
                exported.remove(layer)
        strip_for_users(exported)

        output = output_dir / f"floor-{floor}.svg"
        # Keep the source whitespace: re-indenting would add visible spaces inside xml:space="preserve" text.
        ET.ElementTree(exported).write(output, encoding="UTF-8", xml_declaration=True)
        outputs.append(output)
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("tools/floorplans.svg"))
    parser.add_argument("--output-dir", type=Path, default=Path("public"))
    args = parser.parse_args()
    outputs = export_layers(args.source, args.output_dir)
    print(f"Exported {len(outputs)} floor layers from {args.source} to {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
