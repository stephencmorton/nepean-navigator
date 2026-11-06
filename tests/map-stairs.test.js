import {test} from 'node:test';
import assert from 'node:assert/strict';
import {navigate} from '../routing.js';
import {buildCompositeMap} from '../floor-map.js';

test('the map marks the selected stairwell in both directions, including basement and skipped floors', () => {
  for (const [start, end, building, staircase, direction] of [
    ['1205', '2206', 2, 'B', 'up'], ['2206', '1205', 2, 'B', 'down'],
    ['0201', '3201', 2, 'B', 'up'], ['2105', '3105', 1, 'E', 'up'], ['2407', '3105', 2, 'B', 'up'],
    ['3105', '2105', 1, 'E', 'down'], ['2412', '0401', 4, 'J', 'down'],
  ]) {
    const map = buildCompositeMap(navigate(start, end));
    const sections = map.sections.filter(section => section.building === building);
    assert.ok(sections.some(section => section.movements.length));
    for (const section of sections) for (const move of section.movements) {
      assert.equal(move.staircase, staircase);
      assert.equal(move.direction, direction);
      assert.ok(section.stairs.has(staircase));
    }
  }
});

test('hallway steps, entrance approaches, and same-floor routes have no stairwell markers', () => {
  for (const [start, end] of [
    ['2205', '2301'], ['2301', '2205'], ['1301', '2301'], ['2301', '1301'],
    ['2205', '2206'], ['C', '2101'], ['N', '2306'], ['N', '1305'],
  ]) {
    const map = buildCompositeMap(navigate(start, end));
    assert.ok(map.sections.every(section => !section.movements.length), `${start} -> ${end}`);
  }
});

test('Guidance half-level markers use B and preserve arrival and departure directions', () => {
  for (const [start, end, direction] of [['2205', '2201', 'down'], ['2201', '2205', 'up']]) {
    const map = buildCompositeMap(navigate(start, end));
    assert.equal(map.sections.length, 1);
    assert.deepEqual(map.sections[0].movements.map(({staircase, direction}) => [staircase, direction]), [['B', direction]]);
  }
  assert.deepEqual(buildCompositeMap(navigate('2201', '2201')).sections[0].movements, []);
});

test('Main entrances keep their own stairwell when changing floors', () => {
  for (const id of ['A', 'B']) {
    const map = buildCompositeMap(navigate(id, '1203'));
    assert.ok(map.sections[0].movements.length);
    assert.ok(map.sections[0].movements.every(move => move.staircase === id && move.direction === 'down'));
  }
});

test('the route from Entrance C to the Gym marks staircase B', () => {
  const map = buildCompositeMap(navigate('C', '1509'));
  const main = map.sections.find(section => section.building === 2);
  assert.ok(main.movements.some(move => move.staircase === 'B' && move.direction === 'down'));
  assert.ok(main.stairs.has('B'));
  assert.ok(!main.movements.some(move => move.staircase === 'A'));
});
