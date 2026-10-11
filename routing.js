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
// Preserve leading zeros while accepting only up to four digits.
export function constrainRoomInput(value) {
  return String(value).replace(/\D/g, '').slice(0, 4);
}
export function roomLabel(number) {
  return school.knownRooms[number] ?? `Room ${number}`;
}
export function parseRoom(value) {
  const number = String(value).trim();
  if (!/^\d{4}$/.test(number)) throw new Error('Please enter a four-digit room number. A leading zero is required for a room on the basement floor.');
  const location = school.roomLocations[number];
  const floor = location?.floor ?? Number(number[0]);
  const building = location?.building ?? Number(number[1]);
  const node = `${building}-${floor}`;
  if (!school.buildings[building] || !graph.has(node)) throw new Error(`Room ${number} has a building or floor absent from the school map.`);
  return {number, floor, building, node};
}

export function floorName(floor) {
  return `${['Ground', '1st', '2nd', '3rd'][floor] ?? `${floor}th`} floor`;
}
export function describeRoom(room) {
  return `${roomLabel(room.number)} — ${school.buildings[room.building]} building, ${floorName(room.floor)}`;
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
export function describePath(path, destination) {
  const steps = [];
  for (let i = 0; i < path.length; i++) {
    const building = Number(path[i].split('-')[0]);
    if (building === 2 && (i === 0 || !path[i - 1].startsWith('2-'))) {
      let exit = i;
      while (exit + 1 < path.length && path[exit + 1].startsWith('2-')) exit++;
      const entrySide = i > 0 ? school.mainStairwellSides[Number(path[i - 1].split('-')[0])] : null;
      const exitSide = exit + 1 < path.length ? school.mainStairwellSides[Number(path[exit + 1].split('-')[0])] : null;
      const side = destination === school.guidanceRoom ? 'south' : exitSide ?? entrySide;
      let instruction = '';
      if (side && entrySide && side !== entrySide) {
        instruction = `Walk all the way through the Main building to the ${side} stairwell on the other side.`;
      } else if (side && !entrySide) {
        instruction = `Head ${side} to the stairwell at the ${side} end of the Main building.`;
      }
      // Keep the stairwell choice next to the first movement it applies to.
      if (instruction) {
        if (i + 1 < path.length) {
          steps.push(`${instruction} ${describeStep(path[i], path[i + 1])}`);
          continue;
        }
        steps.push(instruction);
      }
    }
    if (i + 1 < path.length) steps.push(describeStep(path[i], path[i + 1]));
  }
  return steps;
}
export function navigate(startValue, endValue) {
  const start = parseRoom(startValue);
  const end = parseRoom(endValue);
  const path = findPath(graph, start.node, end.node);
  if (!path) return {path: null, steps: ['No route found. The school map may be missing a connection.']};
  const steps = [describeRoom(start)];
  if (start.number === end.number) steps.push("You're already at the destination.");
  else {
    steps.push(...describePath(path, end.number));
    if (end.number === school.guidanceRoom) steps.push(...school.guidanceInstructions);
    else steps.push(`Walk on the ${floorName(end.floor)} to reach ${describeRoom(end)}.`);
  }
  return {path, steps};
}
