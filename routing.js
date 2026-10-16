// Map graph construction, room validation, and route instructions independent of the browser UI.
import {school} from './data.js';

// Expand building links and staircases into a bidirectional graph of mapped floors.
export function buildGraph(data = school) {
  const graph = new Map();
  // Retain both endpoints and allow travel in either direction.
  const link = (a, b) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a).add(b);
    graph.get(b).add(a);
  };
  for (const [node, neighbors] of Object.entries(data.connections)) {
    if (!graph.has(node)) graph.set(node, new Set());
    for (const neighbor of neighbors) link(node, neighbor);
  }
  for (const [building, floors] of Object.entries(data.staircases)) {
    for (const floor of floors) {
      const node = `${building}-${floor}`;
      if (!graph.has(node)) graph.set(node, new Set());
    }
    // A stairwell can connect any two listed floors in one instruction.
    for (let i = 0; i < floors.length; i++) {
      for (let j = i + 1; j < floors.length; j++) link(`${building}-${floors[i]}`, `${building}-${floors[j]}`);
    }
  }
  return graph;
}

// Room input and labels share the same map coverage used by route finding.
export const graph = buildGraph();
// Preserve leading zeros while accepting only up to four digits.
export function constrainRoomInput(value) {
  return String(value).replace(/\D/g, '').slice(0, 4);
}
// Prefer a known destination name over the generic room-number label.
export function roomLabel(number) {
  return school.knownRooms[number]?.name ?? `Room ${number}`;
}
// Normalize three-digit basement entries before validating the encoded building and floor.
export function parseRoom(value) {
  const input = String(value).trim();
  if (!/^\d{3,4}$/.test(input)) throw new Error('Please enter a three- or four-digit room number. Three-digit numbers are treated as basement rooms (floor 0).');
  const number = input.padStart(4, '0');
  const floor = Number(number[0]);
  const building = Number(number[1]);
  const node = `${building}-${floor}`;
  if (!school.buildings[building] || !graph.has(node)) throw new Error(`Room ${number} has a building or floor absent from the school map.`);
  return {number, floor, building, node};
}

// Explain basement and ground-floor numbering in labels shown to users.
export function floorName(floor) {
  return ['basement (floor 0)', '1st (ground) floor', '2nd floor', '3rd floor'][floor] ?? `${floor}th floor`;
}
// Identify named destinations in prose without losing the room number used to find them.
function directionRoomLabel(room) {
  const name = school.knownRooms[room.number]?.name;
  if (!name) return `room ${room.number}`;
  return `${name === 'Guidance' ? name : `the ${name}`} (room ${room.number})`;
}
// Describe the starting location, including basement grammar and special half-levels.
export function describeRoom(room) {
  const specialLevel = school.knownRooms[room.number]?.level;
  const location = specialLevel ? `a ${specialLevel}` : `${room.floor === 0 ? 'in' : 'on'} the ${floorName(room.floor)}`;
  return `${directionRoomLabel(room)}, ${location} of the ${school.buildings[room.building]} building`;
}
// Use breadth-first search to find a route with the fewest graph edges, or return null.
export function findPath(map, start, end) {
  if (!map.has(start) || !map.has(end)) return null;
  const queue = [start];
  const parents = new Map([[start, null]]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node === end) {
      const path = [];
      for (let cursor = end; cursor !== null; cursor = parents.get(cursor)) path.push(cursor);
      return path.reverse();
    }
    for (const neighbor of map.get(node)) {
      if (!parents.has(neighbor)) { parents.set(neighbor, node); queue.push(neighbor); }
    }
  }
  return null;
}
// Translate a graph edge into either a building change or a stair instruction.
export function describeStep(from, to) {
  const [building, floor] = from.split('-').map(Number);
  const [nextBuilding, nextFloor] = to.split('-').map(Number);
  if (building !== nextBuilding) return `Enter the ${school.buildings[nextBuilding]} building ${nextFloor === 0 ? 'via' : 'on'} the ${floorName(nextFloor)}.`;
  return `Take the stairs ${nextFloor > floor ? 'up' : 'down'} to the ${floorName(nextFloor)}.`;
}
// Add Main-building stairwell choices and crossings to the graph's movement steps.
function describePath(path, start, end) {
  const steps = [];
  // Decode the building portion of a graph node for stairwell selection.
  const buildingOf = node => Number(node.split('-')[0]);
  for (let i = 0; i < path.length; i++) {
    let instruction = '';
    if (buildingOf(path[i]) === 2 && (i === 0 || buildingOf(path[i - 1]) !== 2)) {
      // Inspect the full visit to Main to choose the side needed on departure.
      let exit = i;
      while (exit + 1 < path.length && buildingOf(path[exit + 1]) === 2) exit++;
      const entrySide = i === 0
        ? school.knownRooms[start.number]?.stairwellSide
        : school.mainStairwellSides[buildingOf(path[i - 1])];
      const exitSide = exit + 1 < path.length
        ? school.mainStairwellSides[buildingOf(path[exit + 1])]
        : school.knownRooms[end.number]?.stairwellSide;
      const side = exitSide ?? entrySide;
      if (side && entrySide && side !== entrySide) {
        instruction = `Walk through the Main building to the ${side} stairwell at the other end.`;
      } else if (side && !entrySide) {
        instruction = `Head to the ${side} stairwell in the Main building.`;
      } else if (!side && exit > i) {
        instruction = 'Go to the nearest stairwell.';
      }
    }
    const movement = i + 1 < path.length ? describeStep(path[i], path[i + 1]) : '';
    if (instruction || movement) steps.push(instruction && movement ? `${instruction} ${movement}` : instruction || movement);
  }
  return steps;
}
// Assemble a route with room descriptions and special arrival/departure instructions.
export function navigate(startValue, endValue) {
  const start = parseRoom(startValue);
  const end = parseRoom(endValue);
  const path = findPath(graph, start.node, end.node);
  if (!path) return {path: null, steps: ['No route found. The school map may be missing a connection.']};
  const steps = [`Start at ${describeRoom(start)}.`];
  if (start.number === end.number) steps.push("You're already at the destination.");
  else {
    const departure = school.knownRooms[start.number]?.departure;
    if (departure) steps.push(departure);
    steps.push(...describePath(path, start, end));
    const arrival = path.length === 1 ? 'Stay on this floor and walk to' : 'Continue on this floor to';
    steps.push(school.knownRooms[end.number]?.arrival ?? `${arrival} ${directionRoomLabel(end)}.`);
  }
  // Explain floor-number conventions once per route, then shorten repeated mentions.
  const explainedFloors = new Set();
  return {path, steps: steps.map(step => step.replace(/basement \(floor 0\)|1st \(ground\) floor/g, label => {
    if (explainedFloors.has(label)) return label === 'basement (floor 0)' ? 'basement' : '1st floor';
    explainedFloors.add(label);
    return label;
  }))};
}
