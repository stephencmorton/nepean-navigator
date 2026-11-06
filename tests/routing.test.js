import {test} from 'node:test';
import {school} from '../data.js';
import assert from 'node:assert/strict';
import {buildGraph, graph, parseRoom, findPath, navigate, describeStep, constrainRoomInput, floorName} from '../routing.js';

test('room parsing preserves basement-floor zeros and validates map coverage', () => {
  assert.equal(parseRoom(' 0201 ').node, '2-0');
  for (const value of ['', '20', '22055', 'abcd', '1901', '4201', '<img>', '101', '901']) assert.throws(() => parseRoom(value));
});
test('library to Music/Auditorium and reverse route', () => {
  assert.deepEqual(navigate('2205', '3301').path, ['2-2', '2-3', '3-3']);
  assert.deepEqual(navigate('3301', '2205').path, ['3-3', '2-3', '2-2']);
  assert.match(navigate('2205', '3301').steps[1], /up.*3rd floor/);
});
test('same room, different room on same floor, and guidance half-level', () => {
  assert.match(navigate('2205', '2205').steps[1], /already/);
  assert.match(navigate('2205', '2206').steps[1], /walk to room 2206/);
  for (const start of ['2205', '2301']) assert.match(navigate(start, '2201').steps.at(-1), /half-level/);
});
test('Math/Science connects to Main and missing connections return no path', () => {
  assert.deepEqual(navigate('1401', '2205').path, ['4-1', '5-1', '2-1', '2-2']);
  assert.deepEqual(navigate('2412', '1203').path, ['4-2', '3-2', '2-2', '2-1']);
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

test('room inputs accept only digits and preserve leading zeros', () => {
  for (const [input, expected] of [
    ['22055', '2205'], ['0201', '0201'], [' 02012 ', '0201'],
    ['22a05', '2205'], ['library', ''], ['GUIDANCE', ''], ['1501', '1501'],
  ]) assert.equal(constrainRoomInput(input), expected);
  for (const value of ['library', 'office', 'guidance', 'gym', '501a', '50']) assert.throws(() => parseRoom(value));
});

test('known numbers display names in directions', () => {
  for (const [number, name] of [['2205', 'Library'], ['2202', 'Office'], ['2201', 'Guidance']]) {
    assert.ok(navigate(number, '2206').steps[0].includes(`${name} (room ${number})`));
    const destination = navigate('2206', number).steps.at(-1);
    assert.ok(destination.includes(name));
    assert.ok(!destination.startsWith(`Room ${number}`));
  }
});

test('leaving Main selects the stairwell for the destination building', () => {
  for (const destination of ['1101', '3301', '1401']) {
    const side = destination === '1101' ? 'south' : 'north';
    assert.match(navigate('2205', destination).steps[1], new RegExp(`Head to the ${side} ${['1101', '1401'].includes(destination) ? 'end of the hallway' : 'stairwell'}`));
  }
});

test('passing through Main crosses the building only between opposite sides', () => {
  for (const [start, end, side] of [['1101', '2301', 'north'], ['2301', '1101', 'south'], ['1101', '1401', 'north']]) {
    const steps = navigate(start, end).steps;
    assert.equal(steps.filter(step => step.includes('Walk through')).length, 1);
    assert.ok(steps.some(step => new RegExp(`to the ${side} (stairwell at the other end|end of the hallway)`).test(step)));
  }
  // The new Gym corridor lets a south-side Science-to-Art trip enter Main beside B.
  assert.ok(!navigate('1401', '1101').steps.some(step => step.includes('Walk through')));
  assert.ok(!navigate('1401', '2301').steps.some(step => step.includes('Walk through')));
  assert.ok(!navigate('1401', '1501').steps.some(step => step.includes('Walk through')));
  assert.ok(!navigate('2205', '2206').steps.some(step => step.includes('stairwell')));
});

test('Entrance C to the Gym uses the closer south staircase B', () => {
  const route = navigate('C', '1509');
  assert.ok(route.steps.some(step => /staircase B at the south end/.test(step)));
  assert.ok(!route.steps.some(step => /Walk through the Main building to the north/.test(step)));
});

test('Guidance uses the south stairwell and retains half-level directions', () => {
  assert.match(navigate('2205', '2201').steps[1], /Head to the south stairwell/);
  assert.ok(navigate('2301', '2201').steps.some(step => /Walk through.*south stairwell/.test(step)));
  assert.ok(!navigate('1101', '2201').steps.some(step => /Walk through/.test(step)));
  assert.match(navigate('2301', '2201').steps.at(-1), /half-level/);
});

test('Guidance departures climb to the mapped floor before walking or crossing Main', () => {
  for (const destination of ['2205', '2301', '1101']) {
    const steps = navigate('2201', destination).steps;
    assert.match(steps[0], /half-level below the 2nd floor/);
    assert.match(steps[1], /south "B" stairwell up a half-level.*2nd floor/);
    const crossing = steps.findIndex(step => step.includes('Walk through'));
    if (destination === '2301') assert.ok(crossing > 1);
    else assert.equal(crossing, -1);
  }
  assert.equal(navigate('2201', '2201').steps.length, 2);
});

test('ordinary floor changes in Main use the nearest staircase without choosing a side', () => {
  assert.match(navigate('1203', '2205').steps[1], /nearest staircase.*up.*2nd floor/);
  assert.match(navigate('2205', '1203').steps[1], /nearest staircase.*down.*1st \(ground\) floor/);
  assert.equal(navigate('2205', '2206').steps.length, 2);
  assert.match(navigate('1203', '2205').steps[1], /B at the south.*A at the north/);
});

test('graph construction retains isolated mapped floors and connection nodes', () => {
  const isolated = buildGraph({connections: [{from: '2-0', to: '5-0'}], staircases: {5: {Z: {side: 'west', floors: [1]}}}});
  assert.deepEqual(findPath(isolated, '5-1', '5-1'), ['5-1']);
  assert.equal(findPath(isolated, '2-0', '5-1'), null);
});

test('Gym uses floor 1 and rejects basement input', () => {
  assert.match(navigate('1509', '2205').steps[0], /Gym \(room 1509\)/);
  assert.equal(parseRoom('1501').node, '5-1');
  assert.throws(() => parseRoom('0501'), /floor range/);
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
    assert.match(steps.at(-1), /Continue on this floor to room/);
    assert.equal(steps.join(' ').split(label).length - 1, 1);
    assert.ok(navigate(end, start).steps[0].includes(label));
  }
  assert.equal(parseRoom('201').number, '0201');
  const bothFloors = navigate('0201', '1101').steps.join(' ');
  assert.equal(bothFloors.split('basement (floor 0)').length - 1, 1);
  assert.equal(bothFloors.split('1st (ground) floor').length - 1, 1);
  const sameFloor = navigate('1203', '1204').steps;
  assert.match(sameFloor[0], /1st \(ground\) floor/);
  assert.equal(sameFloor[1], 'Stay on this floor and walk to room 1204.');
});

test('directions use natural location and arrival wording without repeating building details', () => {
  const basement = navigate('0201', '1501').steps;
  assert.equal(basement[0], 'Start at room 0201, in the basement (floor 0) of the Main building.');
  assert.ok(basement.some(step => step.includes('Enter the Gym building on the 1st floor.')));
  assert.equal(basement.at(-1), 'Continue on this floor to room 1501.');
  const library = navigate('1203', '2205').steps;
  assert.equal(library.at(-1), 'Continue on this floor to the Library (room 2205).');
  const guidance = navigate('2205', '2201').steps;
  assert.equal(guidance.at(-1), 'Take the south "B" stairwell down a half-level from the 2nd floor to Guidance (room 2201).');
  assert.equal(navigate('2201', '2205').steps[1], 'Take the south "B" stairwell up a half-level to the 2nd floor.');
});

test('Entrance C to room 0407 names only its two hallway turns', () => {
  const route = navigate('C', '0407');
  const turns = route.steps.filter(step => /Turn (left|right)/.test(step));
  assert.equal(turns.length, 2);
  assert.match(turns[0], /Turn right into the north-south hallway/);
  assert.equal(turns[1], 'Turn left into the hallway.');
  const turnIndex = route.steps.indexOf(turns[1]);
  assert.match(route.steps[turnIndex + 1], /Go up the half-flight of stairs on the right of the hallway and continue/);
  assert.match(route.steps[turnIndex + 2], /go up 3 steps into the Math\/Science building/);
  assert.match(route.steps[turnIndex - 2], /Walk through the Main building to the north end of the hallway/);
  assert.match(route.steps[turnIndex - 1], /go down a half-flight of stairs into the Music\/Auditorium building/);
  assert.doesNotMatch(route.steps.join(' '), /hallway bend/);
  assert.match(describeStep('2-2', '1-2'), /Turn left into the north-south hallway/);
  assert.match(describeStep('1-2', '2-2'), /Turn right into the north-south hallway/);
  assert.doesNotMatch(describeStep('2-2', '3-2'), /Turn (left|right)/);
  const reverse = navigate('2301', '2205').steps;
  const reverseTurn = reverse.findIndex(step => step === 'Turn right into the hallway.');
  assert.match(reverse[reverseTurn + 1], /go up a half-flight of stairs into the Main building/);
});

test('Entrance N to room 2107 follows the hallway landmarks and stair order', () => {
  const route = navigate('N', '2107');
  assert.deepEqual(route.path, ['3-2', '2-2', '1-2']);
  assert.deepEqual(route.steps.slice(1), school.routeInstructions[0].steps);
});

test('0407 to 3110 uses the new Gym corridor when it shortens the route', () => {
  const steps = navigate('0407', '3110').steps.slice(1);
  assert.deepEqual(navigate('0407', '3110').path, ['4-0', '4-1', '5-1', '2-1', '2-3', '1-3']);
  assert.match(steps[1], /Enter the Gym building/);
  assert.match(steps[2], /Enter the Main building/);
  assert.doesNotMatch(steps.join(' '), /hallway bend|as you face/);
});

test('2107 to 2301 turns follow the traveler’s approach and reverse with travel', () => {
  const forward = navigate('2107', '2301');
  assert.deepEqual(forward.path, ['1-2', '2-2', '3-2']);
  assert.equal(forward.steps[1], 'Exit the Art building by walking north along the hallway, following it right around the corner, and going down a half-flight of stairs until you see a long hallway and stairs on your left.');
  assert.match(forward.steps[2], /^Turn left into the north-south hallway/);
  assert.deepEqual(forward.steps.flatMap(step => [...step.matchAll(/Turn (left|right)/g)].map(match => match[1])), ['left', 'right']);
  const reverse = navigate('2301', '2107');
  assert.doesNotMatch(reverse.steps.join(' '), /Exit the Art building/);
  // Reverse the turn order and swap left/right: right becomes left, then left becomes right.
  assert.deepEqual(reverse.steps.flatMap(step => [...step.matchAll(/Turn (left|right)/g)].map(match => match[1])), ['left', 'right']);
});

test('three-digit basement entries normalize before route finding', () => {
  for (const [short, full] of [['201', '0201'], ['202', '0202'], ['401', '0401']]) {
    assert.deepEqual(parseRoom(short), parseRoom(full));
    assert.deepEqual(parseRoom(` ${short} `), parseRoom(full));
    assert.deepEqual(navigate(short, '2205'), navigate(full, '2205'));
    assert.deepEqual(navigate('2205', short), navigate('2205', full));
  }
  assert.match(navigate('201', '0201').steps[1], /already/);
  for (const invalid of ['', '0', '20', '000', '22055', '20a', '-201', '2.01', '501']) assert.throws(() => parseRoom(invalid));
});

test('named staircases connect their own floor lists without inventing shortcuts', () => {
  const map = buildGraph({connections: [], staircases: {4: {
    J: {side: 'west', floors: [0, 1, 3]},
    I: {side: 'east', floors: [1, 2]},
  }}});
  assert.ok(map.get('4-0').has('4-3'));
  assert.ok(!map.get('4-0').has('4-2'));
  assert.deepEqual(findPath(map, '4-0', '4-2'), ['4-0', '4-1', '4-2']);
});
test('directions include labels and sides for staircases serving both floors', () => {
  assert.match(navigate('2205', '3301').steps[1], /staircase A at the north end of the hallway up/);
  assert.match(navigate('3205', '2201').steps[1], /staircase B at the south end of the hallway down/);
  assert.match(navigate('2412', '1401').steps.join(' '), /J at the east/);
});

test('building 3 uses its mapped hallway stairs without detouring through building 4', () => {
  assert.deepEqual(navigate('3105', '2301').path, ['1-3', '2-3', '2-2', '3-2']);
  for (const start of ['3105', '2205']) {
    for (const end of ['1305', '2301', '3301']) {
      assert.ok(!navigate(start, end).path.some(node => node.startsWith('4-')));
    }
  }
  assert.deepEqual(navigate('1501', '1305').path, ['5-1', '4-1', '3-1']);
  assert.deepEqual(navigate('1401', '2301').path, ['4-1', '3-1', '3-2']);
  assert.deepEqual(navigate('2412', '2301').path, ['4-2', '3-2']);
  assert.match(describeStep('3-1', '3-2'), /hallway stairs on the south side up/);
  assert.match(describeStep('3-2', '3-1'), /half-flight of hallway stairs on the south side down/);
  assert.doesNotMatch(describeStep('3-1', '3-2'), /staircase|stairwell/);
  assert.ok(graph.get('3-2').has('2-2'));
});

test('Building 3 connects to Building 4 by three steps from the floor-1 connector', () => {
  assert.match(describeStep('3-1', '4-1'), /go down 3 steps into the Math\/Science building on the 1st/);
  assert.match(describeStep('4-1', '3-1'), /go up 3 steps into the Music\/Auditorium building on the 1st/);
});

test('connecting stairs reverse known directions and preserve unknown directions', () => {
  for (const [from, to] of [['2-2', '1-2'], ['2-3', '1-3'], ['2-2', '3-2'], ['2-3', '3-3']]) {
    const forward = describeStep(from, to), reverse = describeStep(to, from);
    assert.match(forward, /go down a half-flight of stairs into/);
    assert.match(reverse, /go up a half-flight of stairs into/);
    const turn = school.connections.find(link => link.from === from && link.to === to)?.turn;
    if (turn?.afterStairs) {
      assert.doesNotMatch(forward, /Turn (left|right)/);
      assert.doesNotMatch(reverse, /Turn (left|right)/);
    } else if (turn) {
      assert.match(forward, /Turn left/);
      assert.match(reverse, /Turn right/);
    } else {
      assert.match(forward, /^Continue along the hallway and/);
      assert.match(reverse, /^Continue along the hallway and/);
    }
    assert.ok(graph.get(from).has(to));
    assert.ok(graph.get(to).has(from));
  }
  assert.match(describeStep('3-1', '4-1'), /go down 3 steps/);
  assert.match(describeStep('4-1', '3-1'), /go up 3 steps/);
  assert.match(describeStep('3-2', '4-2'), /go up 3 steps/);
  assert.match(describeStep('4-2', '3-2'), /go down 3 steps/);
  const unknown = {
    buildings: {3: {name: 'Music/Auditorium'}, 4: {name: 'Math/Science'}},
    connections: [{from: '3-1', to: '4-1', stairs: {direction: 'unknown'}}],
  };
  for (const [from, to] of [['3-1', '4-1'], ['4-1', '3-1']]) {
    const step = describeStep(from, to, undefined, unknown);
    assert.match(step, /^Continue along the hallway, taking the connecting stairs into/);
    assert.doesNotMatch(step, /up|down/);
  }
});
test('connections without stairs retain ordinary entry wording in either direction', () => {
  assert.equal(describeStep('2-0', '5-1'), 'Enter the Gym building on the 1st (ground) floor.');
  assert.equal(describeStep('5-1', '2-0'), 'Enter the Main building via the basement (floor 0).');
  const map = buildGraph({connections: [{from: '2-1', to: '3-1'}], staircases: {}});
  assert.deepEqual(findPath(map, '2-1', '3-1'), ['2-1', '3-1']);
  assert.deepEqual(findPath(map, '3-1', '2-1'), ['3-1', '2-1']);
});

test('same-floor connections use hallway directions rather than stairwell instructions', () => {
  for (const [start, end] of [['2205', '2301'], ['2301', '2205'], ['2201', '2301'], ['3201', '3301']]) {
    const {steps} = navigate(start, end);
    const walking = start === '2201' ? steps.slice(2) : steps;
    assert.doesNotMatch(walking.join(' '), /stairwell|staircase/);
    assert.match(walking.join(' '), /along the hallway|Turn (left|right)/);
  }
  assert.match(navigate('1203', '2301').steps.join(' '), /north stairwell.*staircase A/);
});

test('room suffix limits are inclusive on every mapped building floor', () => {
  for (const node of graph.keys()) {
    const [building, floor] = node.split('-');
    const {highRoom} = school.buildings[building];
    for (const suffix of [1, highRoom]) {
      const number = `${floor}${building}${String(suffix).padStart(2, '0')}`;
      assert.equal(parseRoom(number).number, number);
    }
    for (const suffix of [0, highRoom + 1]) {
      assert.throws(() => parseRoom(`${floor}${building}${String(suffix).padStart(2, '0')}`), /room number/);
    }
  }
  assert.equal(parseRoom('2307').number, '2307');
  assert.throws(() => parseRoom('2308'), /01 and 07/);
  assert.throws(() => parseRoom('3341'), /room number/);
});
test('floor descriptions reject out-of-range floors without creating unmapped routes', () => {
  for (const number of ['0101', '4201', '4301', '3401', '0501', '2501']) {
    assert.throws(() => parseRoom(number), /floor range/);
  }
  // Building 3 includes floor 0, but no travel links cover it yet.
  for (const number of ['0301']) assert.throws(() => parseRoom(number), /absent from the school map/);
  assert.equal(parseRoom('201').number, '0201');
  assert.equal(parseRoom('2412').number, '2412');
});

test('Music arrivals continue past room 1305 and down the stairs', () => {
  for (const start of ['2205', '1306', '2412']) {
    const {path, steps} = navigate(start, '1305');
    assert.equal(path.at(-1), '3-1');
    assert.match(steps.at(-1), /building 3.*1st floor.*look for room 1305.*down the stairs.*can't possibly be right/);
    assert.doesNotMatch(steps.at(-1), /Stay on this floor|Continue on this floor/);
  }
  assert.match(navigate('1305', '1305').steps.at(-1), /already at the destination/);
  assert.doesNotMatch(navigate('1305', '2205').steps.join(' '), /can't possibly be right/);
});
