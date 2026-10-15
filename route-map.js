// Accessible SVG building overview and ordered floor changes derived from the computed route.
import {school, mapLayout} from './data.js';
import {floorName, parseRoom} from './routing.js';

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
  const start = parseRoom(startNumber).number;
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

// Create SVG elements with explicit namespaces and plain-text labels.
function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

// Render the full route once; stage buttons only change the visual emphasis and floor readout.
export function renderRouteMap(container, path, startNumber, endNumber) {
  container.replaceChildren();
  const stages = buildRouteStages(path, startNumber, endNumber);
  container.hidden = !stages.length;
  if (!stages.length) return;

  const svg = svgElement('svg', {viewBox: mapLayout.viewBox, role: 'img', 'aria-labelledby': 'building-map-title building-map-description', class: 'building-map'});
  svg.append(
    svgElement('title', {id: 'building-map-title'}, 'Your route through the school buildings'),
    svgElement('desc', {id: 'building-map-description'}, `Approximate top view. Building order: ${stages.map(stage => `${stage.building}, ${school.buildings[stage.building]}`).join('; ')}. Gray dotted hallways follow the supplied memory-based sketch. Purple arrows show the route, with Main's connections near its ends. Floor changes are listed below the map.`),
  );
  const defs = svgElement('defs');
  const marker = svgElement('marker', {id: 'building-map-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto'});
  marker.append(svgElement('path', {d: 'M0 0L10 5L0 10Z', fill: '#7526b8'}));
  defs.append(marker);
  svg.append(defs, svgElement('path', {d: mapLayout.background, class: 'map-background'}));

  const visited = new Set(stages.map(stage => stage.building));
  const buildingGroups = new Map();
  // Draw footprints before connectors so the highlighted route remains legible above them.
  for (const [number, geometry] of Object.entries(mapLayout.buildings)) {
    const group = svgElement('g', {class: `map-building${visited.has(Number(number)) ? ' on-route' : ''}`});
    group.append(svgElement('path', {d: geometry.outline, class: 'map-footprint'}));
    svg.append(group);
    buildingGroups.set(Number(number), group);
  }
  // Show the remembered hallway network as context beneath the highlighted route.
  for (const points of mapLayout.hallways) {
    svg.append(svgElement('polyline', {points: points.map(point => point.join(',')).join(' '), class: 'map-hallway'}));
  }
  for (const points of routeMapLinks(stages)) {
    if (points) {
      svg.append(svgElement('polyline', {points: points.map(point => point.join(',')).join(' '), class: 'map-route-line'}));
      const arrow = linkArrow(points);
      if (arrow) svg.append(svgElement('line', {...arrow, class: 'map-direction', 'marker-end': 'url(#building-map-arrow)'}));
    }
  }
  // White label backgrounds separate building identities from the illustrative route strokes.
  for (const [number, geometry] of Object.entries(mapLayout.buildings)) {
    const [x, y] = geometry.center;
    const label = svgElement('g', {class: `map-building-label${visited.has(Number(number)) ? ' on-route' : ''}`});
    label.append(svgElement('rect', {x: x - 85, y: y - 55, width: 170, height: 135, rx: 14}));
    label.append(svgElement('text', {x, y: y - 8, class: 'map-building-number'}, number));
    geometry.label.forEach((line, index) => {
      label.append(svgElement('text', {x, y: y + 30 + index * 30, class: 'map-building-name'}, line));
    });
    svg.append(label);
  }

  const caption = document.createElement('p');
  caption.className = 'map-caption';
  caption.textContent = 'Gray dots: approximate hallways from the supplied sketch. Purple arrows: your route. Exact room and stairwell positions are unverified.';
  const stageList = document.createElement('ol');
  stageList.className = 'map-stages';
  stageList.setAttribute('aria-label', 'Buildings and floors in route order');
  const status = document.createElement('p');
  status.className = 'map-stage-status';
  status.setAttribute('aria-live', 'polite');
  const buttons = [];

  // Let small screens inspect the full SVG detail with native scrolling and keyboard panning.
  const viewport = document.createElement('div');
  viewport.className = 'map-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Building map; zoom in and scroll to pan');
  viewport.append(svg);
  const tools = document.createElement('div');
  tools.className = 'map-tools';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Map zoom');
  let zoom = 1;
  const zoomButtons = [];
  // Keep zoom controls usable with touch, keyboard, and a screen reader.
  function setZoom(value) {
    zoom = Math.max(1, Math.min(3, value));
    svg.style.width = `${zoom * 100}%`;
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
    // Reset to the overview or adjust the scale without changing the selected route stage.
    button.addEventListener('click', () => setZoom(delta ? zoom + delta : 1));
    tools.append(button);
    zoomButtons.push(button);
  }

  // Select a route stage without implying live positioning or progress through the school.
  function selectStage(index) {
    const selected = stages[index];
    for (const [building, group] of buildingGroups) group.classList.toggle('is-selected', building === selected.building);
    buttons.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === index)));
    status.textContent = `Stage ${index + 1} of ${stages.length}: ${school.buildings[selected.building]} · ${selected.levels.join(' → ')}`;
  }
  stages.forEach((stage, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const heading = document.createElement('strong');
    const endpoint = stages.length === 1 ? 'Start & finish' : index === 0 ? 'Start' : index === stages.length - 1 ? 'Finish' : 'Through';
    heading.textContent = `${endpoint} · Building ${stage.building} · ${school.buildings[stage.building]}`;
    const levels = document.createElement('span');
    levels.textContent = stage.levels.join(' → ');
    button.append(heading, levels);
    // Keep all repeated visits selectable, including routes that return to the starting building.
    button.addEventListener('click', () => selectStage(index));
    item.append(button);
    stageList.append(item);
    buttons.push(button);
  });
  container.append(status, tools, viewport, caption, stageList);
  setZoom(1);
  selectStage(0);
}
