import {test} from 'node:test';
import assert from 'node:assert/strict';
import {school} from '../data.js';

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
