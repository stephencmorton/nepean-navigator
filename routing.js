// Map graph construction, room validation, and route instructions independent of the browser UI.
import {school} from './data.js';

export function buildGraph(data = school) {
  const graph = new Map();
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

export const graph = buildGraph();
export function constrainRoomInput(value) {
  return String(value).replace(/\D/g, '').slice(0, 4);
}
export function parseRoom(value) {
  const input = String(value).trim();
  if (!/^\d{3,4}$/.test(input)) throw new Error('Please enter a three- or four-digit room number. Three-digit numbers are treated as basement rooms (floor 0).');
  const number = input.padStart(4, '0');
  const floor = Number(number[0]);
  const building = Number(number[1]);
  const node = `${building}-${floor}`;
  const description = school.buildings[building];
  if (!description) throw new Error(`Room ${number} has a building or floor absent from the school map.`);
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

// Entrances are accepted only as starts; destination validation remains room-only.
export function parseStart(value) {
  const entrance = String(value).trim().toUpperCase();
  if (!/^[A-Z]$/.test(entrance)) return parseRoom(value);
  const location = school.entrances[entrance];
  if (!location) throw new Error(`Entrance ${entrance} is not on the school map.`);
  const {building, floor, doorFloor, side, staircase, approachStairs, approachInstruction} = location;
  const node = `${building}-${floor}`;
  if (!graph.has(node)) throw new Error(`Entrance ${entrance} has a building or floor absent from the school map.`);
  return {entrance, building, floor, doorFloor, side, staircase, approachStairs, approachInstruction, node,
    stairwellSide: school.staircases[building]?.[staircase]?.side};
}

export function floorName(floor) {
  return ['basement (floor 0)', '1st (ground) floor', '2nd floor', '3rd floor'][floor] ?? `${floor}th floor`;
}
function connectionBetween(from, to, data) {
  return data.connections.find(link =>
    (link.from === from && link.to === to) || (link.from === to && link.to === from));
}
function directionsData(path, start, end) {
  const rule = school.routeTurnDirections?.find(item => {
    const forward = item.fromRoom === start.number && item.toRoom === end.number;
    const backward = item.toRoom === start.number && item.fromRoom === end.number;
    const expected = forward ? item.path : backward ? [...item.path].reverse() : [];
    return expected.length === path.length && expected.every((node, index) => node === path[index]);
  });
  if (!rule) return school;
  const connections = school.connections.map(connection => {
    const index = rule.path.findIndex((node, i) => i + 1 < rule.path.length &&
      ((node === connection.from && rule.path[i + 1] === connection.to) ||
        (node === connection.to && rule.path[i + 1] === connection.from)));
    if (index < 0 || !connection.turn || !rule.turns[index]) return connection;
    const model = rule.turns[index];
    const turnModel = connection.from === rule.path[index] ? model
      : {incoming: model.outgoing, outgoing: model.incoming};
    const turn = typeof connection.turn === 'object' ? connection.turn : {};
    return {...connection, turn: {...turn, incoming: turnModel.incoming, outgoing: turnModel.outgoing}};
  });
  return {...school, connections, routeDeparture: rule.fromRoom === start.number ? rule.departure : undefined};
}
const compassVector = {north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0]};
function turnFromVectors(incoming, outgoing) {
  const a = compassVector[incoming], b = compassVector[outgoing];
  if (!a || !b) return undefined;
  const cross = a[0] * b[1] - a[1] * b[0];
  const dot = a[0] * b[0] + a[1] * b[1];
  if (Math.abs(cross) < 1e-9) return dot < 0 ? 'reverse' : 'straight';
  return cross > 0 ? 'right' : 'left';
}
function connectionTurnDirection(connection, from, data = school) {
  const turn = connection?.turn;
  if (!turn) return '';
  if (typeof turn === 'string') return turn;
  const transition = turn.incoming && turn.outgoing ? turn
    : data.hallwayNetwork?.junctions?.[turn.junction]?.transitions?.[`${connection.from}>${connection.to}`];
  if (!transition) return turn.direction;
  const forward = connection.from === from;
  return turnFromVectors(forward ? transition.incoming : transition.outgoing,
    forward ? transition.outgoing : transition.incoming) ?? turn.direction;
}
function connectionTurnInstruction(connection, from, data) {
  if (!connection?.turn) return '';
  const direction = connectionTurnDirection(connection, from, data);
  const [nextBuilding] = connection.from === from ? connection.to.split('-').map(Number)
    : connection.from.split('-').map(Number);
  const hallway = connection.turn.hallway ?? `${data.buildings[nextBuilding].name} hallway`;
  return `Turn ${direction} into the ${hallway}.`;
}
function describeInFloorStairs(path, index, data = school) {
  const node = path[index];
  const previous = path[index - 1], next = path[index + 1];
  if (!previous || !next) return '';
  const stairs = data.inFloorStairs?.find(item => item.node === node && item.between?.length === 2 &&
    ((item.between[0] === previous && item.between[1] === next) ||
      (item.between[1] === previous && item.between[0] === next)));
  if (!stairs) return '';
  const forward = stairs.between[0] === previous;
  const direction = forward ? stairs.direction : ({up: 'down', down: 'up'}[stairs.direction] ?? stairs.direction);
  const facing = forward ? stairs.whenFacing : ({north: 'south', south: 'north', east: 'west', west: 'east'}[stairs.whenFacing] ?? stairs.whenFacing);
  const rightOf = {north: 'east', east: 'south', south: 'west', west: 'north'}[facing];
  const leftOf = {north: 'west', west: 'south', south: 'east', east: 'north'}[facing];
  const side = stairs.position === rightOf ? 'right' : stairs.position === leftOf ? 'left' : stairs.position;
  const extent = stairs.extent === 'half-flight' ? 'half-flight' : stairs.extent ?? 'stairs';
  return `Go ${direction} the ${extent} of stairs on the ${side} of the hallway and continue.`;
}
function directionRoomLabel(room) {
  const name = school.knownRooms[room.number]?.name;
  if (!name) return `room ${room.number}`;
  return `${name === 'Guidance' ? name : `the ${name}`} (room ${room.number})`;
}
function describeRoom(room) {
  if (room.entrance) return `Entrance ${room.entrance}, on the ${floorName(room.doorFloor ?? room.floor)} of the ${school.buildings[room.building].name} building`;
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
export function describeStep(from, to, side, data = school) {
  const [building, floor] = from.split('-').map(Number);
  const [nextBuilding, nextFloor] = to.split('-').map(Number);
  if (building !== nextBuilding) {
    const connection = connectionBetween(from, to, data);
    const stairs = connection?.stairs;
    const turn = connection?.turn;
    const separateTurn = typeof turn?.afterStairs === 'boolean';
    const turnDirection = connectionTurnDirection(connection, from, data);
    const hallwayName = typeof turn === 'object' && turn.hallway ? turn.hallway
      : `${data.buildings[nextBuilding].name} hallway`;
    let movement = 'Enter';
    if (stairs) {
      const direction = connection.from === from ? stairs.direction
        : ({up: 'down', down: 'up'}[stairs.direction] ?? stairs.direction);
      const stairLabel = stairs.extent === 'half-flight' ? 'a half-flight of stairs'
        : stairs.extent || 'the connecting stairs';
      const lead = turn && !separateTurn ? `Turn ${turnDirection} into the ${hallwayName} and`
        : direction === 'up' || direction === 'down' ? 'Continue along the hallway and' : null;
      movement = direction === 'up' || direction === 'down'
        ? `${lead} go ${direction} ${stairLabel} into`
        : turn && !separateTurn ? `${lead} take ${stairLabel} into`
          : `Continue along the hallway, taking ${stairLabel} into`;
    }
    if (!stairs && turn && !separateTurn) movement = `Turn ${turnDirection} into the ${hallwayName} and continue into`;
    return `${movement} the ${data.buildings[nextBuilding].name} building ${nextFloor === 0 ? 'via' : 'on'} the ${floorName(nextFloor)}.`;
  }
  const choices = staircaseChoices(building, floor, nextFloor, side, data);
  const direction = nextFloor > floor ? 'up' : 'down';
  if (choices.length && choices.every(([, stairs]) => stairs.kind === 'hallway')) {
    const stairs = choices[0][1];
    const extent = stairs.extent === 'half-flight' ? 'half-flight of ' : stairs.extent ? `${stairs.extent} of ` : '';
    const position = stairs.position ? ` on the ${stairs.position} side` : '';
    return `Follow the ${extent}hallway stairs${position} ${direction} to the ${floorName(nextFloor)}.`;
  }
  if (choices.some(([, stairs]) => stairs.kind === 'hallway')) {
    const alternatives = choices.map(([label, stairs]) =>
      `${stairs.kind === 'hallway' ? 'hallway stairs' : `staircase ${label}`} at the ${stairs.side} end of the hallway`);
    return `Take the nearest stairs (${alternatives.join('; or ')}) ${direction} to the ${floorName(nextFloor)}.`;
  }
  const labels = choices.map(([label, stairs]) => `${label} at the ${stairs.side} end of the hallway`);
  const stairs = labels.length === 1 ? `staircase ${labels[0]}` : `nearest staircase (${labels.join('; or ')})`;
  return `Take the ${stairs} ${direction} to the ${floorName(nextFloor)}.`;
}
export function staircaseChoices(building, floor, nextFloor, side, data = school) {
  const options = Object.entries(data.staircases[building] ?? {})
    .filter(([, stairs]) => stairs.floors.includes(floor) && stairs.floors.includes(nextFloor));
  const preferred = options.filter(([, stairs]) => stairs.side === side);
  return preferred.length ? preferred : options;
}
// Inspect a whole visit to Main, including its entry and departure sides.
export function mainStairwellVisit(path, index, start, end, data = school) {
  const buildingOf = node => Number(node.split('-')[0]);
  let entry = index;
  while (entry > 0 && buildingOf(path[entry - 1]) === 2) entry--;
  let exit = index;
  while (exit + 1 < path.length && buildingOf(path[exit + 1]) === 2) exit++;
  const entrySide = entry === 0
    ? start.stairwellSide ?? data.knownRooms[start.number]?.stairwellSide
    : data.mainStairwellSides[buildingOf(path[entry - 1])];
  const exitSide = exit + 1 < path.length
    ? data.mainStairwellSides[buildingOf(path[exit + 1])]
    : data.knownRooms[end.number]?.stairwellSide;
  return {entrySide, side: exitSide ?? entrySide, exit};
}
function describePath(path, start, end, data = school) {
  const steps = [];
  const buildingOf = node => Number(node.split('-')[0]);
  let stairwellSide;
  for (let i = 0; i < path.length; i++) {
    let instruction = '';
    const inFloorStairInstruction = describeInFloorStairs(path, i, data);
    if (inFloorStairInstruction) steps.push(inFloorStairInstruction);
    if (buildingOf(path[i]) === 2 && (i === 0 || buildingOf(path[i - 1]) !== 2)) {
      const {entrySide, side, exit} = mainStairwellVisit(path, i, start, end, data);
      stairwellSide = side;
      // Connecting steps stay in the hallway; only a floor change or Guidance needs a stairwell.
      const needsStairwell = exit > i || (exit === path.length - 1 &&
        Boolean(data.knownRooms[end.number]?.stairwellSide));
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
    const movement = i + 1 < path.length ? describeStep(path[i], path[i + 1], buildingOf(path[i]) === 2 ? stairwellSide : undefined, data) : '';
    const connection = i + 1 < path.length ? connectionBetween(path[i], path[i + 1], data) : undefined;
    if (typeof connection?.turn?.afterStairs === 'boolean') {
      if (instruction) steps.push(instruction);
      const turn = connectionTurnInstruction(connection, path[i], data);
      const afterStairs = connection.from === path[i] ? connection.turn.afterStairs : !connection.turn.afterStairs;
      const ordered = afterStairs ? [movement, turn] : [turn, movement];
      steps.push(...ordered.filter(Boolean));
    } else if (instruction || movement) {
      steps.push(instruction && movement ? `${instruction} ${movement}` : instruction || movement);
    }
  }
  return steps;
}
export function navigate(startValue, endValue) {
  const start = parseStart(startValue);
  const end = parseRoom(endValue);
  const path = findPath(graph, start.node, end.node);
  if (!path) return {start, end, path: null, steps: ['No route found. The school map may be missing a connection.']};
  const steps = [`Start at ${describeRoom(start)}.`];
  if (start.number === end.number) steps.push("You're already at the destination.");
  else {
    const routeInstructions = school.routeInstructions?.find(rule =>
      rule.fromEntrance === start.entrance && rule.toRoom === end.number &&
      rule.path.length === path.length && rule.path.every((node, index) => node === path[index]));
    if (routeInstructions) {
      steps.push(...routeInstructions.steps);
    } else {
      if (start.entrance) {
        const location = `on the ${floorName(start.floor)} of the ${school.buildings[start.building].name} building.`;
        let approach = `start at the ${start.side} end of the hallway`;
        if (start.approachStairs) {
          const {direction, extent, toLevel} = start.approachStairs;
          const stairExtent = extent === 'half-flight' ? 'a half-flight' : extent;
          const level = toLevel === undefined ? '' : ` to the ${toLevel} landing`;
          const logicalFloor = toLevel === undefined ? '' : `, treated as the ${floorName(start.floor)}`;
          approach = `go ${direction} ${stairExtent}${level}${logicalFloor} at the ${start.side} end of the hallway`;
        } else if (start.doorFloor !== undefined && start.doorFloor !== start.floor) {
          approach = `follow the hallway stairs to the ${start.side} end of the hallway`;
        } else if (start.staircase) {
          approach = `you are beside staircase ${start.staircase}`;
        }
        steps.push(start.approachInstruction
          ? `From Entrance ${start.entrance}, ${start.approachInstruction}.`
          : `From Entrance ${start.entrance}, ${approach} ${location}`);
      }
      const data = directionsData(path, start, end);
      const departure = data.routeDeparture ?? school.knownRooms[start.number]?.departure;
      if (departure) steps.push(departure);
      steps.push(...describePath(path, start, end, data));
      const arrival = path.length === 1 ? 'Stay on this floor and walk to' : 'Continue on this floor to';
      steps.push(school.knownRooms[end.number]?.arrival ?? `${arrival} ${directionRoomLabel(end)}.`);
    }
  }
  // Explain floor-number conventions once per route, then shorten repeated mentions.
  const explainedFloors = new Set();
  return {start, end, path, steps: steps.map(step => step.replace(/basement \(floor 0\)|1st \(ground\) floor/g, label => {
    if (explainedFloors.has(label)) return label === 'basement (floor 0)' ? 'basement' : '1st floor';
    explainedFloors.add(label);
    return label;
  }))};
}
