import {school} from './data.js';
import {floorName} from './routing.js';
import {buildCompositeMap, bounds, sectionPolygon, shifted, roomApproaches} from './floor-map.js';

const NS = 'http://www.w3.org/2000/svg';
const element = (name, attrs = {}, text = '') => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
};
const polyline = points => points.map(point => point.join(',')).join(' ');

function renderFloorComposite(route) {
  const {start, end} = route;
  const startValue = start.entrance ?? start.number, endValue = end.number;
  const model = buildCompositeMap(route);
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
    for (const section of sheet.sections) {
      if (!section.split?.staircase) continue;
      // Show the image seam across the hall at the landing.
      const {point, normal, fromFloor, toFloor} = section.split;
      const angle = Math.atan2(normal[1], normal[0]) * 180 / Math.PI;
      const seam = element('g', {transform: `translate(${point.join(' ')}) rotate(${angle})`});
      seam.append(element('path', {d: 'M-3 -18L1 -9L-3 0L1 9L-3 18', class: 'floor-stair-split'}));
      seam.append(element('title', {}, `Floor ${fromFloor} to floor ${toFloor} at the stairwell.`));
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
      for (const cue of section.movements) {
        const point = section.plan?.stairs[cue.staircase];
        if (point) {
          const location = shifted(point, section.offset);
          const key = `${section.building}-${location.join(',')}-${cue.direction}`;
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
export function renderRouteMap(container, route) {
  container.replaceChildren();
  container.hidden = !route.path;
  if (!route.path) return;
  const composite = renderFloorComposite(route);

  const viewport = document.createElement('div');
  viewport.className = 'map-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Building map; pinch to zoom and scroll to pan');
  viewport.append(composite);
  container.append(viewport);
}
