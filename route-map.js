// Optional, accessible SVG companion to the computed walking route.
import {renderFloorComposite} from './floor-map.js';
import {school, mapLayout} from './data.js';
import {floorName, parseRoom, parseStart, staircaseChoices, mainStairwellVisit} from './routing.js';

// Group consecutive floors in one building while retaining later returns to that building.
export function buildRouteStages(path, startNumber, endNumber) {
  if (!path?.length) return [];
  const stages = [];
  for (const node of path) {
    const [building, floor] = node.split('-').map(Number);
    let stage = stages.at(-1);
    if (!stage || stage.building !== building) {
      stage = {building, floors: [], levels: []};
      stages.push(stage);
    }
    stage.floors.push(floor);
    stage.levels.push(floorName(floor));
  }
  const start = parseStart(startNumber).number;
  const end = parseRoom(endNumber).number;
  const startLevel = school.knownRooms[start]?.level;
  const endLevel = school.knownRooms[end]?.level;
  if (start === end && startLevel) stages[0].levels = [startLevel];
  else {
    // Guidance's half-level is outside the graph and must remain visible at either endpoint.
    if (startLevel) stages[0].levels.unshift(startLevel);
    if (endLevel) stages.at(-1).levels.push(endLevel);
  }
  return stages;
}

// Orient an existing schematic connector to match travel without inventing new building links.
export function buildingLink(from, to) {
  const forward = mapLayout.links[`${from}-${to}`];
  if (forward) return forward;
  const reverse = mapLayout.links[`${to}-${from}`];
  return reverse ? [...reverse].reverse() : null;
}

// Join same-end transfers in Main without drawing an invented detour to its centre.
export function routeMapLinks(stages) {
  const links = [];
  for (let index = 1; index < stages.length; index++) {
    const points = buildingLink(stages[index - 1].building, stages[index].building);
    links.push(points ? [...points] : null);
  }
  for (let index = 1; index < stages.length - 1; index++) {
    if (stages[index].building !== 2) continue;
    const incoming = links[index - 1];
    const outgoing = links[index];
    const junction = incoming?.at(-2);
    if (!junction || !outgoing?.[1]) continue;
    const isEnd = [mapLayout.mainHallway.left, mapLayout.mainHallway.right]
      .some(end => end[0] === junction[0] && end[1] === junction[1]);
    if (isEnd && junction[0] === outgoing[1][0] && junction[1] === outgoing[1][1]) {
      incoming.pop();
      outgoing.shift();
    }
  }
  return links;
}

// Place one direction arrow on the longest connector segment, away from building labels.
export function linkArrow(points) {
  let longest = null;
  for (let index = 1; index < points.length; index++) {
    const [x, y] = points[index - 1];
    const [nextX, nextY] = points[index];
    const length = Math.hypot(nextX - x, nextY - y);
    if (length && (!longest || length > longest.length)) longest = {x, y, nextX, nextY, length};
  }
  if (!longest) return null;
  const {x, y, nextX, nextY, length} = longest;
  const dx = (nextX - x) / length * 25;
  const dy = (nextY - y) / length * 25;
  return {x1: (x + nextX) / 2 - dx, y1: (y + nextY) / 2 - dy, x2: (x + nextX) / 2 + dx, y2: (y + nextY) / 2 + dy};
}

// Vertical cues describe route movements, not surveyed staircase coordinates.
export function buildStairCues(path, startValue, endValue, data = school) {
  if (!path?.length) return [];
  const cues = [];
  const add = (building, direction, label, description, staircase, side) => {
    cues.push({building, direction, label, description, staircase, side});
  };
  const start = String(startValue).trim().padStart(4, '0');
  const end = String(endValue).trim().padStart(4, '0');
  const special = (number, kind) => {
    const room = data.knownRooms[number];
    const stairs = room?.[`${kind}Stairs`];
    if (stairs?.kind === 'stairwell') {
      const building = Number(number[1]);
      const choices = Object.entries(data.staircases[building] ?? {})
        .filter(([, staircase]) => staircase.kind !== 'hallway' && staircase.side === room.stairwellSide);
      for (const [label, staircase] of choices) add(building, stairs.direction, stairs.label, room[kind], label, staircase.side);
    }
  };
  if (start !== end) special(start, 'departure');
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const [building, floor] = from.split('-').map(Number);
    const [nextBuilding, nextFloor] = to.split('-').map(Number);
    if (building === nextBuilding && floor !== nextFloor) {
      const entrance = data.entrances?.[String(startValue).trim().toUpperCase()];
      const startContext = {number: start, stairwellSide: entrance
        ? data.staircases[entrance.building]?.[entrance.staircase]?.side : undefined};
      const side = building === 2
        ? mainStairwellVisit(path, i - 1, startContext, {number: end}, data).side : undefined;
      const choices = staircaseChoices(building, floor, nextFloor, side, data)
        .filter(([, stairs]) => stairs.kind !== 'hallway');
      const direction = nextFloor > floor ? 'up' : 'down';
      for (const [label, stairs] of choices) add(building, direction, `${floor} → ${nextFloor}`,
        `${data.buildings[building].name}: staircase ${label} at the ${stairs.side} end, ${direction} from the ${floorName(floor)} to the ${floorName(nextFloor)}.`, label, stairs.side);
    }
  }
  if (start !== end) special(end, 'arrival');
  return cues;
}

// Presentation anchors can be adjusted without changing routing or staircase sides.
export function stairCuePosition(cue, layout = mapLayout) {
  return layout.buildings[cue.building]?.stairwellEnds?.[cue.side] ?? null;
}

// Legacy schematic silhouettes; the floor-plan display highlights the drawn stairwell instead.
export function stairIconPath(direction, travelSide) {
  const risesLeftToRight = (direction === 'up') !== (travelSide === 'south');
  return risesLeftToRight
    ? 'M-40 32H-20V16H0V0H20V-16H40V-32'
    : 'M-40 -32H-20V-16H0V0H20V16H40V32';
}

// Show the walking route as one overview, with zoom controls and no separate itinerary.
export function renderRouteMap(container, path, startNumber, endNumber) {
  container.replaceChildren();
  const stages = buildRouteStages(path, startNumber, endNumber);
  container.hidden = !stages.length;
  if (!stages.length) return;

  const stairCues = buildStairCues(path, startNumber, endNumber);
  const composite = renderFloorComposite(path, startNumber, endNumber, stairCues);

  // Let small screens inspect the full SVG detail with native scrolling and keyboard panning.
  const viewport = document.createElement('div');
  viewport.className = 'map-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Building map; zoom in and scroll to pan');
  viewport.append(composite);
  const tools = document.createElement('div');
  tools.className = 'map-tools';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Map zoom');
  let zoom = 1;
  const zoomButtons = [];
  // Keep zoom controls usable with touch, keyboard, and a screen reader.
  function setZoom(value) {
    zoom = Math.max(1, Math.min(3, value));
    composite.style.width = `${zoom * 100}%`;
    composite.style.setProperty('--map-zoom', zoom);
    zoomButtons[0].disabled = zoom === 1;
    zoomButtons[1].textContent = `${zoom * 100}%`;
    zoomButtons[2].disabled = zoom === 3;
    if (zoom === 1) viewport.scrollTo(0, 0);
  }
  for (const [text, label, delta] of [['−', 'Zoom out', -.5], ['100%', 'Reset map zoom', 0], ['+', 'Zoom in', .5]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    // Reset to the overview or adjust the scale without changing the walking route.
    button.addEventListener('click', () => setZoom(delta ? zoom + delta : 1));
    tools.append(button);
    zoomButtons.push(button);
  }

  container.append(tools, viewport);
  setZoom(1);
}
