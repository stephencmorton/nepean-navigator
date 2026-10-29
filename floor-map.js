// Display geometry traced from the supplied SVGs in their 773 × 742 reference canvas.
// These paths never add school connections or change routing decisions.
import {school} from './data.js';
import {parseStart, parseRoom, floorName, staircaseChoices, mainStairwellVisit} from './routing.js';

const bounds = {1: [25, 335, 168, 379], 2: [192, 465, 370, 230], 3: [549, 332, 188, 380], 4: [499, 27, 141, 310], 5: [248, 136, 200, 330]};
const musicClip = '550,332 707,332 707,407 735,407 735,710 615,710 615,620 561,620 561,408 550,408';
const mainHall = [[212, 550], [277, 550], [381, 550], [474, 550], [554, 550]];
const scienceHall = [[569, 300], [569, 30]];
const mainBranches = [[[277, 550], [277, 570]], [[474, 550], [474, 570]]];
const main = floor => ({signature: 'main-upper', primary: mainHall,
  paths: [mainHall, ...mainBranches, ...(floor === 1 ? [[[381, 550], [381, 465]]] : []),
    ...(floor === 2 ? [[[277, 570], [277, 675]], [[474, 570], [474, 675]]] : [])],
  stairs: {A: [474, 570], B: [277, 570]}, ports: {1: [212, 550], 3: [554, 550], ...(floor === 1 ? {5: [381, 465]} : {})}});

export const floorPlans = {
  '1-1': {signature: 'art-ground', primary: [[181, 627], [181, 520]], paths: [[[181, 640], [181, 627], [181, 550], [181, 520]]], stairs: {E: [181, 550], hallway: [181, 520]}, ports: {2: [181, 550]}},
  '1-2': {signature: 'art-upper', primary: [[28, 399], [181, 399]], paths: [[[28, 399], [181, 399], [181, 505], [181, 550], [181, 627], [181, 640]]], stairs: {E: [181, 505], hallway: [181, 520]}, ports: {2: [181, 550]}},
  '1-3': {signature: 'english', primary: [[28, 550], [181, 550]], paths: [[[28, 550], [181, 550], [192, 550]]], stairs: {E: [181, 550]}, ports: {2: [192, 550]}},
  // The basement outline exists, but no Main hallway was drawn. Do not invent one.
  '2-0': {signature: 'main-basement', primary: null, paths: [], stairs: {}, ports: {}},
  '2-1': main(1), '2-2': main(2), '2-3': main(3),
  '3-0': {signature: 'music-basement', primary: [[647, 560], [647, 408]], paths: [[[647, 560], [647, 408]]], stairs: {}, ports: {}},
  '3-1': {signature: 'auditorium', primary: [[569, 504], [569, 340]], paths: [[[569, 630], [569, 550], [569, 504], [569, 340]]], stairs: {hallway: [569, 480]}, ports: {2: [569, 550], 4: [569, 340]}},
  '3-2': {signature: 'music-upper', primary: [[572, 617], [572, 408], [569, 408], [569, 340]], paths: [[[572, 630], [572, 617], [572, 480], [572, 408], [569, 408], [569, 340]]], stairs: {hallway: [572, 480]}, ports: {2: [572, 550], 4: [569, 340]}},
  '3-3': {signature: 'auditorium-top', primary: [[561, 550], [647, 550], [647, 370], [704, 370]], paths: [[[561, 550], [647, 550], [647, 370], [704, 370]]], stairs: {}, ports: {2: [561, 550]}},
  ...Object.fromEntries([0, 1, 2].map(floor => [`4-${floor}`, {signature: 'science', primary: scienceHall,
    paths: [scienceHall, [[548, 300], [569, 300]]], stairs: {J: [548, 300]}, ports: {3: [569, 300]}}])),
  '5-1': {signature: 'gym', primary: null, paths: [[[381, 465], [381, 325]]], stairs: {}, ports: {2: [381, 465]}, approach: [381, 325]},
};
const entrancePoints = {A: [474, 675], B: [277, 675], C: [181, 640], N: [572, 630]};
const roomApproaches = {'2201': [277, 570], '1305': [569, 504], '1509': [381, 325]};

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
export function roomMapPoint(value) {
  const room = parseStart(value);
  if (room.entrance) return entrancePoints[room.entrance];
  if (roomApproaches[room.number]) return roomApproaches[room.number];
  const plan = floorPlans[room.node];
  if (!plan?.primary) return plan?.approach ?? null;
  const maximum = school.buildings[room.building].highRoom;
  return pointAlong(plan.primary, maximum === 1 ? 0 : (Number(room.number.slice(2)) - 1) / (maximum - 1));
}
const keyOf = point => point.map(value => value.toFixed(5)).join(',');
const onSegment = (point, a, b) => Math.abs(Math.hypot(point[0] - a[0], point[1] - a[1]) + Math.hypot(point[0] - b[0], point[1] - b[1]) - Math.hypot(a[0] - b[0], a[1] - b[1])) < 0.001;
// Follow traced segments only. Rectangle overlap is deliberately irrelevant here.
export function hallwayPath(plan, from, to) {
  if (!from || !to || !plan) return null;
  const segments = plan.paths.flatMap(points => points.slice(1).map((point, i) => [points[i], point]));
  const points = new Map([...segments.flat(), from, to].map(point => [keyOf(point), point]));
  const graph = new Map([...points.keys()].map(key => [key, new Map()]));
  for (const [a, b] of segments) {
    const nodes = [...points.values()].filter(point => onSegment(point, a, b))
      .sort((p, q) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q[0] - a[0], q[1] - a[1]));
    for (let i = 1; i < nodes.length; i++) {
      const previous = keyOf(nodes[i - 1]), next = keyOf(nodes[i]);
      const distance = Math.hypot(nodes[i][0] - nodes[i - 1][0], nodes[i][1] - nodes[i - 1][1]);
      graph.get(previous).set(next, distance); graph.get(next).set(previous, distance);
    }
  }
  const start = keyOf(from), end = keyOf(to);
  if (!segments.some(([a, b]) => onSegment(from, a, b)) || !segments.some(([a, b]) => onSegment(to, a, b))) return null;
  const distances = new Map([[start, 0]]), parents = new Map(), pending = new Set(graph.keys());
  while (pending.size) {
    const node = [...pending].sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity))[0];
    if (!distances.has(node)) break;
    pending.delete(node);
    if (node === end) {
      const path = [];
      for (let cursor = end; cursor !== undefined; cursor = parents.get(cursor)) path.push(points.get(cursor));
      return path.reverse();
    }
    for (const [next, distance] of graph.get(node)) {
      const candidate = distances.get(node) + distance;
      if (candidate < (distances.get(next) ?? Infinity)) {distances.set(next, candidate); parents.set(next, node);}
    }
  }
  return null;
}

function stairsForEdge(path, index, start, end) {
  const [building, floor] = path[index].split('-').map(Number);
  const nextFloor = Number(path[index + 1].split('-')[1]);
  const side = building === 2 ? mainStairwellVisit(path, index, start, end).side : undefined;
  const choices = staircaseChoices(building, floor, nextFloor, side);
  // Choose the closest allowed staircase along the traced hall, using the entry point.
  const plan = floorPlans[path[index]];
  let entry = index;
  while (entry > 0 && path[entry - 1].split('-')[0] === String(building)) entry--;
  const origin = entry === 0 ? roomMapPoint(start.entrance ?? start.number)
    : plan?.ports[Number(path[entry - 1].split('-')[0])];
  const length = label => {
    const points = hallwayPath(plan, origin, plan?.stairs[label]);
    return points ? points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0) : Infinity;
  };
  return choices.map(([label]) => label).sort((a, b) => length(a) - length(b))[0];
}
const shifted = (point, offset = [0, 0]) => point && point.map((value, axis) => value + offset[axis]);
const difference = (a, b) => a.map((value, axis) => value - b[axis]);
const unit = vector => {const length = Math.hypot(...vector); return length ? vector.map(value => value / length) : null;};
// Partition adjacent floor drawings at their shared landing, preserving route geometry.
function splitFloorSections(previous, section, before, after) {
  if (!previous.to || !section.from) return false;
  const anchor = shifted(previous.to, previous.offset);
  const offset = difference(anchor, section.from);
  const previousPoints = previous.lines.filter(Boolean).flat().map(point => shifted(point, previous.offset));
  if (before?.to) previousPoints.unshift(shifted(before.to, before.offset));
  const nextPoints = section.lines.filter(Boolean).flat().map(point => shifted(point, offset));
  if (after?.from) nextPoints.push(shifted(after.from, after.offset));
  const prior = previousPoints.reverse().find(point => Math.hypot(...difference(point, anchor)) > .01);
  const next = nextPoints.find(point => Math.hypot(...difference(point, anchor)) > .01);
  if (!prior || !next) return false;
  const incoming = unit(difference(prior, anchor)), outgoing = unit(difference(next, anchor));
  const normal = unit(difference(incoming, outgoing));
  if (!normal) return false; // A true double-back needs a separate view to avoid hiding the route.
  const dot = point => difference(point, anchor).reduce((sum, value, axis) => sum + value * normal[axis], 0);
  // Never hide a drawn route just to force two images into one view.
  if (previousPoints.some(point => dot(point) < -.01) || nextPoints.some(point => dot(point) > .01)) return false;
  section.offset = offset;
  const cut = {point: anchor, normal};
  (previous.cuts ??= []).push({...cut, sign: 1});
  (section.cuts ??= []).push({...cut, sign: -1});
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
function sectionPolygon(section) {
  const [x, y, width, height] = bounds[section.building];
  let polygon = section.building === 3 ? musicClip.split(' ').map(point => point.split(',').map(Number))
    : [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  polygon = polygon.map(point => shifted(point, section.offset));
  for (const cut of section.cuts ?? []) polygon = clipFloorPolygon(polygon, cut);
  return polygon.map(point => difference(point, section.offset ?? [0, 0]));
}

export function buildCompositeMap(path, startValue, endValue) {
  if (!path?.length) return {sheets: [], sections: []};
  const start = parseStart(startValue), end = parseRoom(endValue);
  const sections = [];
  for (let i = 0; i < path.length; i++) {
    const [building, floor] = path[i].split('-').map(Number);
    const plan = floorPlans[path[i]];
    const previous = path[i - 1]?.split('-').map(Number), next = path[i + 1]?.split('-').map(Number);
    let from = i === 0 ? roomMapPoint(startValue) : previous[0] !== building
      ? plan?.ports[previous[0]] : plan?.stairs[stairsForEdge(path, i - 1, start, end)];
    let to = i === path.length - 1 ? roomMapPoint(endValue) : next[0] !== building
      ? plan?.ports[next[0]] : plan?.stairs[stairsForEdge(path, i, start, end)];
    const points = hallwayPath(plan, from, to);
    const stairs = new Set();
    if (previous?.[0] === building) stairs.add(stairsForEdge(path, i - 1, start, end));
    if (next?.[0] === building) stairs.add(stairsForEdge(path, i, start, end));
    for (const [number, kind] of [[i === 0 ? start.number : null, 'departure'], [i === path.length - 1 ? end.number : null, 'arrival']]) {
      const room = school.knownRooms[number];
      if (room?.[`${kind}Stairs`]?.kind === 'stairwell' && start.number !== end.number) {
        for (const [label, staircase] of Object.entries(school.staircases[building] ?? {})) {
          if (staircase.side === room.stairwellSide) stairs.add(label);
        }
      }
    }
    const last = sections.at(-1);
    // Prefer the departure-floor drawing when it contains every traced segment.
    const contains = (candidate, lines) => lines.every(line => line && line.every(point =>
      candidate.paths.some(points => points.slice(1).some((end, j) => onSegment(point, points[j], end)))));
    const matching = last?.building === building && last.signature === plan?.signature;
    const selected = matching && (contains(plan, [...last.lines, points]) ? plan
      : contains(last.plan, [points]) ? last.plan : null);
    if (selected) {
      if (selected === plan) last.floor = floor;
      last.plan = selected;
      last.nodes.push(path[i]); last.floors.push(floor); last.lines.push(points); last.to = to;
      for (const label of stairs) last.stairs.add(label);
    } else sections.push({building, floor, floors: [floor], nodes: [path[i]], plan,
      signature: plan?.signature, lines: [points], from, to, stairs});
  }
  const sheets = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i], previous = sections[i - 1];
    section.offset = [0, 0];
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

const NS = 'http://www.w3.org/2000/svg';
const element = (name, attrs = {}, text = '') => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
};
const polyline = points => points.map(point => point.join(',')).join(' ');

export function renderFloorComposite(path, startValue, endValue, stairCues) {
  const model = buildCompositeMap(path, startValue, endValue);
  const container = document.createElement('div'); container.className = 'floor-composite';
  let sequence = 0;
  model.sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex) {
      const separator = document.createElement('p'); separator.className = 'floor-map-continuation';
      separator.textContent = '⌁ Continue on the next plan'; container.append(separator);
    }
    // Keep unused buildings in their ground-floor layout as context, without adding route stages.
    const context = Object.keys(bounds).map(Number)
      .filter(building => !sheet.sections.some(section => section.building === building))
      .map(building => ({building, floor: 1, offset: [0, 0]}));
    const layers = [...context, ...sheet.sections];
    const boxes = [[0, 0, 773, 742], ...layers.map(section => {
      const box = bounds[section.building];
      return [...shifted(box.slice(0, 2), section.offset), ...box.slice(2)];
    })];
    const x = Math.min(...boxes.map(box => box[0])) - 12, y = Math.min(...boxes.map(box => box[1])) - 24;
    const width = Math.max(...boxes.map(box => box[0] + box[2])) - x + 12;
    const height = Math.max(...boxes.map(box => box[1] + box[3])) - y + 12;
    const svg = element('svg', {viewBox: `${x} ${y} ${width} ${height}`, role: 'img', class: 'floor-route-map', 'aria-labelledby': `floor-map-title-${sheetIndex} floor-map-desc-${sheetIndex}`});
    svg.append(element('title', {id: `floor-map-title-${sheetIndex}`}, 'Route across floor plans'));
    svg.append(element('desc', {id: `floor-map-desc-${sheetIndex}`}, sheet.sections.map(section =>
      `${school.buildings[section.building].name}: ${section.floors.map(floorName).join(' to ')}. Room positions are estimates; named destinations show their approach.`).join(' ')));
    const defs = element('defs');
    const arrowId = `floor-route-arrow-${sheetIndex}`;
    const arrow = element('marker', {id: arrowId, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 3, markerHeight: 3, orient: 'auto'});
    arrow.append(element('path', {d: 'M0 0L10 5L0 10Z', fill: '#a50086'})); defs.append(arrow); svg.append(defs);
    for (const section of layers) {
      const clipId = `floor-section-${sequence++}`;
      const clip = element('clipPath', {id: clipId});
      clip.append(element('polygon', {points: polyline(sectionPolygon(section))})); defs.append(clip);
      const offset = section.offset ?? [0, 0];
      const layer = element('g', {transform: `translate(${offset.join(' ')})`, class: 'floor-plan-layer', 'data-building': section.building, 'data-floor': section.floor});
      layer.append(element('image', {href: `./public/floor-${section.floor}.svg`, x: 0, y: 0, width: 773, height: 742, preserveAspectRatio: 'none', 'clip-path': `url(#${clipId})`}));
      svg.append(layer);
    }
    for (const section of sheet.sections) if (section.split?.staircase) {
        // Show the image seam near the landing, angled across the hall rather than along it.
        const {point, normal} = section.split;
        const angle = Math.atan2(normal[1], normal[0]) * 180 / Math.PI;
        const seam = element('g', {transform: `translate(${point.join(' ')}) rotate(${angle})`});
        seam.append(element('path', {d: 'M-3 -18L1 -9L-3 0L1 9L-3 18', class: 'floor-stair-split'}));
        seam.append(element('title', {}, `Floor ${section.split.fromFloor} to floor ${section.split.toFloor} at the stairwell.`));
        svg.append(seam);
      }
    const shownStairs = new Set();
    const stairMarkers = [];
    for (let i = 0; i < sheet.sections.length; i++) {
      const section = sheet.sections[i];
      for (const points of section.lines) if (points?.length > 1) {
        const line = element('polyline', {points: polyline(points.map(point => shifted(point, section.offset))), class: 'floor-route-line', 'marker-end': `url(#${arrowId})`}); svg.append(line);
      }
      const next = sheet.sections[i + 1];
      if (next && section.to && next.from) {
        const a = shifted(section.to, section.offset), b = shifted(next.from, next.offset);
        svg.append(element('polyline', {points: polyline([a, [b[0], a[1]], b]), class: 'floor-route-line'}));
      }
      for (const cue of stairCues.filter(cue => cue.building === section.building && section.stairs.has(cue.staircase))) {
        const point = section.plan?.stairs[cue.staircase];
        if (point) {
          const location = shifted(point, section.offset);
          const key = `${cue.building}-${location.join(',')}-${cue.direction}`;
          if (!shownStairs.has(key)) {
            const marker = element('g', {transform: `translate(${location.join(' ')})`, class: 'floor-stair-cue'});
            marker.append(element('title', {}, cue.description));
            marker.append(element('circle', {cx: 0, cy: 0, r: 18, class: 'floor-stair-circle'}));
            marker.append(element('text', {x: 0, y: -25, 'text-anchor': 'middle', class: 'floor-stair-label'}, cue.direction === 'up' ? 'Up' : 'Down'));
            stairMarkers.push(marker);
          }
          shownStairs.add(key);
        }
      }
    }
    // Keep the highlighted stairwells and their labels above every route segment.
    svg.append(...stairMarkers);
    for (const [section, point, value, label] of [
      [model.sections[0], model.sections[0]?.from, startValue, 'Start'],
      [model.sections.at(-1), model.sections.at(-1)?.to, endValue, 'Destination'],
    ]) if (sheet.sections.includes(section) && point) {
      const location = shifted(point, section.offset);
      svg.append(element('circle', {cx: location[0], cy: location[1], r: 5, class: 'floor-route-endpoint'}));
      const approach = roomApproaches[String(value)] ? ' approach' : '';
      const text = `${label}: ${school.entrances[String(value)] ? `Entrance ${value}` : value}${approach}`;
      const alignLeft = location[0] + 8 + text.length * 6 > x + width - 5;
      const labelY = label === 'Start'
        ? location[1] + (location[1] - y < 40 ? 18 : -12)
        : location[1] + (location[1] + 20 < y + height - 5 ? 20 : -12);
      svg.append(element('text', {x: location[0] + (alignLeft ? -8 : 8), y: labelY, 'text-anchor': alignLeft ? 'end' : 'start', class: 'floor-endpoint-label'}, text));
    }
    container.append(svg);
    for (const section of sheet.sections.filter(section => section.lines.some(line => !line))) {
      const note = document.createElement('p'); note.className = 'floor-map-gap';
      note.textContent = `${school.buildings[section.building].name}, floor ${section.floor}: hallway detail is not available for this segment. Follow the written directions.`;
      container.append(note);
    }
  });
  return container;
}
