import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {school} from '../data.js';
import {entrances, rooms} from '../map-geometry.js';
import {graph, findPath, navigate, parseStart, parseRoom} from '../routing.js';
import {floorPlans, clipFloorPolygon, pointAlong, roomMapPoint, hallwayPath, buildCompositeMap, sheetRoutePoints, routeViewBox, sheetMapViewBox, scaleViewBox} from '../floor-map.js';

// True when a point lies on one of a plan's generated centerline segments.
const onTrace = (plan, point) => plan.paths.some(points => points.slice(1).some((end, i) => {
  const start = points[i];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return Math.abs(Math.hypot(point[0] - start[0], point[1] - start[1]) + Math.hypot(point[0] - end[0], point[1] - end[1]) - length) < .001;
}));

test('room interpolation follows low-to-high numbering along hallway length and bends', () => {
  assert.deepEqual(roomMapPoint(parseStart('1201')), floorPlans['2-1'].primary[0]);
  assert.deepEqual(roomMapPoint(parseStart('1212')), floorPlans['2-1'].primary.at(-1));
  assert.deepEqual(roomMapPoint(parseStart('0401')), floorPlans['4-0'].primary[0]);
  assert.deepEqual(roomMapPoint(parseStart('0412')), floorPlans['4-0'].primary.at(-1));
  assert.deepEqual(pointAlong([[0, 10], [0, 0], [20, 0]], .5), [5, 0]);
  for (const node of ['2-1', '4-0']) {
    const plan = floorPlans[node];
    assert.ok(plan.primary.every(point => onTrace(plan, point)), `${node} room line snaps onto the traced hall`);
  }
  // Main runs south to north (left to right); Math/Science runs east to west (bottom to top).
  assert.ok(roomMapPoint(parseStart('1201'))[0] < roomMapPoint(parseStart('1206'))[0]);
  assert.ok(roomMapPoint(parseStart('0401'))[1] > roomMapPoint(parseStart('0406'))[1]);
  assert.deepEqual(roomMapPoint(parseStart('N')), entrances.N['2']);
  for (const number of Object.keys(rooms)) assert.deepEqual(roomMapPoint(parseStart(number)), rooms[number]);
});
test('local paths turn only along traced hallways and never bridge missing geometry', () => {
  const from = [561, 550], to = [704, 370];
  const path = hallwayPath(floorPlans['3-3'], from, to);
  assert.deepEqual([path[0], path.at(-1)], [from, to]);
  assert.ok(path.slice(1, -1).every(point => onTrace(floorPlans['3-3'], point)));
  assert.ok(path.length > 4, 'The Auditorium top-floor route follows its bends');
  assert.equal(hallwayPath(floorPlans['2-0'], [277, 570], [474, 570]), null);
  assert.deepEqual(hallwayPath(floorPlans['2-2'], [300, 500], [400, 550]), [[300, 500], [300, 550], [400, 550]]);
  const disconnected = {paths: [[[0, 0], [0, 5]], [[10, 0], [10, 5]]]};
  assert.equal(hallwayPath(disconnected, [0, 0], [10, 5]), null);
});
test('composites use appropriate drawings without user floor controls', () => {
  const route = navigate('2205', '3307');
  const map = buildCompositeMap(route);
  assert.equal(map.sheets.length, 1);
  assert.equal(buildCompositeMap(navigate('2105', '1509')).sheets.length, 1);
  assert.equal(buildCompositeMap(navigate('1509', '2105')).sheets.length, 1);
  assert.deepEqual(map.sections.map(section => [section.building, section.floor]), [[2, 2], [2, 3], [3, 3]]);
  assert.deepEqual(map.sections[0].floors, [2]);
  assert.deepEqual(map.sections[0].stairs, new Set(['A']));
  const nearest = buildCompositeMap(navigate('1212', '2205'));
  assert.deepEqual(nearest.sections[0].stairs, new Set(['A']));
  const ground = buildCompositeMap(navigate('2205', '1306'));
  assert.deepEqual(ground.sections.map(section => section.floor), [2, 2, 1]);
});
test('phone view boxes contain every route and can un-pinch to every whole map', () => {
  const buildingRooms = ['1203', '2205', '1305', '0407', '1509'];
  const sources = [...Object.keys(school.entrances), ...buildingRooms];
  let combinations = 0;
  for (const start of sources) for (const end of buildingRooms) {
    combinations++;
    const label = `${start} -> ${end}`;
    const route = navigate(start, end);
    assert.ok(route.path, `${label}: route is connected`);
    assert.equal(route.path[0], parseStart(start).node, `${label}: route starts at its source`);
    assert.equal(route.path.at(-1), parseRoom(end).node, `${label}: route reaches its destination`);
    const map = buildCompositeMap(route);
    assert.ok(map.sheets.length, `${label}: route has at least one map sheet`);
    for (const sheet of map.sheets) {
      const points = sheetRoutePoints(sheet);
      const routeBox = routeViewBox(sheet);
      const [x, y, width, height] = routeBox;
      assert.ok(points.length, `${label}: map sheet has route geometry`);
      for (const [pointX, pointY] of points) {
        assert.ok(pointX >= x && pointX <= x + width, `${label}: route x-coordinate is visible`);
        assert.ok(pointY >= y && pointY <= y + height, `${label}: route y-coordinate is visible`);
      }
      const fullBox = sheetMapViewBox(sheet);
      const zoomOutFactor = Math.max(fullBox[2] / width, fullBox[3] / height) + 1;
      assert.deepEqual(scaleViewBox(routeBox, fullBox, zoomOutFactor), fullBox,
        `${label}: un-pinching can restore the whole map`);
      let repeatedPinch = routeBox;
      for (let gesture = 0; gesture < 4; gesture++) {
        repeatedPinch = scaleViewBox(repeatedPinch, fullBox, 2);
      }
      assert.deepEqual(repeatedPinch, fullBox,
        `${label}: repeated un-pinch gestures reach the whole map`);
    }
  }
  assert.equal(combinations, 45);
});
test('rotated phone map keeps an explicit height and has no zoom controls', () => {
  const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../route-map.js', import.meta.url), 'utf8');
  assert.match(style, /#route-map \{height: calc\(100dvh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\) - 12px\); min-height: 0;/);
  assert.match(style, /\.map-viewport \{height: 100%; min-height: 0; max-height: 100%;/);
  assert.match(style, /#route-map \.floor-composite \{display: flex; flex-direction: column; height: 100%;\}/);
  assert.match(style, /#route-map \.floor-route-map \{[^}]*touch-action: none;/);
  assert.match(renderer, /addEventListener\('pointerdown'/);
  assert.match(renderer, /addEventListener\('pointermove'/);
  assert.match(renderer, /class: 'floor-entrance-artwork'/);
  assert.match(renderer, /entranceArtwork/);
  assert.doesNotMatch(page, /map-controls|data-map-action|Fit route|Whole map/);
});
test('different geometries and repeated building visits are separated in route order', () => {
  const path = ['3-3', '2-3', '2-2', '3-1', '3-2'];
  const map = buildCompositeMap({path, start: parseStart('3301'), end: parseRoom('2307')});
  assert.deepEqual(map.sections.flatMap(section => section.nodes), path);
  assert.equal(map.sections[0].floor, 3);
  assert.ok(map.sheets.length > 1);
  for (const sheet of map.sheets) {
    for (let i = 1; i < sheet.sections.length; i++) {
      if (sheet.sections.slice(0, i).some(section => section.building === sheet.sections[i].building)) {
        assert.ok(sheet.sections[i].split);
        assert.equal(sheet.sections[i - 1].building, sheet.sections[i].building);
      }
    }
  }
  const art = buildCompositeMap(navigate('1101', '3105'));
  assert.deepEqual(art.sections.map(section => section.floor), [1, 2, 3]);
});
test('every mapped pair retains its graph path and all drawn hallway geometry is supported', () => {
  for (const start of graph.keys()) for (const end of graph.keys()) {
    const path = findPath(graph, start, end);
    if (!path) continue;
    const room = node => {const [building, floor] = node.split('-'); return `${floor}${building}01`;};
    const map = buildCompositeMap({path, start: parseStart(room(start)), end: parseRoom(room(end))});
    assert.deepEqual(map.sections.flatMap(section => section.nodes), path);
    for (const section of map.sections) {
      assert.ok(floorPlans[`${section.building}-${section.floor}`]);
      for (const cut of section.cuts ?? []) {
        for (const point of section.lines.filter(Boolean).flat()) {
          const distance = point.reduce((sum, value, axis) => sum + (value - cut.point[axis]) * cut.normal[axis], 0);
          assert.ok(distance * cut.sign >= -.01, 'A floor split must not clip away the route');
        }
      }
      if (section.building === 2 && section.floor === 0) {
        assert.ok(section.lines.some(line => line === null));
      } else assert.ok(section.lines.every(line => line !== null), `Missing trace for ${start} -> ${end}, building ${section.building} floor ${section.floor}`);
    }
  }
});
test('all entrances and special destinations produce composite routes', () => {
  for (const entrance of Object.keys(school.entrances)) for (const room of Object.keys(school.knownRooms)) {
    const route = navigate(entrance, room);
    const map = buildCompositeMap(route);
    assert.ok(map.sections[0].from);
    assert.ok(map.sections.at(-1).to);
    assert.ok(map.sections[0].lines.every(Boolean), `Missing entrance approach for ${entrance} -> ${room}`);
  }
});
test('floor images share a canvas and are explicitly staged and cached', () => {
  const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const boxes = [];
  for (let floor = 0; floor <= 3; floor++) {
    const asset = `public/floor-${floor}.svg`;
    const source = readFileSync(new URL(`../${asset}`, import.meta.url), 'utf8');
    boxes.push(source.match(/viewBox="([^"]+)"/)[1]);
    assert.ok(worker.includes(`'${asset}'`));
    assert.ok(workflow.includes(asset));
  }
  assert.equal(new Set(boxes).size, 1);
  assert.ok(worker.includes("'floor-map.js'"));
  assert.ok(workflow.includes('floor-map.js'));
  assert.ok(worker.includes("'map-geometry.js'"));
  assert.ok(workflow.includes('map-geometry.js'));
});

test('every active building connection has traced map ports at both endpoints', () => {
  for (const {from, to} of school.connections) {
    for (const [node, neighbor] of [[from, to], [to, from]]) {
      const plan = floorPlans[node];
      const otherBuilding = Number(neighbor.split('-')[0]);
      const port = plan?.ports[otherBuilding];
      assert.ok(port, `Missing map port for ${node} -> ${neighbor}`);
      assert.ok(hallwayPath(plan, port, port), `Map port off the traced hall: ${node} -> ${neighbor}`);
    }
  }
});
test('Gym-to-Science corridor follows generated hallway centerlines', () => {
  const plan = floorPlans['5-1'];
  const gymToScience = hallwayPath(plan, plan.approach, plan.ports[4]);
  assert.deepEqual([gymToScience[0], gymToScience.at(-1)], [plan.approach, plan.ports[4]]);
  assert.ok(gymToScience.slice(1, -1).every(point => onTrace(plan, point)));
  // The corridor leaves the Gym southward, then crosses east toward Science.
  const xs = gymToScience.map(point => point[0]), ys = gymToScience.map(point => point[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 50 && Math.max(...ys) > plan.approach[1]);
  for (const [node, other] of [['5-1', 4], ['4-1', 5]]) {
    const point = floorPlans[node].ports[other];
    assert.ok(point);
    assert.ok(hallwayPath(floorPlans[node], point, point));
  }
  const route = buildCompositeMap(navigate('1509', '1401'));
  assert.deepEqual(route.sections.flatMap(section => section.nodes), ['5-1', '4-1']);
  assert.ok(route.sections.every(section => section.lines.every(Boolean)));
});
test('updated Main second-floor links draw complete routes in either direction', () => {
  for (const destination of ['2103', '2307']) {
    for (const [start, end] of [['2205', destination], [destination, '2205']]) {
      const route = navigate(start, end);
      assert.equal(route.path.length, 2);
      const map = buildCompositeMap(route);
      assert.ok(map.sections.every(section => section.lines.every(Boolean)));
      assert.deepEqual(map.sections.flatMap(section => section.nodes), route.path);
      assert.ok(map.sections[0].to);
      assert.ok(map.sections[1].from);
      assert.deepEqual(map.sections.map(section => section.floor), [2, 2]);
    }
  }
});

test('2105 to 3105 draws each source floor at staircase E', () => {
  const route = navigate('2105', '3105');
  const map = buildCompositeMap(route);
  assert.equal(map.sheets.length, 2);
  assert.deepEqual(map.sections.flatMap(section => section.nodes), route.path);
  const art = map.sections.filter(section => section.building === 1);
  assert.equal(art.length, 2);
  assert.ok(art[0].stairs.has('E') && art[1].stairs.has('E'));
  assert.ok(art.every(section => section.lines.every(Boolean)));
});
test('hallway floor changes use their separate source drawings without a stairwell marker', () => {
  for (const [start, end] of [['2205', '1306'], ['1306', '2205']]) {
    const route = navigate(start, end);
    const map = buildCompositeMap(route);
    const hallway = map.sections.filter(section => section.building === 3);
    assert.deepEqual(hallway.map(section => section.floor).sort(), [1, 2]);
    assert.ok(hallway.every(section => !section.split?.staircase && !section.movements.length));
  }
});
test('stairwell clipping preserves the correct half of an image and separates unmatched floors', () => {
  const polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
  for (const sign of [-1, 1]) {
    const result = clipFloorPolygon(polygon, {point: [5, 5], normal: [1, 0], sign});
    assert.ok(result.length >= 4);
    assert.ok(result.every(point => (point[0] - 5) * sign >= 0));
  }
  for (const [start, end, expectedSheets] of [
    ['1101', '3105', 3], ['3105', '1101', 3], ['2407', '3105', 2], ['3105', '2407', 2],
  ]) {
    const route = navigate(start, end);
    assert.equal(buildCompositeMap(route).sheets.length, expectedSheets);
  }
});
