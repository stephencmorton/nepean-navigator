
// Remaining survey work is listed under "Open survey questions" in CONTRIBUTING.md.
// Do not have multi-map displays when navigating to/from Gym
// Ensure left-right turns are correct everywhere.
// Add special rooms to new schema, especially in building 3.
// Auto-orient map optionally. (Snap to 90 degrees, or rotate to match the first step of a route.)
// 21.47 deg west of true north / 8.87 deg west of current magnetic north
// Improve text instructions: not to many instructions, and improve wording.
// Improve separation of source code. Build pipeline should run the python and generate svg and other files.

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
  // Building outlines, hallway centerlines, stairwell landings, ports, and entrance
  // positions are generated from tools/floorplans.svg into map-geometry.js.
  // primary lines run from the lowest to the highest room number for estimated room dots.
  hallwayNetwork: {
    coordinateSystem: 'SVG canvas coordinates; x increases east, y increases south.',
    floors: {
      // The Cafeteria is one large room, so routes cross it in straight lines.
      '1-1': {signature: 'art-ground', primary: [[181, 627], [181, 520]], openArea: true},
      // Directions on this floor name the drawn turns and steps, since its two branches need opposite turns.
      '1-2': {signature: 'art-upper', primary: [[28, 399], [181, 399]], drawnDirections: true},
      '1-3': {signature: 'english', primary: [[28, 550], [181, 550]]},
      // The basement outline exists, but Main's basement hallway is not drawn.
      '2-0': {signature: 'main-basement', primary: null},
      '2-1': {signature: 'main-upper', primary: [[212, 550], [277, 550], [381, 550], [474, 550], [554, 550]]},
      '2-2': {signature: 'main-upper', primary: [[212, 550], [277, 550], [381, 550], [474, 550], [554, 550]]},
      '2-3': {signature: 'main-upper', primary: [[212, 550], [277, 550], [381, 550], [474, 550], [554, 550]]},
      '3-1': {signature: 'auditorium', primary: [[569, 504], [569, 340]]},
      '3-2': {signature: 'music-upper', primary: [[572, 617], [572, 408], [569, 408], [569, 340]]},
      '3-3': {signature: 'auditorium-top', primary: [[561, 550], [647, 550], [647, 370], [704, 370]]},
      '4-0': {signature: 'science', primary: [[569, 300], [569, 30]]},
      '4-1': {signature: 'science', primary: [[569, 300], [569, 30]]},
      '4-2': {signature: 'science', primary: [[569, 300], [569, 30]]},
      // The SVG corridor leaves the Gym, crosses east south of it, and joins Science's hallway.
      '5-1': {signature: 'gym', primary: null, approach: [392.5, 325]},
    },
    // Compass directions of travel into and out of each junction for the keyed connection.
    junctions: {
      'main-music': {
        transitions: {'2-2>3-2': {incoming: 'north', outgoing: 'west'}},
      },
    },
  },
  // Each named staircase connects every pair of its floors. Hallway steps are not stairwells.
  // Labels match gstairs-<label>-<floor> groups; hallway stairs name their steps-<name>-* groups.
  staircases: {
    1: {
      // Back stairs are used only when no equally short route avoids them.
      E: {side: 'south', floors: [2, 3], backStairs: true},
      hallway: {kind: 'hallway', side: 'east', steps: 'cafeteria', floors: [1, 2]},
    },
    2: {
      B: {side: 'south', floors: [0, 1, 2, 3]},
      A: {side: 'north', floors: [0, 1, 2, 3]},
    },
    // The south-side hallway stairs descend half a flight from logical floor 2 to the floor-1 connector.
    3: {hallway: {kind: 'hallway', side: 'east', position: 'south', extent: 'half-flight', steps: 'g224', floors: [1, 2]}},
    4: {
      I: {side: 'east', floors: [0, 1, 2]},
      J: {side: 'west', floors: [0, 1, 2]},
    },
  },
  // Links are bidirectional. Stairs describe physical rises; junction geometry supplies turns.
  connections: [
    {from: '2-2', to: '1-2', stairs: {direction: 'down', extent: 'half-flight'}},
    {from: '2-3', to: '1-3', stairs: {direction: 'down', extent: 'half-flight'}},
    {from: '2-1', to: '5-1'},
    {from: '2-2', to: '3-2', stairs: {direction: 'down', extent: 'half-flight'},
      turn: {junction: 'main-music', hallway: 'hallway', afterStairs: true}},
    {from: '2-3', to: '3-3', stairs: {direction: 'down', extent: 'half-flight'}},
    // The blue corridor connects the Gym directly to Building 4's hallway near staircase I.
    {from: '5-1', to: '4-1'},
    {from: '3-1', to: '4-1', stairs: {direction: 'down', extent: 'half-flight'}},
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
      approachStairs: {direction: 'up', extent: 'flight'}},
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
    // The Art side of this route follows the drawing, so only the Music turn is recorded.
    {fromRoom: '2107', toRoom: '2301', path: ['1-2', '2-2', '3-2'], turns: [null, {incoming: 'west', outgoing: 'north'}]},
  ],
  routeInstructions: [
    {fromEntrance: 'N', toRoom: '2107', path: ['3-2', '2-2', '1-2'], steps: [
      'From Entrance N, go up a flight of stairs to the landing where you should see a hallway on your left.',
      'Turn left.',
      'Walk all the way through the hallway of the Main building, going up a half-flight at the beginning and down a half-flight at the end.',
      'Turn right at the end of the hallway.',
      'Follow the hallway up a half-flight of stairs and around a corner to the left.',
      'Continue on this floor to room 2107.',
    ]},
  ],
};
