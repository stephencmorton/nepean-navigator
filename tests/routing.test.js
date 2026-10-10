import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graph, parseRoom, findPath, navigate, constrainRoomInput} from '../routing.js';

test('room parsing preserves ground-floor zeros and validates map coverage', () => {
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
test('gym changes floor across buildings; Math/Science connects to Main', () => {
  assert.deepEqual(navigate('0201', '1501').path, ['2-0', '5-1']);
  assert.match(navigate('0201', '1501').steps[1], /Gym.*1st floor/);
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

test('room names resolve case-insensitively for either end of a route', () => {
  assert.equal(parseRoom(' Library ').number, '2205');
  assert.equal(parseRoom('GUIDANCE').number, '2201');
  assert.equal(parseRoom(' Office ').number, '2204');
  assert.deepEqual(navigate('office', 'library'), navigate('2204', '2205'));
  assert.deepEqual(navigate('library', 'office'), navigate('2205', '2204'));
  assert.deepEqual(navigate('library', '3341'), navigate('2205', '3341'));
  assert.deepEqual(navigate('3341', 'guidance'), navigate('3341', '2201'));
  assert.throws(() => parseRoom('toString'));
  assert.throws(() => parseRoom('unknown room'));
});

test('numeric input is limited to four digits while room names remain editable', () => {
  for (const [input, expected] of [
    ['22055', '2205'], ['0201', '0201'], [' 02012 ', '0201'],
    ['22a05', '2205'], ['2205 3341', '2205'], ['12', '12'],
    ['library', 'library'], ['GUIDANCE', 'GUIDANCE'], ['office', 'office'], ['', ''],
  ]) assert.equal(constrainRoomInput(input), expected);
});

test('room names are recognized inside phrases without guessing between places', () => {
  assert.equal(parseRoom('the LIBRARY please').number, '2205');
  assert.equal(parseRoom('school office').number, '2204');
  assert.equal(parseRoom('Go to Guidance!').number, '2201');
  assert.equal(parseRoom('library (LIBRARY)').number, '2205');
  assert.deepEqual(navigate('from the office', 'to the library'), navigate('2204', '2205'));
  assert.throws(() => parseRoom('office or library'), /just one place/);
});
