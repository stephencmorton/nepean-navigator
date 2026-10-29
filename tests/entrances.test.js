import {test} from 'node:test';
import assert from 'node:assert/strict';
import {school} from '../data.js';
import {graph, navigate, parseStart, parseRoom} from '../routing.js';
import {buildRouteStages} from '../route-map.js';

test('entrances have mapped locations, valid floors, and matching staircases', () => {
  assert.deepEqual(Object.keys(school.entrances), ['A', 'B', 'C', 'N']);
  for (const [id, entrance] of Object.entries(school.entrances)) {
    const start = parseStart(id);
    assert.equal(start.number, undefined);
    assert.equal(start.node, `${entrance.building}-${entrance.floor}`);
    assert.ok(graph.has(start.node));
    const building = school.buildings[start.building];
    assert.ok(start.floor >= building.lowestFloor && start.floor <= building.highestFloor);
    if (start.doorFloor !== undefined) {
      assert.ok(start.doorFloor >= building.lowestFloor && start.doorFloor <= building.highestFloor);
    }
    assert.equal(start.side, 'east');
    if (entrance.staircase) {
      const stairs = school.staircases[start.building][entrance.staircase];
      assert.ok(stairs.floors.includes(start.floor));
      assert.equal(start.stairwellSide, stairs.side);
    }
    assert.throws(() => parseRoom(id));
    assert.throws(() => navigate('2205', id));
  }
  assert.deepEqual(parseStart(' n '), parseStart('N'));
  assert.throws(() => parseStart('Z'), /Entrance Z/);
  assert.deepEqual(parseStart('201'), parseRoom('0201'));
});
test('every entrance routes to rooms and renders map stages without a fake room number', () => {
  for (const id of Object.keys(school.entrances)) {
    for (const destination of ['2205', '1305', '2412', '2201']) {
      const route = navigate(id, destination);
      assert.ok(route.path);
      assert.equal(route.path[0], parseStart(id).node);
      assert.equal(route.path.at(-1), parseRoom(destination).node);
      assert.match(route.steps[0], new RegExp(`Entrance ${id}`));
      assert.match(route.steps[1], new RegExp(`From Entrance ${id}`));
      const stages = buildRouteStages(route.path, id, destination);
      assert.equal(stages[0].building, school.entrances[id].building);
    }
  }
});
test('Main entrances use the known staircase side and preserve Guidance crossings', () => {
  for (const id of ['A', 'B']) {
    const route = navigate(id, '1203');
    const side = school.staircases[2][id].side;
    assert.match(route.steps.join(' '), new RegExp(`staircase ${id} at the ${side} end`));
    assert.doesNotMatch(route.steps.join(' '), /nearest staircase|Head to/);
    const guidance = navigate(id, '2201');
    assert.match(guidance.steps.at(-1), /half-level/);
    const crossing = guidance.steps.some(step => step.includes('Walk through'));
    assert.equal(crossing, side !== school.knownRooms['2201'].stairwellSide);
  }
});
test('C and N orient users at the east end, including same-floor destinations', () => {
  for (const [id, room] of [['C', '2101'], ['N', '2306']]) {
    const route = navigate(id, room);
    assert.equal(route.path.length, 1);
    assert.equal(parseStart(id).floor, 2);
    assert.match(route.steps[0], /1st \(ground\) floor/);
    assert.match(route.steps[1], /hallway stairs.*2nd floor/);
    assert.match(route.steps[1], /east end of the hallway/);
    assert.match(route.steps.at(-1), /Stay on this floor/);
    assert.doesNotMatch(route.steps.join(' '), /already at the destination/);
  }
});
