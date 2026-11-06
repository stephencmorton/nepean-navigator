import {test} from 'node:test';
import assert from 'node:assert/strict';
import {school} from '../data.js';
import {footprints, floors, entrances, rooms} from '../map-geometry.js';
import {parseRoom} from '../routing.js';

// Staircase floors that data.js lists but floorplans.svg does not draw yet.
// The way down to Main's basement has not been surveyed.
const undrawnStairs = new Set(['2-0 A', '2-0 B']);

test('every staircase floor in data.js is drawn in floorplans.svg', () => {
  for (const [building, staircases] of Object.entries(school.staircases)) {
    for (const [label, staircase] of Object.entries(staircases)) {
      for (const floor of staircase.floors) {
        const node = `${building}-${floor}`;
        if (undrawnStairs.has(`${node} ${label}`)) continue;
        const drawn = staircase.steps ? floors[node]?.steps[staircase.steps] : floors[node]?.stairs[label];
        assert.ok(drawn, `${staircase.steps ? `steps-${staircase.steps}` : `gstairs-${label}`} is missing on ${node}`);
      }
    }
  }
});

test('every stairwell drawn on a mapped floor is listed in data.js for that floor', () => {
  for (const node of Object.keys(school.hallwayNetwork.floors)) {
    const [building, floor] = node.split('-');
    for (const label of Object.keys(floors[node].stairs)) {
      assert.ok(school.staircases[building]?.[label]?.floors.includes(Number(floor)), `gstairs-${label}-${floor} is not in data.js`);
    }
  }
});

test('hallway stairs rise toward the same end on both of their floors', () => {
  for (const [building, staircases] of Object.entries(school.staircases)) {
    for (const staircase of Object.values(staircases)) {
      if (!staircase.steps) continue;
      const [low, high] = staircase.floors.map(floor => floors[`${building}-${floor}`].steps[staircase.steps]);
      assert.deepEqual(low.uphill, high.uphill, `steps-${staircase.steps} rises in different directions on its two floors`);
    }
  }
});

test('every entrance in data.js is drawn on its floor', () => {
  for (const [letter, entrance] of Object.entries(school.entrances)) {
    assert.ok(entrances[letter]?.[entrance.floor], `entrance-${letter.toLowerCase()}-${entrance.floor} is missing`);
  }
});

test('room markers name valid rooms inside or beside their own building', () => {
  for (const [number, [x, y]] of Object.entries(rooms)) {
    const room = parseRoom(number);
    const distance = Math.min(...footprints[room.building].map(([x0, y0, x1, y1]) =>
      Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1))));
    assert.ok(distance < 20, `room-${number} is ${distance.toFixed(0)} units from building ${room.building}`);
  }
});
