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
// Validate the encoded building and floor while retaining the original room digits.
export function parseRoom(value) {
  const number = String(value).trim();
  if (!/^\d{4}$/.test(number)) throw new Error('Please enter a four-digit room number. A leading zero is required for a room on the basement (floor 0).');
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
// Describe a room's mapped location while honouring special levels such as Guidance.
export function describeRoom(room) {
  const level = school.knownRooms[room.number]?.level ?? floorName(room.floor);
  return `${roomLabel(room.number)} — ${school.buildings[room.building]} building, ${level}`;
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
  if (building !== nextBuilding) return `Change building to ${school.buildings[nextBuilding]}, ${floorName(nextFloor)}.`;
  return `Go ${nextFloor > floor ? 'up' : 'down'} the stairs to the ${floorName(nextFloor)}.`;
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
        instruction = `Walk all the way through the Main building to the ${side} stairwell on the other side.`;
      } else if (side && !entrySide) {
        instruction = `Head ${side} to the stairwell at the ${side} end of the Main building.`;
      } else if (!side && exit > i) {
        instruction = 'Go to the closest stairwell.';
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
  const steps = [describeRoom(start)];
  if (start.number === end.number) steps.push("You're already at the destination.");
  else {
    const departure = school.knownRooms[start.number]?.departure;
    if (departure) steps.push(departure);
    steps.push(...describePath(path, start, end));
    steps.push(school.knownRooms[end.number]?.arrival ?? `Walk on the ${floorName(end.floor)} to reach ${describeRoom(end)}.`);
  }
  // Explain floor-number conventions once per route, then shorten repeated mentions.
  const explainedFloors = new Set();
  return {path, steps: steps.map(step => step.replace(/basement \(floor 0\)|1st \(ground\) floor/g, label => {
    if (explainedFloors.has(label)) return label === 'basement (floor 0)' ? 'basement' : '1st floor';
    explainedFloors.add(label);
    return label;
  }))};
}
