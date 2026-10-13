// Routing regressions for room parsing, graph reachability, and school-specific directions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, graph, parseRoom, findPath, navigate, constrainRoomInput, roomLabel, floorName} from '../routing.js';

// Core map coverage, route selection, and special-level handling.
test('room parsing preserves basement-floor zeros and validates map coverage', () => {
  assert.equal(parseRoom(' 0201 ').node, '2-0');
  for (const value of ['', '201', '22055', 'abcd', '1901', '4201', '<img>']) assert.throws(() => parseRoom(value));
});
test('library to Music/Auditorium and reverse route', () => {
  assert.deepEqual(navigate('2205', '3341').path, ['2-2', '2-3', '3-3']);
  assert.deepEqual(navigate('3341', '2205').path, ['3-3', '2-3', '2-2']);
  assert.match(navigate('2205', '3341').steps[1], /up.*3rd floor/);
});
test('same room, different room on same floor, and guidance half-level', () => {
  assert.match(navigate('2205', '2205').steps[1], /already/);
  assert.match(navigate('2205', '2206').steps[1], /Walk.*2206/);
  for (const start of ['2205', '3341']) assert.match(navigate(start, '2201').steps.at(-1), /half-level/);
});
test('Math/Science connects to Main and missing connections return no path', () => {
  assert.deepEqual(navigate('1401', '2205').path, ['4-1', '2-1', '2-2']);
  assert.deepEqual(navigate('2412', '1203').path, ['4-2', '4-1', '2-1']);
  const disconnected = new Map([['4-1', new Set()], ['2-1', new Set()]]);
  assert.equal(findPath(disconnected, '4-1', '2-1'), null);
  assert.equal(findPath(graph, '9-9', '9-9'), null);
});
test('all graph routes use symmetric edges and have shortest length', () => {
  for (const [start, neighbors] of graph) {
    for (const end of neighbors) assert.ok(graph.get(end).has(start));
    const distances = new Map([[start, 0]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const next of graph.get(queue[i])) if (!distances.has(next)) {
        distances.set(next, distances.get(queue[i]) + 1); queue.push(next);
      }
    }
    for (const end of graph.keys()) {
      const path = findPath(graph, start, end);
      if (!distances.has(end)) assert.equal(path, null);
      else {
        assert.equal(path.length - 1, distances.get(end));
        for (let i = 1; i < path.length; i++) assert.ok(graph.get(path[i - 1]).has(path[i]));
      }
    }
  }
});

// Input sanitization and human-readable destination labels.
test('room inputs accept only digits and preserve leading zeros', () => {
  for (const [input, expected] of [
    ['22055', '2205'], ['0201', '0201'], [' 02012 ', '0201'],
    ['22a05', '2205'], ['library', ''], ['GUIDANCE', ''], ['0501', '0501'],
  ]) assert.equal(constrainRoomInput(input), expected);
  for (const value of ['library', 'office', 'guidance', 'gym', '501a', '501', '502']) assert.throws(() => parseRoom(value));
});

test('known numbers display names in directions', () => {
  for (const [number, name] of [['2205', 'Library'], ['2204', 'Office'], ['2201', 'Guidance']]) {
    assert.ok(navigate(number, '2206').steps[0].startsWith(name));
    const destination = navigate('2206', number).steps.at(-1);
    assert.ok(destination.includes(name));
    assert.ok(!destination.startsWith(`Room ${number}`));
  }
});

// Stairwell choices depend on entry/exit sides and Guidance's half-level.
test('leaving Main selects the stairwell for the destination building', () => {
  for (const destination of ['1101', '3341', '1401', '0501']) {
    const side = destination === '1101' ? 'south' : 'north';
    assert.match(navigate('2205', destination).steps[1], new RegExp(`Head ${side}.*${side} end`));
  }
});

test('passing through Main crosses the building only between opposite sides', () => {
  for (const northRoom of ['3341', '1401', '0501']) {
    for (const [start, end, side] of [['1101', northRoom, 'north'], [northRoom, '1101', 'south']]) {
      const steps = navigate(start, end).steps;
      assert.equal(steps.filter(step => step.includes('Walk all the way through')).length, 1);
      assert.ok(steps.some(step => step.includes(`to the ${side} stairwell on the other side`)));
    }
  }
  assert.ok(!navigate('1401', '3341').steps.some(step => step.includes('Walk all the way through')));
  assert.ok(!navigate('1401', '0501').steps.some(step => step.includes('Walk all the way through')));
  assert.ok(!navigate('2205', '2206').steps.some(step => step.includes('stairwell')));
});

test('Guidance uses the south stairwell and retains half-level directions', () => {
  assert.match(navigate('2205', '2201').steps[1], /Head south/);
  assert.ok(navigate('3341', '2201').steps.some(step => /Walk all the way through.*south stairwell/.test(step)));
  assert.ok(!navigate('1101', '2201').steps.some(step => /Walk all the way through/.test(step)));
  assert.match(navigate('3341', '2201').steps.at(-1), /half-level/);
});

test('Guidance departures climb to the mapped floor before walking or crossing Main', () => {
  for (const destination of ['2205', '3341', '1101']) {
    const steps = navigate('2201', destination).steps;
    assert.match(steps[0], /half-level below the 2nd floor/);
    assert.match(steps[1], /up a half-level.*south stairwell.*2nd floor/);
    const crossing = steps.findIndex(step => step.includes('Walk all the way through'));
    if (destination === '3341') assert.ok(crossing > 1);
    else assert.equal(crossing, -1);
  }
  assert.equal(navigate('2201', '2201').steps.length, 2);
});

test('ordinary floor changes in Main use the closest stairwell without choosing a side', () => {
  assert.match(navigate('1203', '2205').steps[1], /closest stairwell.*up.*2nd floor/);
  assert.match(navigate('2205', '1203').steps[1], /closest stairwell.*down.*1st \(ground\) floor/);
  assert.equal(navigate('2205', '2206').steps.length, 2);
  assert.ok(!navigate('1203', '2205').steps[1].match(/north|south/));
});

// Map edge cases and consistent floor-number explanations.
test('graph construction retains isolated mapped floors and connection nodes', () => {
  const isolated = buildGraph({connections: {'2-0': []}, staircases: {5: [1]}});
  assert.deepEqual(findPath(isolated, '5-1', '5-1'), ['5-1']);
  assert.equal(findPath(isolated, '2-0', '5-1'), null);
});

test('Gym 0501 uses its encoded basement floor and requires map coverage', () => {
  assert.equal(roomLabel('0501'), 'Gym');
  if (graph.has('5-0')) {
    const gym = parseRoom('0501');
    assert.equal(gym.node, '5-0');
    assert.equal(gym.floor, 0);
    assert.equal(gym.building, 5);
  } else {
    assert.throws(() => parseRoom('0501'), /Room 0501.*absent from the school map/);
  }
});

test('floor labels explain basement and ground floor only on their first mention per route', () => {
  assert.equal(floorName(0), 'basement (floor 0)');
  assert.equal(floorName(1), '1st (ground) floor');
  assert.equal(floorName(2), '2nd floor');
  for (const [start, end, label] of [
    ['2205', '0201', 'basement (floor 0)'],
    ['0201', '1203', '1st (ground) floor'],
  ]) {
    const steps = navigate(start, end).steps;
    assert.ok(steps[1].includes(label));
    assert.ok(!steps.at(-1).includes(label));
    assert.ok(steps.at(-1).includes(label === 'basement (floor 0)' ? 'basement' : '1st floor'));
    assert.equal(steps.join(' ').split(label).length - 1, 1);
    assert.ok(navigate(end, start).steps[0].includes(label));
  }
  assert.throws(() => parseRoom('201'), /basement \(floor 0\)/);
  const bothFloors = navigate('0201', '1101').steps.join(' ');
  assert.equal(bothFloors.split('basement (floor 0)').length - 1, 1);
  assert.equal(bothFloors.split('1st (ground) floor').length - 1, 1);
  const sameFloor = navigate('1203', '1204').steps;
  assert.match(sameFloor[0], /1st \(ground\) floor/);
  assert.equal(sameFloor[1], 'Walk on the 1st floor to reach Room 1204 — Main building, 1st floor.');
});
