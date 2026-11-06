// Display geometry generated from tools/floorplans.svg in its 773 x 742 reference canvas.
// These paths never add school connections or change routing decisions.
import {school} from './data.js';
import {footprints, floors as geometry, entrances, rooms as roomMarkers} from './map-geometry.js';
import {floorName, staircaseChoices, mainStairwellVisit} from './routing.js';

const segmentsOf = paths => paths.flatMap(points => points.slice(1).map((point, i) => [points[i], point]));
const polylineLength = points => points.slice(1).reduce((sum, point, i) =>
  sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0);
function projectToSegment(point, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)) : 0;
  const projected = [a[0] + t * dx, a[1] + t * dy];
  return {point: projected, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1])};
}
// Snap a room-interpolation point onto the nearest connected centerline, preferring the longest of near-ties.
function snapPrimary(point, paths) {
  const segments = segmentsOf(paths);
  const components = segments.map((_, i) => i);
  const root = index => components[index] === index ? index : (components[index] = root(components[index]));
  const ends = new Map();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const key = p.map(value => value.toFixed(3)).join(',');
      if (ends.has(key)) components[root(i)] = root(ends.get(key));
      else ends.set(key, i);
    }
  });
  const lengths = new Map(), candidates = new Map();
  segments.forEach((segment, i) => {
    const component = root(i);
    lengths.set(component, (lengths.get(component) ?? 0) + polylineLength(segment));
    const {point: projected, distance} = projectToSegment(point, segment);
    const previous = candidates.get(component);
    if (!previous || distance < previous.distance) candidates.set(component, {point: projected, distance, component});
  });
  const ordered = [...candidates.values()].sort((a, b) => a.distance - b.distance);
  if (!ordered.length || ordered[0].distance > 100) return point;
  if (ordered[0].distance < .001) return ordered[0].point;
  const tied = ordered.filter(item => item.distance <= ordered[0].distance + 2)
    .sort((a, b) => lengths.get(b.component) - lengths.get(a.component));
  return tied[0].point;
}
// Stairwell landings come from gstairs-* groups; hallway stairs from their named steps-* group.
export function drawnLanding(building, label, floor) {
  const staircase = school.staircases[building][label], node = geometry[`${building}-${floor}`];
  return staircase.steps ? node?.steps[staircase.steps]?.point : node?.stairs[label];
}
function stairPoints(node) {
  const [building, floor] = node.split('-');
  return Object.fromEntries(Object.keys(school.staircases[building] ?? {}).flatMap(label => {
    const point = drawnLanding(building, label, floor);
    return point ? [[label, point]] : [];
  }));
}
export const floorPlans = Object.fromEntries(Object.entries(school.hallwayNetwork.floors).map(([node, plan]) => {
  const {paths, ports} = geometry[node];
  return [node, {...plan, paths, ports, stairs: stairPoints(node),
    primary: plan.primary && plan.primary.map(point => snapPrimary(point, paths))}];
}));

export function pointAlong(points, fraction) {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
  let remaining = Math.max(0, Math.min(1, fraction)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i]) {
      const t = remaining / lengths[i];
      return points[i].map((value, axis) => value + (points[i + 1][axis] - value) * t);
    }
    remaining -= lengths[i];
  }
  return [...points.at(-1)];
}
export function roomMapPoint(room) {
  if (room.entrance) return entrances[room.entrance][room.floor];
  if (roomMarkers[room.number]) return roomMarkers[room.number];
  const plan = floorPlans[room.node];
  if (!plan?.primary) return plan?.approach ?? null;
  const maximum = school.buildings[room.building].highRoom;
  return pointAlong(plan.primary, maximum === 1 ? 0 : (Number(room.number.slice(2)) - 1) / (maximum - 1));
}
const keyOf = point => point.map(value => value.toFixed(5)).join(',');
const onSegment = (point, a, b) => Math.abs(Math.hypot(point[0] - a[0], point[1] - a[1]) + Math.hypot(point[0] - b[0], point[1] - b[1]) - Math.hypot(a[0] - b[0], a[1] - b[1])) < 0.001;
function projectToSegments(point, segments) {
  const candidates = new Map();
  for (const segment of segments) {
    const {point: candidate, distance} = projectToSegment(point, segment);
    if (distance <= 100) {
      const key = keyOf(candidate), previous = candidates.get(key);
      if (!previous || distance < previous.distance) candidates.set(key, {point: candidate, distance});
    }
  }
  const ordered = [...candidates.values()].sort((a, b) => a.distance - b.distance);
  return ordered[0]?.distance < .001 ? ordered.slice(0, 1) : ordered.slice(0, 12);
}
// Follow traced segments only. Rectangle overlap is deliberately irrelevant here.
export function hallwayPath(plan, from, to) {
  if (!from || !to || !plan) return null;
  if (plan.openArea) return [from, to];
  const originalSegments = segmentsOf(plan.paths);
  const starts = projectToSegments(from, originalSegments), ends = projectToSegments(to, originalSegments);
  if (!starts.length || !ends.length) return null;
  let bestPath = null, bestLength = Infinity;
  for (const startCandidate of starts) for (const endCandidate of ends) {
    const points = new Map([...originalSegments.flat(), startCandidate.point, endCandidate.point].map(point => [keyOf(point), point]));
    const graph = new Map([...points.keys()].map(key => [key, new Map()]));
    for (const [a, b] of originalSegments) {
      const nodes = [...points.values()].filter(point => onSegment(point, a, b))
        .sort((p, q) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q[0] - a[0], q[1] - a[1]));
      for (let i = 1; i < nodes.length; i++) {
        const previous = keyOf(nodes[i - 1]), next = keyOf(nodes[i]);
        const distance = Math.hypot(nodes[i][0] - nodes[i - 1][0], nodes[i][1] - nodes[i - 1][1]);
        graph.get(previous).set(next, distance); graph.get(next).set(previous, distance);
      }
    }
    const start = keyOf(startCandidate.point), end = keyOf(endCandidate.point);
    const distances = new Map([[start, 0]]), parents = new Map(), pending = new Set(graph.keys());
    while (pending.size) {
      let node;
      for (const candidate of pending) {
        if (node === undefined || (distances.get(candidate) ?? Infinity) < (distances.get(node) ?? Infinity)) node = candidate;
      }
      if (!distances.has(node)) break;
      pending.delete(node);
      if (node === end) {
        const score = distances.get(end) + (startCandidate.distance + endCandidate.distance) * 5;
        if (score < bestLength) {
          const path = [];
          for (let cursor = end; cursor !== undefined; cursor = parents.get(cursor)) path.push(points.get(cursor));
          path.reverse();
          bestPath = [
            ...(keyOf(from) === keyOf(path[0]) ? [] : [from]),
            ...path,
            ...(keyOf(to) === keyOf(path.at(-1)) ? [] : [to]),
          ];
          bestLength = score;
        }
        break;
      }
      for (const [next, distance] of graph.get(node)) {
        const candidate = distances.get(node) + distance;
        if (candidate < (distances.get(next) ?? Infinity)) {distances.set(next, candidate); parents.set(next, node);}
      }
    }
  }
  return bestPath;
}

function stairsForEdge(path, index, start, end) {
  const [building, floor] = path[index].split('-').map(Number);
  const nextFloor = Number(path[index + 1].split('-')[1]);
  const side = building === 2 ? mainStairwellVisit(path, index, start, end).side : undefined;
  const choices = staircaseChoices(building, floor, nextFloor, side);
  if (choices.length === 1) return choices[0][0];
  // Choose the closest allowed staircase along the traced hall, using the entry point.
  const plan = floorPlans[path[index]];
  let entry = index;
  while (entry > 0 && path[entry - 1].split('-')[0] === String(building)) entry--;
  const origin = entry === 0 ? roomMapPoint(start)
    : plan?.ports[Number(path[entry - 1].split('-')[0])];
  let selected, shortest = Infinity;
  for (const [label] of choices) {
    const points = hallwayPath(plan, origin, plan?.stairs[label]);
    const length = points ? polylineLength(points) : Infinity;
    if (selected === undefined || length < shortest) {
      selected = label;
      shortest = length;
    }
  }
  return selected;
}
const edgeStairsOf = (path, start, end) => path.map((node, i) => path[i + 1]?.split('-')[0] === node.split('-')[0]
  ? stairsForEdge(path, i, start, end) : undefined);
// A floor's route runs between the start or end point, the port to another building, and the staircase used.
function sectionEnds(path, i, start, end, edgeStairs) {
  const plan = floorPlans[path[i]], building = path[i].split('-')[0];
  const previous = path[i - 1]?.split('-')[0], next = path[i + 1]?.split('-')[0];
  const from = i === 0 ? roomMapPoint(start) : previous !== building ? plan?.ports[previous] : plan?.stairs[edgeStairs[i - 1]];
  const to = i === path.length - 1 ? roomMapPoint(end) : next !== building ? plan?.ports[next] : plan?.stairs[edgeStairs[i]];
  return {from, to};
}
const difference = (a, b) => a.map((value, axis) => value - b[axis]);
const unit = vector => {
  const length = Math.hypot(...vector);
  return length ? vector.map(value => value / length) : null;
};
// Turns and steps along one floor's traced route, in travel order.
export function drawnRouteEvents(path, index, start, end) {
  const node = path[index], plan = floorPlans[node];
  const {from, to} = sectionEnds(path, index, start, end, edgeStairsOf(path, start, end));
  const points = hallwayPath(plan, from, to);
  if (!points || plan.openArea) return [];
  const segments = segmentsOf(plan.paths);
  // Hallway directions meeting at a point: 1 at a dead end, 2 at a corner or mid-hallway, 3 or more at a junction.
  const isTip = point => segments.some(segment => segment.some(tip => Math.hypot(...difference(point, tip)) < .5));
  const branches = point => segments.reduce((sum, segment) => projectToSegment(point, segment).distance > .5 ? sum
    : sum + (segment.some(tip => Math.hypot(...difference(point, tip)) < .5) ? 1 : 2), 0);
  // A start or end off the drawn hallways joins it by a short leg; only a bend where that leg meets a drawn corner or junction is a turn.
  const attached = (outside, joint) => !branches(outside) && !isTip(joint);
  const events = [], seen = new Set();
  let travelled = 0;
  for (let k = 1; k < points.length; k++) {
    const leg = difference(points[k], points[k - 1]), length = Math.hypot(...leg), heading = unit(leg);
    if (!heading) continue;
    for (const [name, {point, extent, uphill}] of Object.entries(geometry[node].steps)) {
      // Steps at the section's ends are the staircase being taken, which is described separately.
      if (seen.has(name) || projectToSegment(point, [points[k - 1], points[k]]).distance > 3 ||
        [from, to].some(tip => Math.hypot(...difference(point, tip)) < 2)) continue;
      seen.add(name);
      const along = difference(point, points[k - 1]).reduce((sum, value, axis) => sum + value * heading[axis], 0);
      const rising = heading[0] * uphill[0] + heading[1] * uphill[1];
      events.push({kind: 'steps', direction: rising > 0 ? 'up' : 'down', extent, at: travelled + along});
    }
    travelled += length;
    if (k === points.length - 1 || (k === 1 && attached(points[0], points[1])) ||
      (k === points.length - 2 && attached(points.at(-1), points.at(-2)))) continue;
    const count = branches(points[k]), next = unit(difference(points[k + 1], points[k]));
    if (count < 2 || !next) continue;
    // Canvas y increases downward, so a positive cross product is a right turn.
    const cross = heading[0] * next[1] - heading[1] * next[0], dot = heading[0] * next[0] + heading[1] * next[1];
    if (Math.abs(cross) >= .5) events.push({kind: 'turn', direction: cross > 0 ? 'right' : 'left', corner: count === 2, at: travelled});
    else if (count >= 3 && dot > 0) events.push({kind: 'straight', at: travelled});
  }
  return events.sort((a, b) => a.at - b.at);
}
// Partition adjacent floor drawings at their shared landing, preserving route geometry.
function splitFloorSections(previous, section, before, after) {
  if (!previous.to || !section.from) return false;
  const anchor = previous.to;
  // Floors are drawn unshifted. Only this check aligns the landings, since they may be drawn a few units apart.
  const aligned = point => point.map((value, axis) => value + anchor[axis] - section.from[axis]);
  const previousPoints = previous.lines.filter(Boolean).flat();
  if (before?.to) previousPoints.unshift(before.to);
  const nextPoints = section.lines.filter(Boolean).flat().map(aligned);
  if (after?.from) nextPoints.push(after.from);
  const near = (a, b, tolerance = .01) => Math.hypot(...difference(a, b)) <= tolerance;
  // A route that leaves a landing the way it arrived shares that stretch on both floors; the seam runs along it.
  // Each floor's centerline is traced separately, so shared points can differ by a unit.
  const shared = nextPoints.filter(point => !near(point, anchor, 1) && previousPoints.some(other => near(other, point, 1)));
  const distinct = point => !near(point, anchor, 1) && !shared.some(other => near(other, point, 1));
  const prior = [...previousPoints].reverse().find(distinct);
  const next = nextPoints.find(distinct);
  if (!prior || !next) return false;
  const incoming = unit(difference(prior, anchor)), outgoing = unit(difference(next, anchor));
  let normal = unit(difference(incoming, outgoing));
  const stub = shared.length ? unit(difference(shared[0], anchor)) : null;
  if (normal && stub) {
    const along = normal[0] * stub[0] + normal[1] * stub[1];
    normal = unit(normal.map((value, axis) => value - along * stub[axis]));
  }
  if (!normal) return false; // A true double-back needs a separate view to avoid hiding the route.
  const dot = point => difference(point, anchor).reduce((sum, value, axis) => sum + value * normal[axis], 0);
  // Never hide a drawn route just to force two images into one view.
  if (previousPoints.some(point => dot(point) < -.01) || nextPoints.some(point => dot(point) > .01)) return false;
  const cut = {point: anchor, normal};
  (previous.cuts ??= []).push({...cut, sign: 1});
  (section.cuts ??= []).push({point: section.from, normal, sign: -1});
  const staircase = [...section.stairs].find(label => {
    const stairs = school.staircases[section.building]?.[label];
    return stairs && stairs.kind !== 'hallway' && previous.stairs.has(label) &&
      previous.plan.stairs[label]?.every((value, axis) => value === previous.to[axis]) &&
      section.plan.stairs[label]?.every((value, axis) => value === section.from[axis]);
  });
  section.split = {...cut, fromFloor: previous.floor, toFloor: section.floor, staircase};
  return true;
}
// Clip a polygon by a half-plane. Coordinates and cuts are in the same map space.
export function clipFloorPolygon(polygon, cut) {
  const distance = point => difference(point, cut.point).reduce((sum, value, axis) => sum + value * cut.normal[axis], 0) * cut.sign;
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = distance(a), db = distance(b);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const fraction = da / (da - db);
      result.push(a.map((value, axis) => value + (b[axis] - value) * fraction));
    }
  }
  return result;
}
// One polygon per outline rectangle drawn for the building on any floor.
export function sectionPolygons(section) {
  return footprints[section.building].map(([x0, y0, x1, y1]) => {
    let polygon = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (const cut of section.cuts ?? []) polygon = clipFloorPolygon(polygon, cut);
    return polygon;
  }).filter(polygon => polygon.length >= 3);
}

export function sheetRoutePoints(sheet) {
  const points = [];
  for (let i = 0; i < sheet.sections.length; i++) {
    const section = sheet.sections[i];
    for (const line of section.lines) {
      if (line) points.push(...line);
    }
    for (const endpoint of [section.from, section.to]) {
      if (endpoint) points.push(endpoint);
    }
    for (const movement of section.movements) {
      const point = section.plan?.stairs[movement.staircase];
      if (point) points.push(point);
    }
    const next = sheet.sections[i + 1];
    if (next && section.to && next.from) {
      const a = section.to, b = next.from;
      points.push(a, [b[0], a[1]], b);
    }
  }
  return points;
}

export function routeViewBox(sheet) {
  const points = sheetRoutePoints(sheet);
  if (!points.length) return null;
  const minX = Math.min(...points.map(point => point[0]));
  const maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1]));
  const maxY = Math.max(...points.map(point => point[1]));
  // Horizontal room labels can be wider than the route itself. These margins
  // keep labels, arrowheads, and stair markers visible around every route.
  const paddingX = 110, paddingY = 48;
  return [minX - paddingX, minY - paddingY,
    Math.max(maxX - minX, 1) + paddingX * 2,
    Math.max(maxY - minY, 1) + paddingY * 2];
}

export function sheetMapViewBox(sheet) {
  const boxes = [[0, 0, 773, 742], ...sheet.sections.flatMap(section => footprints[section.building]
    .map(([x0, y0, x1, y1]) => [x0, y0, x1 - x0, y1 - y0]))];
  const x = Math.min(...boxes.map(box => box[0])) - 12;
  const y = Math.min(...boxes.map(box => box[1])) - 24;
  const width = Math.max(...boxes.map(box => box[0] + box[2])) - x + 12;
  const height = Math.max(...boxes.map(box => box[1] + box[3])) - y + 12;
  return [x, y, width, height];
}

export function constrainViewBox(viewBox, fullViewBox) {
  const [fullX, fullY, fullWidth, fullHeight] = fullViewBox;
  let [x, y, width, height] = viewBox;
  if (width <= fullWidth) x = Math.max(fullX, Math.min(x, fullX + fullWidth - width));
  else x = fullX + (fullWidth - width) / 2;
  if (height <= fullHeight) y = Math.max(fullY, Math.min(y, fullY + fullHeight - height));
  else y = fullY + (fullHeight - height) / 2;
  return [x, y, width, height];
}

export function scaleViewBox(viewBox, fullViewBox, factor, anchor = [.5, .5]) {
  const [x, y, width, height] = viewBox;
  const [, , fullWidth, fullHeight] = fullViewBox;
  const nextWidth = Math.max(fullWidth / 8, width * factor);
  const nextHeight = Math.max(fullHeight / 8, height * factor);
  if (nextWidth >= fullWidth && nextHeight >= fullHeight) return [...fullViewBox];
  const [anchorX, anchorY] = anchor;
  return constrainViewBox([
    x + width * anchorX - nextWidth * anchorX,
    y + height * anchorY - nextHeight * anchorY,
    nextWidth,
    nextHeight,
  ], fullViewBox);
}

const contains = (candidate, lines) => lines.every(line => line && line.every(point =>
  candidate.paths.some(points => points.slice(1).some((end, j) => onSegment(point, points[j], end)))));

export function buildCompositeMap({path, start, end}) {
  if (!path?.length) return {sheets: [], sections: []};
  const nodes = path.map(node => node.split('-').map(Number));
  const edgeStairs = edgeStairsOf(path, start, end);
  const sections = [];
  for (let i = 0; i < path.length; i++) {
    const [building, floor] = nodes[i];
    const plan = floorPlans[path[i]];
    const previous = nodes[i - 1], next = nodes[i + 1];
    const {from, to} = sectionEnds(path, i, start, end, edgeStairs);
    const points = hallwayPath(plan, from, to);
    const stairs = new Set(), movements = [];
    for (const [label, fromFloor, toFloor] of [
      [edgeStairs[i - 1], previous?.[1], floor], [edgeStairs[i], floor, next?.[1]],
    ]) {
      if (label === undefined) continue;
      stairs.add(label);
      if (school.staircases[building][label].kind !== 'hallway') {
        const direction = toFloor > fromFloor ? 'up' : 'down';
        movements.push({staircase: label, direction,
          description: `${school.buildings[building].name}: staircase ${label}, ${direction} from the ${floorName(fromFloor)} to the ${floorName(toFloor)}.`});
      }
    }
    for (const [number, kind] of [[i === 0 ? start.number : null, 'departure'], [i === path.length - 1 ? end.number : null, 'arrival']]) {
      const room = school.knownRooms[number];
      if (room?.[`${kind}Stairs`]?.kind === 'stairwell' && start.number !== end.number) {
        for (const [label, staircase] of Object.entries(school.staircases[building] ?? {})) {
          if (staircase.kind !== 'hallway' && staircase.side === room.stairwellSide) {
            stairs.add(label);
            movements.push({staircase: label, direction: room[`${kind}Stairs`].direction, description: room[kind]});
          }
        }
      }
    }
    const last = sections.at(-1);
    // Merge compatible floors only when the selected drawing contains the entire route.
    const matching = last?.building === building && last.signature === plan?.signature;
    const selected = matching && (contains(plan, [...last.lines, points]) ? plan
      : contains(last.plan, [points]) ? last.plan : null);
    if (selected) {
      if (selected === plan) last.floor = floor;
      last.plan = selected;
      last.nodes.push(path[i]);
      last.floors.push(floor);
      last.lines.push(points);
      last.to = to;
      for (const label of stairs) last.stairs.add(label);
      for (const move of movements) {
        if (!last.movements.some(other => other.staircase === move.staircase && other.direction === move.direction)) last.movements.push(move);
      }
    } else sections.push({building, floor, floors: [floor], nodes: [path[i]], plan,
      signature: plan?.signature, lines: [points], from, to, stairs, movements});
  }
  const sheets = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i], previous = sections[i - 1];
    let sheet = sheets.at(-1);
    const repeated = sheet?.sections.some(other => other.building === section.building);
    const split = repeated && previous?.building === section.building &&
      splitFloorSections(previous, section, sections[i - 2], sections[i + 1]);
    if (!sheet || (repeated && !split)) {
      sheet = {sections: []}; sheets.push(sheet);
    }
    sheet.sections.push(section);
  }
  return {sheets, sections};
}

