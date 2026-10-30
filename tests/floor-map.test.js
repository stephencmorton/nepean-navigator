import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {school} from '../data.js';
import {graph, findPath, navigate, parseStart, parseRoom} from '../routing.js';
import {floorPlans, clipFloorPolygon, pointAlong, roomMapPoint, hallwayPath, buildCompositeMap} from '../floor-map.js';

test('room interpolation follows low-to-high numbering along hallway length and bends', () => {
  assert.deepEqual(roomMapPoint(parseStart('1201')), [212, 550]);
  assert.deepEqual(roomMapPoint(parseStart('1212')), [554, 550]);
  assert.deepEqual(roomMapPoint(parseStart('0401')), [569, 300]);
  assert.deepEqual(roomMapPoint(parseStart('0412')), [569, 30]);
  assert.deepEqual(pointAlong([[0, 10], [0, 0], [20, 0]], .5), [5, 0]);
  assert.deepEqual(roomMapPoint(parseStart('N')), [572, 630]);
  assert.deepEqual(roomMapPoint(parseStart('2201')), [277, 570]);
  assert.deepEqual(roomMapPoint(parseStart('1305')), [569, 504]);
});
test('local paths turn only along traced hallways and never bridge missing geometry', () => {
  const path = hallwayPath(floorPlans['3-3'], [561, 550], [704, 370]);
  assert.deepEqual(path, [[561, 550], [647, 550], [647, 370], [704, 370]]);
  assert.equal(hallwayPath(floorPlans['2-0'], [277, 570], [474, 570]), null);
  assert.equal(hallwayPath(floorPlans['2-2'], [300, 500], [400, 550]), null);
  const disconnected = {paths: [[[0, 0], [0, 5]], [[10, 0], [10, 5]]]};
  assert.equal(hallwayPath(disconnected, [0, 0], [10, 5]), null);
});
test('composites use appropriate drawings without user floor controls', () => {
  const route = navigate('2205', '3307');
  const map = buildCompositeMap(route);
  assert.equal(map.sheets.length, 1);
  assert.deepEqual(map.sections.map(section => [section.building, section.floor]), [[2, 3], [3, 3]]);
  assert.deepEqual(map.sections[0].floors, [2, 3]);
  assert.deepEqual(map.sections[0].stairs, new Set(['A']));
  const nearest = buildCompositeMap(navigate('1212', '2205'));
  assert.deepEqual(nearest.sections[0].stairs, new Set(['A']));
  const ground = buildCompositeMap(navigate('2205', '1306'));
  assert.deepEqual(ground.sections.map(section => section.floor), [2, 2, 1]);
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
  assert.deepEqual(art.sections.map(section => section.floor), [1, 3]);
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
          const distance = point.reduce((sum, value, axis) => sum + (value + section.offset[axis] - cut.point[axis]) * cut.normal[axis], 0);
          assert.ok(distance * cut.sign >= -.01, 'A floor split must not clip away the route');
        }
      }
      if (section.building === 2 && section.floor === 0) {
        assert.ok(section.lines.some(line => line === null));
      } else assert.ok(section.lines.every(line => line !== null), `Missing trace for ${start} → ${end}, building ${section.building} floor ${section.floor}`);
    }
  }
});
test('all entrances and special destinations produce composite routes', () => {
  for (const entrance of Object.keys(school.entrances)) for (const room of Object.keys(school.knownRooms)) {
    const route = navigate(entrance, room);
    const map = buildCompositeMap(route);
    assert.ok(map.sections[0].from);
    assert.ok(map.sections.at(-1).to);
    assert.ok(map.sections[0].lines.every(Boolean), `Missing entrance approach for ${entrance} → ${room}`);
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
});

test('every active building connection has traced map ports at both endpoints', () => {
  for (const {from, to} of school.connections) {
    for (const [node, neighbor] of [[from, to], [to, from]]) {
      const plan = floorPlans[node];
      const otherBuilding = Number(neighbor.split('-')[0]);
      const port = plan?.ports[otherBuilding];
      assert.ok(port, `Missing map port for ${node} → ${neighbor}`);
      assert.ok(hallwayPath(plan, port, port), `Map port off the traced hall: ${node} → ${neighbor}`);
    }
  }
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

test('2407 to 3105 uses one composite with a floor split at staircase E', () => {
  const route = navigate('2407', '3105');
  const map = buildCompositeMap(route);
  assert.equal(map.sheets.length, 1);
  assert.deepEqual(map.sections.flatMap(section => section.nodes), route.path);
  const art = map.sections.filter(section => section.building === 1);
  assert.equal(art.length, 2);
  assert.equal(art[1].split.fromFloor, 2);
  assert.equal(art[1].split.toFloor, 3);
  assert.equal(art[1].split.staircase, 'E');
  assert.deepEqual(art[1].split.point, art[0].to);
  assert.deepEqual(art[1].offset, [0, -45]);
  assert.deepEqual(art[1].from.map((value, axis) => value + art[1].offset[axis]), art[0].to);
  assert.ok(art[0].stairs.has('E') && art[1].stairs.has('E'));
  assert.equal(art[0].cuts[0].sign, 1);
  assert.equal(art[1].cuts[0].sign, -1);
});
test('hallway floor changes keep their image split without a stairwell marker', () => {
  for (const [start, end] of [['2205', '1306'], ['1306', '2205']]) {
    const route = navigate(start, end);
    const map = buildCompositeMap(route);
    const hallway = map.sections.find(section => section.building === 3 && section.split);
    assert.ok(hallway, 'The floor drawings still join at the hallway steps');
    assert.equal(hallway.split.staircase, undefined);
  }
});
test('stairwell clipping preserves the correct half of an image', () => {
  const polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
  for (const sign of [-1, 1]) {
    const result = clipFloorPolygon(polygon, {point: [5, 5], normal: [1, 0], sign});
    assert.ok(result.length >= 4);
    assert.ok(result.every(point => (point[0] - 5) * sign >= 0));
  }
  for (const [start, end] of [['1101', '3105'], ['3105', '1101'], ['2407', '3105'], ['3105', '2407']]) {
    const route = navigate(start, end);
    assert.equal(buildCompositeMap(route).sheets.length, 1);
  }
});
