import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {school} from '../data.js';
import {entranceArtwork, hallwayPaths} from '../hallway-paths.js';
import {floorPlans, hallwayPath} from '../floor-map.js';

function checkDescription(data) {
  for (const [id, building] of Object.entries(data.buildings)) {
    assert.ok(building.name, `Building ${id} needs a name`);
    assert.ok(Number.isInteger(building.highRoom) && building.highRoom >= 1 && building.highRoom <= 99, `Building ${id} room limit`);
    assert.ok(Number.isInteger(building.lowestFloor) && building.lowestFloor >= 0, `Building ${id} lowest floor`);
    assert.ok(Number.isInteger(building.highestFloor) && building.highestFloor <= 9 && building.highestFloor >= building.lowestFloor, `Building ${id} highest floor`);
  }
  const checkFloor = (id, floor) => {
    const building = data.buildings[id];
    assert.ok(building, `Unknown building ${id}`);
    assert.ok(Number.isInteger(floor) && floor >= building.lowestFloor && floor <= building.highestFloor, `Building ${id} floor ${floor} outside description`);
  };
  for (const {from, to} of data.connections) {
    for (const node of [from, to]) {
      assert.match(node, /^\d-\d$/);
      const [id, floor] = node.split('-').map(Number);
      checkFloor(id, floor);
    }
  }
  for (const [id, staircases] of Object.entries(data.staircases)) {
    assert.ok(data.buildings[id], `Unknown staircase building ${id}`);
    for (const staircase of Object.values(staircases)) {
      for (const floor of staircase.floors) checkFloor(id, floor);
    }
  }
  for (const number of Object.keys(data.knownRooms)) {
    assert.match(number, /^\d{4}$/);
    checkFloor(number[1], Number(number[0]));
    const suffix = Number(number.slice(2));
    assert.ok(suffix >= 1 && suffix <= data.buildings[number[1]].highRoom, `Known room ${number} outside description`);
  }
}

test('school map and named destinations respect building descriptions', () => {
  checkDescription(school);
});
test('hallway geometry, junction turns, and the Gym connection use directional data', () => {
  const map = school.hallwayNetwork;
  assert.equal(map.coordinateSystem.includes('y increases south'), true);
  assert.ok(map.floors['5-1'].paths.length > 1);
  assert.deepEqual(map.floors['5-1'].ports[4], map.floors['4-1'].ports[5]);
  assert.ok(school.connections.some(link => link.from === '5-1' && link.to === '4-1'));
  const artTurn = map.junctions['art-main'].transitions['2-2>1-2'];
  assert.deepEqual([artTurn.incoming, artTurn.outgoing], ['north', 'west']);
  assert.equal(artTurn.direction, undefined);
});
test('all four SVG hallway outlines generate medial-axis centerline networks', () => {
  const source = readFileSync(new URL('../tools/floorplans.svg', import.meta.url), 'utf8');
  const sourceViewBox = source.match(/viewBox="([^"]+)"/)?.[1];
  assert.ok(sourceViewBox);
  assert.equal([...source.matchAll(/<text\b[^>]*style="[^"]*fill:#ffffff/g)].length, 12,
    'The master drawing contains all white entrance lettering');
  assert.deepEqual(Object.keys(hallwayPaths), ['0', '1', '2', '3']);
  for (let floor = 0; floor <= 3; floor++) {
    assert.match(source, new RegExp(`inkscape:label="${floor}_floor"`));
    assert.ok(hallwayPaths[String(floor)].length, `No centerlines generated for floor ${floor}`);
    assert.ok(hallwayPaths[String(floor)].every(line => line.length >= 2));
    const svg = readFileSync(new URL(`../public/floor-${floor}.svg`, import.meta.url), 'utf8');
    assert.match(svg, new RegExp(`viewBox="${sourceViewBox.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.doesNotMatch(svg, /navigator-route-network|data-route-node=/);
    assert.equal([...svg.matchAll(/inkscape:label="[0-3]_floor"/g)].length, 4,
      `Floor ${floor} export retains all source layers`);
    assert.equal([...svg.matchAll(/<text\b[^>]*style="[^"]*fill:#ffffff/g)].length, 12,
      `Floor ${floor} export retains all entrance lettering`);
    assert.equal([...svg.matchAll(/<clipPath\b/g)].length, [...source.matchAll(/<clipPath\b/g)].length,
      `Floor ${floor} export retains the master SVG definitions`);
    assert.match(svg, /sodipodi:role="line"/, 'SVG text metadata is preserved');
  }
  assert.ok(hallwayPaths['1'].some(line => line.some(point => point[0] === 527 && point[1] === 344)),
    'The Gym-to-J corridor centerline follows the blue outline bends');
  assert.equal(entranceArtwork.length, 6, 'All brown badge squares are preserved from floor 1');
  assert.ok(entranceArtwork.some(([x, y]) => Math.abs(x - 204) < 1 && Math.abs(y - 456) < 1),
    'The generated badge list includes the G marker');
  assert.ok(entranceArtwork.every(([x, y]) => x >= 0 && x <= 773 && y >= 0 && y <= 742));
  assert.equal(floorPlans['5-1'].paths, hallwayPaths['1']);
  const gymToJ = hallwayPath(floorPlans['5-1'], [392.5, 325], [548, 300]);
  assert.ok(gymToJ?.some(point => point[0] === 527 && point[1] === 344));
  assert.deepEqual(floorPlans['4-1'].paths, school.hallwayNetwork.floors['4-1'].paths);
  assert.deepEqual(school.hallwayNetwork.floors['2-0'].paths, []);
});
test('description checks catch out-of-range connections and staircase floors', () => {
  for (const change of [
    data => data.connections.push({from: '4-3', to: '2-3'}),
    data => data.connections.push({from: '9-1', to: '2-1'}),
    data => data.staircases[1].E.floors.push(0),
    data => data.staircases[4].J.floors.push(3),
  ]) {
    const data = structuredClone(school);
    change(data);
    assert.throws(() => checkDescription(data));
  }
});
