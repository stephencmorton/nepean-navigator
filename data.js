
// Remaining survey work: confirm school links and individual room locations.
// Fix up README.md
// Do not have multi-map displays when navigating to/from Gym
// Trim now-redundant data.
// Ensure left-right turns are correct everywhere.
// Add special rooms to new schema, especially in building 3.
// Auto-orient map optionally. (Snap to 90 degrees, or rotate to match the first step of a route.)
// 21.47° west of true north / 8.87° west of current magnetic north
import {hallwayPaths} from './hallway-paths.js';

// School map and destination exceptions from the original prototype; connections are unverified.
export const school = {
  // Building identities and travel links; graph nodes use building-floor order.
  buildings: {
    1: {name: 'Art/English', highRoom: 12, lowestFloor: 1, highestFloor: 3},
    2: {name: 'Main', highRoom: 12, lowestFloor: 0, highestFloor: 3},
    3: {name: 'Music/Auditorium', highRoom: 7, lowestFloor: 0, highestFloor: 3},
    4: {name: 'Math/Science', highRoom: 12, lowestFloor: 0, highestFloor: 2},
    5: {name: 'Gym', highRoom: 12, lowestFloor: 1, highestFloor: 1},
  },
  // Walkable centerlines are ordered polylines in the SVG-aligned 773 × 742 canvas.
  // Following their points in order gives travel direction; turns are calculated from vectors.
  hallwayNetwork: {
    coordinateSystem: 'SVG canvas coordinates; x increases east, y increases south.',
    buildingBounds: {
      1: [25, 335, 168, 379],
      2: [192, 465, 370, 230],
      3: [549, 332, 188, 380],
      4: [499, 27, 141, 310],
      5: [248, 136, 200, 330],
    },
    buildingClips: {
      3: '550,332 707,332 707,407 735,407 735,710 615,710 615,620 561,620 561,408 550,408',
    },
    floors: {
      '1-1': {
        signature: 'art-ground',
        primary: [[181, 627], [181, 520]],
        stairs: {E: [181, 550], hallway: [181, 520]},
        ports: {2: [181, 550]},
      },
      '1-2': {
        signature: 'art-upper',
        primary: [[28, 399], [181, 399]],
        stairs: {E: [181, 505], hallway: [181, 520]},
        ports: {2: [181, 550]},
      },
      '1-3': {
        signature: 'english',
        primary: [[28, 550], [181, 550]],
        stairs: {E: [181, 550]},
        ports: {2: [192, 550]},
      },
      // The basement outline exists, but Main's basement hallway is not drawn.
      '2-0': {
        signature: 'main-basement', primary: null, stairs: {}, ports: {},
      },
      '2-1': {
        signature: 'main-upper',
        primary: [[212, 550], [277, 550], [381, 550], [474, 550], [554, 550]],
        stairs: {A: [474, 570], B: [277, 570]},
        ports: {1: [212, 550], 3: [554, 550], 5: [392.5, 465]},
      },
      '2-2': {
        signature: 'main-upper',
        primary: [[212, 550], [277, 550], [381, 550], [474, 550], [554, 550]],
        stairs: {A: [474, 570], B: [277, 570]},
        ports: {1: [212, 550], 3: [554, 550]},
      },
      '2-3': {
        signature: 'main-upper',
        primary: [[212, 550], [277, 550], [381, 550], [474, 550], [554, 550]],
        stairs: {A: [474, 570], B: [277, 570]},
        ports: {1: [212, 550], 3: [554, 550]},
      },
      '3-1': {
        signature: 'auditorium', primary: [[569, 504], [569, 340]],
        stairs: {hallway: [569, 480]}, ports: {2: [569, 550], 4: [569, 340]},
      },
      '3-2': {
        signature: 'music-upper',
        primary: [[572, 617], [572, 408], [569, 408], [569, 340]],
        stairs: {hallway: [572, 480]}, ports: {2: [572, 550], 4: [569, 340]},
      },
      '3-3': {
        signature: 'auditorium-top',
        primary: [[561, 550], [647, 550], [647, 370], [704, 370]],
        stairs: {}, ports: {2: [561, 550]},
      },
      '4-0': {
        signature: 'science', primary: [[569, 300], [569, 30]],
        stairs: {J: [548, 300]}, ports: {3: [569, 300]},
      },
      '4-1': {
        signature: 'science', primary: [[569, 300], [569, 30]],
        stairs: {J: [548, 300]}, ports: {3: [569, 300], 5: [548, 300]},
      },
      '4-2': {
        signature: 'science', primary: [[569, 300], [569, 30]],
        stairs: {J: [548, 300]}, ports: {3: [569, 300]},
      },
      // The current SVG corridor leaves the Gym, crosses east under Science,
      // then turns north to the west-side landing at stairwell J.
      '5-1': {
        signature: 'gym', primary: null,
        stairs: {}, ports: {2: [392.5, 465], 4: [548, 300]}, approach: [392.5, 325],
      },
    },
    entrances: {
      A: [474, 675], B: [277, 675], C: [181, 640], N: [572, 630],
    },
    namedApproaches: {
      '2201': [277, 570], '1305': [569, 504], '1509': [392.5, 325],
    },
    entranceHallways: {
      C: {axis: 'east-west', inwardDirection: 'west', junction: 'art-main'},
      N: {axis: 'east-west', inwardDirection: 'west', junction: 'main-music'},
    },
    // Each hallway arm points away from its junction. Inbound travel faces the opposite way.
    junctions: {
      'art-main': {
        arms: {
          north: {building: 2, events: [{kind: 'stairs', direction: 'up', extent: 'half-flight'}]},
          east: {entrance: 'C', events: [{kind: 'stairs', direction: 'down', extent: 'unknown'}]},
          west: {building: 1, events: [{kind: 'stairs', direction: 'up', extent: 'half-flight'}]},
        },
        transitions: {'2-2>1-2': {incoming: 'north', outgoing: 'west', hallway: 'north-south hallway'}},
      },
      'main-music': {
        arms: {
          south: {building: 2, events: [{kind: 'stairs', direction: 'up', extent: 'half-flight'}]},
          east: {entrance: 'N', events: [{kind: 'stairs', direction: 'down', extent: 'half-flight'}]},
          west: {building: 3, events: [{kind: 'stairs', direction: 'up', extent: 'half-flight', side: 'north'}]},
        },
        transitions: {'2-2>3-2': {incoming: 'north', outgoing: 'west', hallway: 'hallway'}},
      },
    },
  },
  // Each named staircase connects every pair of its floors. Hallway steps are not stairwells.
  staircases: {
    1: {
      E: {side: 'north', floors: [2, 3]},
      hallway: {kind: 'hallway', side: 'east', floors: [1, 2]},
    },
    2: {
      B: {side: 'south', floors: [0, 1, 2, 3]},
      A: {side: 'north', floors: [0, 1, 2, 3]},
    },
    // The south-side hallway stairs descend half a flight from logical floor 2 to the floor-1 connector.
    3: {hallway: {kind: 'hallway', side: 'east', position: 'south', extent: 'half-flight', floors: [1, 2]}},
    4: {
      J: {side: 'east', floors: [0, 1, 2]},
    },
  },
  // Links are bidirectional. Stairs describe physical rises; junction geometry supplies turns.
  connections: [
    {from: '2-2', to: '1-2', stairs: {direction: 'down', extent: 'half-flight'},
      turn: {junction: 'art-main', hallway: 'north-south hallway'}},
    {from: '2-3', to: '1-3', stairs: {direction: 'down', extent: 'half-flight'}},
    {from: '2-1', to: '5-1'},
    {from: '2-2', to: '3-2', stairs: {direction: 'down', extent: 'half-flight'},
      turn: {junction: 'main-music', hallway: 'hallway', afterStairs: true}},
    {from: '2-3', to: '3-3', stairs: {direction: 'down', extent: 'half-flight'}},
    // The new blue corridor connects the Gym directly to Building 4 at staircase J.
    {from: '5-1', to: '4-1'},
    // Building 3's floor-1 connector reaches Building 4's floor-1 hall by three steps.
    {from: '3-1', to: '4-1', stairs: {direction: 'down', extent: '3 steps'}},
    {from: '3-2', to: '4-2', stairs: {direction: 'up', extent: '3 steps'}},
  ],
  // Special connection notes:
  // - Bldg 4, floor 0, is only accessible via stairs I/J
  // - Bldg 3, floor 3, is only accessible via Building 2 (floor 3)
  // - Bldg 3 floor 3 does not lead in any way to Bldg 4.
  // Main-building stairwell sides used when arriving from or leaving for another building.
  // The Gym joins Main between A and B, so use the route's approach to choose a staircase.
  mainStairwellSides: {1: 'south', 3: 'north', 4: 'north'},
  // Physical rises within a named floor are not graph edges or new room floors.
  inFloorStairs: [
    {node: '3-2', direction: 'up', extent: 'half-flight', fromLevel: 1.5, toLevel: 2,
      logicalFloor: 2, position: 'north', whenFacing: 'west', between: ['2-2', '4-2']},
  ],
  // floor is the hallway level reached after entering; doorFloor records a different physical door level.
  // Door signs identify starting points; hallway position does not add routing edges.
  entrances: {
    A: {building: 2, floor: 2, side: 'east', staircase: 'A'},
    B: {building: 2, floor: 2, side: 'east', staircase: 'B'},
    C: {building: 1, floor: 2, doorFloor: 1, side: 'east',
      approachInstruction: 'follow the hallway (going up some stairs) until you see a long hallway open up on the right'},
    N: {building: 3, floor: 2, doorFloor: 1, side: 'east',
      approachStairs: {direction: 'up', extent: 'half-flight', fromLevel: 1, toLevel: 1.5}},
  },
  // Named destinations and instructions that cannot be inferred from their room numbers.
  knownRooms: {
    '2103': {name: 'Cafeteria'}, // Even though it's really on the 1st floor, I think.
    '2201': {
      name: 'Guidance',
      level: 'half-level below the 2nd floor',
      stairwellSide: 'south',
      arrivalStairs: {kind: 'stairwell', direction: 'down'},
      departureStairs: {kind: 'stairwell', direction: 'up'},
      arrival: 'Take the south "B" stairwell down a half-level from the 2nd floor to Guidance (room 2201).',
      departure: 'Take the south "B" stairwell up a half-level to the 2nd floor.',
    },
    '2205': {name: 'Library'},
    '2202': {name: 'Office'},
    '1509': {name: 'Gym'},
    '1305': {
      name: 'Music',
      arrival: "In building 3, on the 1st floor, look for room 1305. Then keep going down the stairs and follow the path that can't possibly be right to the Music room.",
    },
  },
  // Spoken route refinements apply only while the mapped graph path still matches.
  // Turn context includes the room approaches; a building-floor connection alone is insufficient.
  routeTurnDirections: [
    {fromRoom: '2107', toRoom: '2301', path: ['1-2', '2-2', '3-2'], turns: [
      {incoming: 'north', outgoing: 'west'}, {incoming: 'west', outgoing: 'north'},
    ],
      departure: 'Exit the Art building by walking north along the hallway, following it right around the corner, and going down a half-flight of stairs until you see a long hallway and stairs on your left.'},
  ],
  routeInstructions: [
    {fromEntrance: 'N', toRoom: '2107', path: ['3-2', '2-2', '1-2'], steps: [
      'From Entrance N, go up a half-flight to the landing where you should see a hallway on your left.',
      'Turn left.',
      'Walk all the way through the hallway of the Main building, going up a half-flight at the beginning and down a half-flight at the end.',
      'Turn right at the end of the hallway.',
      'Follow the hallway up a half-flight of stairs and around a corner to the left.',
      'Continue on this floor to room 2107.',
    ]},
  ],
};

function clipCenterlines(paths, bounds, padding = 35) {
  const [x, y, width, height] = bounds;
  const left = x - padding, top = y - padding;
  const right = x + width + padding, bottom = y + height + padding;
  const clipped = [];
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let start = 0, end = 1;
    for (const [p, q] of [[-dx, a[0] - left], [dx, right - a[0]], [-dy, a[1] - top], [dy, bottom - a[1]]]) {
      if (!p && q < 0) {start = 1; break;}
      if (!p) continue;
      const ratio = q / p;
      if (p < 0) start = Math.max(start, ratio);
      else end = Math.min(end, ratio);
    }
    if (start <= end && end >= 0 && start <= 1) {
      const line = [
        [Number((a[0] + start * dx).toFixed(3)), Number((a[1] + start * dy).toFixed(3))],
        [Number((a[0] + end * dx).toFixed(3)), Number((a[1] + end * dy).toFixed(3))],
      ];
      if (Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]) > 1.5) clipped.push(line);
    }
  }
  return clipped;
}

function snapPrimary(point, paths) {
  const segments = paths.flatMap(path => path.slice(1).map((b, i) => [path[i], b]));
  const components = segments.map((_, i) => i);
  const root = index => components[index] === index ? index : (components[index] = root(components[index]));
  const ends = new Map();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const key = p.map(value => value.toFixed(3)).join(',');
      if (ends.has(key)) components[root(i)] = root(ends.get(key));
      else ends.set(key, i);
    }
  });
  const lengths = new Map(), candidates = new Map();
  segments.forEach(([a, b], i) => {
    const component = root(i);
    lengths.set(component, (lengths.get(component) ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const span = dx * dx + dy * dy;
    const t = span ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / span)) : 0;
    const projected = [a[0] + t * dx, a[1] + t * dy];
    const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
    const previous = candidates.get(component);
    if (!previous || distance < previous.distance) candidates.set(component, {point: projected, distance, component});
  });
  const ordered = [...candidates.values()].sort((a, b) => a.distance - b.distance);
  if (!ordered.length || ordered[0].distance > 100) return point;
  if (ordered[0].distance < .001) return ordered[0].point;
  const tied = ordered.filter(item => item.distance <= ordered[0].distance + 2)
    .sort((a, b) => lengths.get(b.component) - lengths.get(a.component));
  return tied[0].point;
}

// Centerlines are generated from the blue hallway outlines and clipped to each
// building's map bounds. The Gym retains the shared corridor to stairwell J.
for (const [node, plan] of Object.entries(school.hallwayNetwork.floors)) {
  const floor = node.split('-')[1];
  const [building] = node.split('-');
  const floorPaths = hallwayPaths[floor] ?? [];
  plan.paths = plan.signature === 'main-basement' ? [] : building === '5'
    ? floorPaths : clipCenterlines(floorPaths, school.hallwayNetwork.buildingBounds[building]);
  if (plan.primary) plan.primary = plan.primary.map(point => snapPrimary(point, plan.paths));
}
