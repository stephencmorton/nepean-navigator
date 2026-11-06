import {school} from './data.js';
import {entranceArtwork} from './hallway-paths.js';
import {floorName} from './routing.js';
import {buildCompositeMap, bounds, sectionPolygon, shifted, roomApproaches, routeViewBox, sheetMapViewBox, constrainViewBox, scaleViewBox} from './floor-map.js';

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
    const [x, y, width, height] = sheetMapViewBox(sheet);
    const svg = element('svg', {viewBox: `${x} ${y} ${width} ${height}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', class: 'floor-route-map', 'aria-labelledby': `floor-map-title-${sheetIndex} floor-map-desc-${sheetIndex}`});
    svg.append(element('title', {id: `floor-map-title-${sheetIndex}`}, 'Route across floor plans'));
    svg.append(element('desc', {id: `floor-map-desc-${sheetIndex}`}, sheet.sections.map(section =>
      `${school.buildings[section.building].name}: ${section.floors.map(floorName).join(' to ')}. Room positions are estimates; named destinations show their approach.`).join(' ')));
    const defs = element('defs');
    const arrowId = `floor-route-arrow-${sheetIndex}`;
    const arrow = element('marker', {id: arrowId, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 3, markerHeight: 3, orient: 'auto'});
    arrow.append(element('path', {d: 'M0 0L10 5L0 10Z', fill: '#a50086'})); defs.append(arrow); svg.append(defs);
    // Preserve shared street and compass artwork outside the building-specific image clips.
    const contextClipId = `floor-context-${sheetIndex}`;
    const contextClip = element('clipPath', {id: contextClipId, clipPathUnits: 'userSpaceOnUse'});
    const buildingHoles = Object.keys(bounds).map(Number).map(building => {
      const points = sectionPolygon({building, offset: [0, 0]});
      return `M${points[0].join(',')}${points.slice(1).map(point => `L${point.join(',')}`).join('')}Z`;
    }).join(' ');
    contextClip.append(element('path', {d: `M0,0H773V742H0Z ${buildingHoles}`, 'clip-rule': 'evenodd'}));
    defs.append(contextClip);
    svg.append(element('image', {href: './public/floor-1.svg', x: 0, y: 0, width: 773, height: 742, preserveAspectRatio: 'none', 'clip-path': `url(#${contextClipId})`}));
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
    // Entrance badges can sit just outside a building's clipped outline. Restore
    // their original artwork above the route annotations so the white letters
    // remain visible on every composite map sheet.
    const entranceClipId = `floor-entrances-${sheetIndex}`;
    const entranceClip = element('clipPath', {id: entranceClipId, clipPathUnits: 'userSpaceOnUse'});
    for (const point of entranceArtwork) {
      entranceClip.append(element('rect', {x: point[0] - 11, y: point[1] - 11, width: 22, height: 22}));
    }
    defs.append(entranceClip);
    svg.append(element('image', {href: './public/floor-1.svg', x: 0, y: 0, width: 773, height: 742,
      preserveAspectRatio: 'none', 'clip-path': `url(#${entranceClipId})`, class: 'floor-entrance-artwork', 'pointer-events': 'none'}));
    container.append(svg);
    for (const section of sheet.sections.filter(section => section.lines.some(line => !line))) {
      const note = document.createElement('p'); note.className = 'floor-map-gap';
      note.textContent = `${school.buildings[section.building].name}, floor ${section.floor}: hallway detail is not available for this segment. Follow the written directions.`;
      container.append(note);
    }
  });
  return {container, model};
}
export function renderRouteMap(container, route) {
  container.replaceChildren();
  container.hidden = !route.path;
  if (!route.path) return;
  const {container: composite, model} = renderFloorComposite(route);

  const viewport = document.createElement('div');
  viewport.className = 'map-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Building map; pinch to zoom and drag to pan');
  viewport.append(composite);
  container.append(viewport);

  // Crop each phone map sheet to its complete route. SVG preserveAspectRatio
  // then fits that viewBox without relying on a fragile scroll position.
  const phoneLandscape = matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 600px)');
  const maps = [...composite.querySelectorAll('.floor-route-map')];
  maps.forEach(svg => { svg.dataset.fullViewBox = svg.getAttribute('viewBox'); });
  const parseViewBox = value => value.split(/\s+/).map(Number);
  const setViewBox = (svg, viewBox) => svg.setAttribute('viewBox', viewBox.join(' '));
  const addGestures = svg => {
    const pointers = new Map();
    let gesture;
    const currentViewBox = () => parseViewBox(svg.getAttribute('viewBox'));
    const fullViewBox = () => parseViewBox(svg.dataset.fullViewBox);
    const startPan = point => { gesture = {kind: 'pan', point, viewBox: currentViewBox()}; };
    const startPinch = () => {
      const [a, b] = [...pointers.values()];
      gesture = {kind: 'pinch', distance: Math.hypot(b.x - a.x, b.y - a.y),
        midpoint: [(a.x + b.x) / 2, (a.y + b.y) / 2], viewBox: currentViewBox()};
    };
    svg.addEventListener('pointerdown', event => {
      if (!phoneLandscape.matches || event.pointerType === 'mouse') return;
      svg.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (pointers.size === 1) startPan(pointers.values().next().value);
      else if (pointers.size === 2) startPinch();
    });
    svg.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId) || !phoneLandscape.matches) return;
      pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (gesture?.kind === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const anchor = [(gesture.midpoint[0] - rect.left) / rect.width,
          (gesture.midpoint[1] - rect.top) / rect.height].map(value => Math.max(0, Math.min(1, value)));
        setViewBox(svg, scaleViewBox(gesture.viewBox, fullViewBox(),
          gesture.distance / Math.max(distance, 1), anchor));
      } else if (gesture?.kind === 'pan' && pointers.size === 1) {
        const point = pointers.values().next().value;
        const [x, y, width, height] = gesture.viewBox;
        setViewBox(svg, constrainViewBox([
          x - (point.x - gesture.point.x) * width / rect.width,
          y - (point.y - gesture.point.y) * height / rect.height,
          width, height,
        ], fullViewBox()));
      }
    });
    const endPointer = event => {
      pointers.delete(event.pointerId);
      if (pointers.size === 1) startPan(pointers.values().next().value);
      else if (!pointers.size) gesture = undefined;
    };
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);
  };
  maps.forEach(addGestures);
  const updateViewBoxes = () => {
    if (!viewport.isConnected) return;
    maps.forEach((svg, index) => {
      const viewBox = phoneLandscape.matches && routeViewBox(model.sheets[index]);
      svg.setAttribute('viewBox', viewBox ? viewBox.join(' ') : svg.dataset.fullViewBox);
    });
  };
  updateViewBoxes();
  phoneLandscape.addEventListener('change', updateViewBoxes);
}
