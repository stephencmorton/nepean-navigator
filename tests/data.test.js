import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {school} from '../data.js';
import {entranceArtwork, floors as geometry} from '../map-geometry.js';
import {floorPlans} from '../floor-map.js';

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
  assert.ok(floorPlans['5-1'].paths.length > 1);
  assert.deepEqual(floorPlans['5-1'].ports[4], floorPlans['4-1'].ports[5]);
  assert.ok(school.connections.some(link => link.from === '5-1' && link.to === '4-1'));
  const musicTurn = map.junctions['main-music'].transitions['2-2>3-2'];
  assert.deepEqual([musicTurn.incoming, musicTurn.outgoing], ['north', 'west']);
  assert.equal(musicTurn.direction, undefined);
});
test('the generated geometry covers every mapped floor, and exports show one floor without editor data', () => {
  const source = readFileSync(new URL('../tools/floorplans.svg', import.meta.url), 'utf8');
  const sourceViewBox = source.match(/viewBox="([^"]+)"/)?.[1];
  assert.ok(sourceViewBox);
  for (const [node, plan] of Object.entries(school.hallwayNetwork.floors)) {
    assert.ok(geometry[node], `No generated geometry for ${node}`);
    // Main's basement hallway is not drawn yet, and the Cafeteria is an open room.
    if (node !== '2-0' && !plan.openArea) assert.ok(geometry[node].paths.length, `No centerlines generated for ${node}`);
    assert.ok(geometry[node].paths.every(line => line.length >= 2));
  }
  const layerTransforms = new Set();
  for (let floor = 0; floor <= 3; floor++) {
    assert.match(source, new RegExp(`inkscape:label="${floor}_floor"`));
    const svg = readFileSync(new URL(`../public/floor-${floor}.svg`, import.meta.url), 'utf8');
    assert.match(svg, new RegExp(`viewBox="${sourceViewBox.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    layerTransforms.add(svg.match(/<g\b[^>]*>/)[0].match(/transform="([^"]*)"/)?.[1]);
    assert.doesNotMatch(svg, /<text\b[^>]*xml:space="preserve"[^>]*>\s+</, `Floor ${floor} export adds no visible spaces to text`);
    assert.doesNotMatch(svg, /inkscape:|sodipodi:/, `Floor ${floor} export has no editor metadata`);
    assert.doesNotMatch(svg, /id="(room-\d{4}|rooms-|approach-)/, `Floor ${floor} export has no data-only markers`);
    for (const other of [0, 1, 2, 3]) {
      const pattern = new RegExp(`id="gstairs-[A-Za-z]+-${other}"`);
      if (other !== floor) assert.doesNotMatch(svg, pattern, `Floor ${floor} export omits floor ${other}`);
    }
    assert.equal([...svg.matchAll(/<clipPath\b/g)].length, [...source.matchAll(/<clipPath\b/g)].length,
      `Floor ${floor} export retains the master SVG definitions`);
  }
  assert.equal(layerTransforms.size, 1, 'All floor exports share one layer position');
  assert.equal(entranceArtwork.length, 6, 'All brown badge squares are preserved from floor 1');
  assert.ok(entranceArtwork.some(([x, y]) => Math.abs(x - 204) < 1 && Math.abs(y - 456) < 1),
    'The generated badge list includes the G marker');
  assert.ok(entranceArtwork.every(([x, y]) => x >= 0 && x <= 773 && y >= 0 && y <= 742));
  assert.equal(floorPlans['5-1'].paths, geometry['5-1'].paths);
  assert.deepEqual(floorPlans['2-0'].paths, []);
  assert.ok(Object.values(school.hallwayNetwork.floors).every(plan => !plan.paths && !plan.stairs && !plan.ports),
    'Generated geometry stays out of the school data');
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
