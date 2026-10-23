import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStairCues, stairCuePosition, stairIconPath} from '../route-map.js';
import {navigate} from '../routing.js';

test('map stair cues preserve floor changes, skipped floors, and basement floor zero', () => {
  const cues = buildStairCues(['2-0', '2-3'], '0201', '3201');
  assert.equal(cues.length, 2);
  for (const cue of cues) {
    assert.equal(cue.direction, 'up');
    assert.equal(cue.label, '0 → 3');
  }
  assert.equal(buildStairCues(['4-2', '4-0'], '2401', '0401')[0].direction, 'down');
  assert.deepEqual(buildStairCues(['2-2'], '2205', '2206'), []);
  assert.deepEqual(buildStairCues(null, '2205', '2206'), []);
});
test('hallway connecting stairs never get map badges, in either direction', () => {
  for (const [from, to] of [['2-2', '1-2'], ['2-2', '3-1'], ['3-1', '4-1'], ['3-2', '4-2']]) {
    assert.deepEqual(buildStairCues([from, to], '2205', '1401'), []);
    assert.deepEqual(buildStairCues([to, from], '1401', '2205'), []);
  }
  assert.deepEqual(buildStairCues(['3-1', '3-2'], '1301', '2301'), []);
});
test('special stairs appear in movement order and are absent for an already-reached destination', () => {
  const guidance = navigate('2205', '2201');
  const arrival = buildStairCues(guidance.path, '2205', '2201');
  assert.equal(arrival.at(-1).direction, 'down');
  assert.equal(arrival.at(-1).label, 'Guidance');
  const departure = buildStairCues(navigate('2201', '1203').path, '2201', '1203');
  assert.equal(departure[0].direction, 'up');
  assert.equal(departure[1].direction, 'down');
  assert.deepEqual(buildStairCues(['2-2'], '2201', '2201'), []);
  const music = buildStairCues(navigate('N', '1305').path, 'N', '1305');
  assert.deepEqual(music, []);
  assert.deepEqual(buildStairCues(['3-1'], '1305', '1305'), []);
});

test('stair badges follow the chosen side, entrance, and special destination', () => {
  const main = buildStairCues(navigate('2205', '3301').path, '2205', '3301');
  assert.equal(main[0].staircase, 'A');
  assert.equal(main[0].side, 'north');
  assert.deepEqual(stairCuePosition(main[0]), [855, 850]);
  for (const id of ['A', 'B']) {
    const cues = buildStairCues(navigate(id, '1203').path, id, '1203');
    assert.equal(cues[0].staircase, id);
  }
  const guidance = buildStairCues(['2-2'], '2205', '2201');
  assert.equal(guidance[0].staircase, 'B');
  assert.deepEqual(stairCuePosition(guidance[0]), [355, 850]);
  const science = buildStairCues(['4-2', '4-0'], '2412', '0401');
  assert.equal(science[0].staircase, 'J');
  assert.equal(science[0].side, 'east');
  assert.deepEqual(stairCuePosition(science[0]), [903, 450]);
});
test('nearest-stairwell options keep separate end positions without guessing missing anchors', () => {
  const cues = buildStairCues(['2-1', '2-2'], '1203', '2205');
  assert.deepEqual(new Set(cues.map(cue => cue.staircase)), new Set(['A', 'B']));
  assert.notDeepEqual(stairCuePosition(cues[0]), stairCuePosition(cues[1]));
  assert.equal(stairCuePosition({building: 2, side: 'unknown'}), null);
});

test('two stair silhouettes remain horizontal and reverse their reading direction only for south', () => {
  const up = stairIconPath('up', 'north');
  const down = stairIconPath('down', 'north');
  assert.notEqual(up, down);
  for (const side of ['north', 'east', 'west']) {
    assert.equal(stairIconPath('up', side), up);
    assert.equal(stairIconPath('down', side), down);
  }
  assert.equal(stairIconPath('up', 'south'), down);
  assert.equal(stairIconPath('down', 'south'), up);
  assert.equal(new Set(['north', 'south', 'east', 'west'].flatMap(side =>
    ['up', 'down'].map(direction => stairIconPath(direction, side)))).size, 2);
});
