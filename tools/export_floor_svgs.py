#!/usr/bin/env python3
"""Export the four floor layers in tools/floorplans.svg as public SVGs."""

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


def set_layer_visibility(layer: ET.Element, visible: bool) -> None:
    declarations = layer.get("style", "").split(";")
    for index, declaration in enumerate(declarations):
        name, separator, _value = declaration.partition(":")
        if separator and name.strip() == "display":
            declarations[index] = f"{name}:{'inline' if visible else 'none'}"
            break
    else:
        declarations.append(f"display:{'inline' if visible else 'none'}")
    layer.set("style", ";".join(declarations))


def export_layers(source: Path, output_dir: Path) -> list[Path]:
    tree = ET.parse(source)
    root = tree.getroot()
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

    if root.find(f"{{{SVG_NS}}}defs") is None:
        raise ValueError(f"{source}: missing SVG defs")
    if any(layer not in list(root) for layer in layers.values()):
        raise ValueError(f"{source}: floor layers must be direct children of the SVG root")

    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for floor in range(4):
        exported = copy.deepcopy(root)
        for layer in list(exported):
            label = layer.get(f"{{{INKSCAPE_NS}}}label", "")
            match = re.fullmatch(r"([0-3])_floor", label)
            if not match:
                continue
            set_layer_visibility(layer, int(match.group(1)) == floor)

        output = output_dir / f"floor-{floor}.svg"
        export_tree = ET.ElementTree(exported)
        ET.indent(export_tree, space="  ")
        export_tree.write(output, encoding="UTF-8", xml_declaration=True)
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
