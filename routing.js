import {school} from './data.js';

export function buildGraph(data = school) {
  const graph = new Map();
  const link = (a, b) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a).add(b);
    graph.get(b).add(a);
  };
  for (const [node, neighbors] of Object.entries(data.connections)) {
    for (const neighbor of neighbors) link(node, neighbor);
  }
  for (const [building, floors] of Object.entries(data.staircases)) {
    for (let i = 0; i < floors.length; i++) {
      for (let j = i + 1; j < floors.length; j++) link(`${building}-${floors[i]}`, `${building}-${floors[j]}`);
    }
  }
  return graph;
}

export const graph = buildGraph();
export function parseRoom(value) {
  const number = String(value).trim();
  if (!/^\d{4}$/.test(number)) throw new Error('Please enter four-digit room numbers (e.g. 2205 or 3341).');
  const floor = Number(number[0]);
  const building = Number(number[1]);
  const node = `${building}-${floor}`;
  if (!school.buildings[building] || !graph.has(node)) throw new Error(`Room ${number} has a building or floor absent from the school map.`);
  return {number, floor, building, node};
}

export function floorName(floor) {
  return `${['Ground', '1st', '2nd', '3rd'][floor] ?? `${floor}th`} floor`;
}
export function describeRoom(room) {
  return `Room ${room.number} — ${school.buildings[room.building]} building, ${floorName(room.floor)}`;
}
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
export function describeStep(from, to) {
  const [building, floor] = from.split('-').map(Number);
  const [nextBuilding, nextFloor] = to.split('-').map(Number);
  if (building !== nextBuilding) return `Change building to ${school.buildings[nextBuilding]} (${nextBuilding}), ${floorName(nextFloor)}.`;
  return `Go ${nextFloor > floor ? 'up' : 'down'} the stairs to the ${floorName(nextFloor)}.`;
}
export function navigate(startValue, endValue) {
  const start = parseRoom(startValue);
  const end = parseRoom(endValue);
  const path = findPath(graph, start.node, end.node);
  if (!path) return {path: null, steps: ['No route found. The school map may be missing a connection.']};
  const steps = [describeRoom(start)];
  if (start.number === end.number) steps.push("You're already at the destination.");
  else if (end.number === school.guidanceRoom) steps.push(...school.guidanceInstructions);
  else {
    for (let i = 1; i < path.length; i++) steps.push(describeStep(path[i - 1], path[i]));
    steps.push(`Walk on the ${floorName(end.floor)} to reach ${describeRoom(end)}.`);
  }
  return {path, steps};
}
