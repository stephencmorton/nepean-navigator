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
  for (const {from, to} of data.connections) link(from, to);
  for (const [building, staircases] of Object.entries(data.staircases)) {
    for (const {floors} of Object.values(staircases)) {
      for (const floor of floors) {
        const node = `${building}-${floor}`;
        if (!graph.has(node)) graph.set(node, new Set());
      }
      // A stairwell can connect any two listed floors in one instruction.
      for (let i = 0; i < floors.length; i++) {
        for (let j = i + 1; j < floors.length; j++) link(`${building}-${floors[i]}`, `${building}-${floors[j]}`);
      }
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
  if (!school.buildings[building]) throw new Error(`Room ${number} has a building or floor absent from the school map.`);
  const description = school.buildings[building];
  const room = Number(number.slice(2));
  if (floor < description.lowestFloor || floor > description.highestFloor) {
    throw new Error(`Room ${number} is outside the floor range for the ${description.name} building (${description.lowestFloor}–${description.highestFloor}).`);
  }
  if (room < 1 || room > description.highRoom) {
    throw new Error(`Room ${number} must have last 2 digits of room number between 01 and ${String(description.highRoom).padStart(2, '0')} in the ${description.name} building.`);
  }
  if (!graph.has(node)) throw new Error(`Room ${number} has a building or floor absent from the school map.`);
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
  return `${directionRoomLabel(room)}, ${location} of the ${school.buildings[room.building].name} building`;
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
export function describeStep(from, to, side, data = school) {
  const [building, floor] = from.split('-').map(Number);
  const [nextBuilding, nextFloor] = to.split('-').map(Number);
  if (building !== nextBuilding) {
    const connection = data.connections.find(link =>
      (link.from === from && link.to === to) || (link.from === to && link.to === from));
    const stairs = connection?.stairs;
    let movement = 'Enter';
    if (stairs) {
      const direction = connection.from === from ? stairs.direction
        : ({up: 'down', down: 'up'}[stairs.direction] ?? stairs.direction);
      const stairLabel = stairs.extent === 'half-flight' ? 'a half-flight of stairs'
        : stairs.extent || 'the connecting stairs';
      movement = direction === 'up' || direction === 'down'
        ? `Continue along the hallway and go ${direction} ${stairLabel} into`
        : `Continue along the hallway, taking ${stairLabel} into`;
    }
    return `${movement} the ${data.buildings[nextBuilding].name} building ${nextFloor === 0 ? 'via' : 'on'} the ${floorName(nextFloor)}.`;
  }
  const options = Object.entries(data.staircases[building] ?? {})
    .filter(([, stairs]) => stairs.floors.includes(floor) && stairs.floors.includes(nextFloor));
  const preferred = options.filter(([, stairs]) => stairs.side === side);
  const choices = preferred.length ? preferred : options;
  const labels = choices.map(([label, stairs]) => `${label} at the ${stairs.side} end of the hallway`);
  const stairs = labels.length === 1 ? `staircase ${labels[0]}` : `nearest staircase (${labels.join('; or ')})`;
  return `Take the ${stairs} ${nextFloor > floor ? 'up' : 'down'} to the ${floorName(nextFloor)}.`;
}
// Add Main-building stairwell choices and crossings to the graph's movement steps.
function describePath(path, start, end) {
  const steps = [];
  // Decode the building portion of a graph node for stairwell selection.
  const buildingOf = node => Number(node.split('-')[0]);
  let stairwellSide;
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
      stairwellSide = side;
      // Connecting steps stay in the hallway; only a floor change or Guidance needs a stairwell.
      const needsStairwell = exit > i || (exit === path.length - 1 &&
        Boolean(school.knownRooms[end.number]?.stairwellSide));
      if (side && entrySide && side !== entrySide) {
        instruction = needsStairwell
          ? `Walk through the Main building to the ${side} stairwell at the other end.`
          : `Walk through the Main building to the ${side} end of the hallway.`;
      } else if (side && !entrySide) {
        instruction = needsStairwell
          ? `Head to the ${side} stairwell in the Main building.`
          : `Head to the ${side} end of the hallway in the Main building.`;
      }
    }
    const movement = i + 1 < path.length ? describeStep(path[i], path[i + 1], buildingOf(path[i]) === 2 ? stairwellSide : undefined) : '';
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
