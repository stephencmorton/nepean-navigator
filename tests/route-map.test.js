// Check that graphical stages preserve routing facts and special levels rather than inventing paths.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graph, navigate, findPath} from '../routing.js';
import {mapLayout} from '../data.js';
import {buildRouteStages, buildingLink, routeMapLinks, linkArrow} from '../route-map.js';

test('building stages retain entry and exit floors in route order', () => {
  const route = navigate('3341', '2412');
  const stages = buildRouteStages(route.path, '3341', '2412');
  assert.deepEqual(stages.map(({building, floors}) => ({building, floors})), [
    {building: 3, floors: [3]}, {building: 2, floors: [3, 1]}, {building: 4, floors: [1, 2]},
  ]);
});

test('returning to a building remains a distinct visit', () => {
  const route = navigate('3101', '1101');
  const stages = buildRouteStages(route.path, '3101', '1101');
  assert.deepEqual(stages.map(stage => stage.building), [1, 2, 1]);
  assert.deepEqual(stages.map(stage => stage.floors), [[3], [3, 1], [1]]);
});

test('same-floor, same-room, and basement routes retain their actual levels', () => {
  assert.deepEqual(buildRouteStages(navigate('2205', '2206').path, '2205', '2206'), [
    {building: 2, floors: [2], levels: ['2nd floor']},
  ]);
  const stages = buildRouteStages(navigate('0201', '0501').path, '0201', '0501');
  assert.deepEqual(stages.map(stage => stage.levels), [['basement (floor 0)'], ['basement (floor 0)']]);
  assert.deepEqual(buildRouteStages(navigate('2205', '2205').path, '2205', '2205')[0].floors, [2]);
  assert.deepEqual(buildRouteStages(null, '2205', '3341'), []);
});

test('Guidance half-levels bracket the mapped floors in the correct direction', () => {
  assert.deepEqual(buildRouteStages(navigate('2201', '3341').path, '2201', '3341')[0].levels,
    ['half-level below the 2nd floor', '2nd floor', '3rd floor']);
  assert.deepEqual(buildRouteStages(navigate('2205', '2201').path, '2205', '2201')[0].levels,
    ['2nd floor', 'half-level below the 2nd floor']);
  assert.deepEqual(buildRouteStages(navigate('2201', '2201').path, '2201', '2201')[0].levels,
    ['half-level below the 2nd floor']);
});

test('graphical stages preserve every graph node for every mapped source and destination', () => {
  for (const start of graph.keys()) for (const end of graph.keys()) {
    const path = findPath(graph, start, end);
    if (!path) continue;
    const [startBuilding, startFloor] = start.split('-');
    const [endBuilding, endFloor] = end.split('-');
    const stages = buildRouteStages(path, `${startFloor}${startBuilding}99`, `${endFloor}${endBuilding}99`);
    assert.deepEqual(stages.flatMap(stage => stage.floors.map(floor => `${stage.building}-${floor}`)), path);
    for (const stage of stages) assert.ok(mapLayout.buildings[stage.building]);
    for (let i = 1; i < stages.length; i++) assert.ok(buildingLink(stages[i - 1].building, stages[i].building));
  }
});

test('schematic connectors reverse with travel and have no unsupported shortcuts', () => {
  const forward = buildingLink(2, 4);
  assert.deepEqual(buildingLink(4, 2), [...forward].reverse());
  assert.deepEqual(buildingLink(2, 4), forward);
  assert.equal(buildingLink(3, 4), null);
  assert.equal(buildingLink(2, 2), null);
});

test('direction arrows reverse with the route and ignore zero-length segments', () => {
  const points = buildingLink(2, 4);
  const arrow = linkArrow(points);
  const reverse = linkArrow([...points].reverse());
  assert.deepEqual(reverse, {x1: arrow.x2, y1: arrow.y2, x2: arrow.x1, y2: arrow.y1});
  assert.equal(linkArrow([[1, 1], [1, 1]]), null);
});

test('Main routes to Music, Science, and Gym use the end junction rather than a central exit', () => {
  for (const building of [3, 4, 5]) {
    const points = buildingLink(2, building);
    assert.ok(points.some(point => point[0] === mapLayout.mainHallway.right[0] && point[1] === mapLayout.mainHallway.right[1]));
    // Any branch crossing Main's top edge must stay within the end zone of its footprint.
    for (let index = 1; index < points.length; index++) {
      const [x, y] = points[index - 1];
      const [nextX, nextY] = points[index];
      if (x === nextX && Math.min(y, nextY) < 700 && Math.max(y, nextY) > 700) {
        assert.ok(x >= mapLayout.mainHallway.right[0] - 30);
      }
    }
  }
});

test('same-end transfers in Main join at the end without a detour to its centre', () => {
  const original = JSON.stringify(mapLayout.links);
  for (const [start, end] of [['3341', '2412'], ['0501', '3341'], ['2412', '0501']]) {
    const stages = buildRouteStages(navigate(start, end).path, start, end);
    const links = routeMapLinks(stages);
    assert.deepEqual(links[0].at(-1), mapLayout.mainHallway.right);
    assert.deepEqual(links[1][0], mapLayout.mainHallway.right);
    assert.ok(!links.flat().some(point => point[0] === mapLayout.mainHallway.center[0] && point[1] === mapLayout.mainHallway.center[1]));
  }
  assert.equal(JSON.stringify(mapLayout.links), original);
});

test('opposite-end transfers retain the full Main hallway and same-end returns still enter Main', () => {
  const stages = buildRouteStages(navigate('1101', '3341').path, '1101', '3341');
  const links = routeMapLinks(stages);
  assert.deepEqual(links[0].at(-2), mapLayout.mainHallway.left);
  assert.deepEqual(links[0].at(-1), mapLayout.mainHallway.center);
  assert.deepEqual(links[1][1], mapLayout.mainHallway.right);
  const returning = buildRouteStages(navigate('3101', '1101').path, '3101', '1101');
  assert.deepEqual(routeMapLinks(returning)[0].at(-1), mapLayout.mainHallway.left);
  assert.deepEqual(routeMapLinks(returning)[1][0], mapLayout.mainHallway.left);
});
