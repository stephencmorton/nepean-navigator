// TODO:
// - Add entrance M ?
// - Location of rooms/stairwells within a hallway.
// - Fix up building 3 level 1/2 hallway stairs.
// - UI/UX has become ugly again?
// - Are stairs/hallways designed optimally/sensibly?
// - Building 3 stairs down - encode properly. And draw on map nicely. Ask AI how best to do.
// - Add stairwell symbols to 0th floor map building 4.

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
  //staircases: {1: [1, 2], 2: [0, 1, 2, 3], 3: [1, 3], 4: [0, 1, 2]},
  // Each named staircase connects every pair of its floors. Hallway steps are not stairwells.
  staircases: {
    1: {
      // X: {side: 'north', floors: [1, 2, 3]}, // not used in routing
      E: {side: 'north', floors: [2, 3]},
      hallway: {kind: 'hallway', side: 'east', floors: [1, 2]},
    },
    2: {
      B: {side: 'south', floors: [0, 1, 2, 3]},
      A: {side: 'north', floors: [0, 1, 2, 3]},
    },
    3: {hallway: {kind: 'hallway', side: 'east', floors: [1, 2]}},
    4: {
      J: {side: 'east', floors: [0, 1, 2]},
      // I: {side: 'east', floors: [0, 1, 2]}, // not used in routing
    },
  },
  // Links are bidirectional. Optional stairs describe travel from `from` to `to`.
  connections: [
    {from: '2-2', to: '1-2', stairs: {direction: 'down', extent: 'half-flight'}},
    {from: '2-3', to: '1-3', stairs: {direction: 'down', extent: 'half-flight'}},
    {from: '2-1', to: '5-1'},
    {from: '2-2', to: '3-2', stairs: {direction: 'down', extent: 'half-flight'}},
    {from: '2-3', to: '3-3', stairs: {direction: 'down', extent: 'half-flight'}},
    //{from: '3-1', to: '3-2', stairs: {direction: 'up', extent: 'half-flight'}},
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
  // floor is the hallway level reached after entering; doorFloor records a different physical door level.
  // Door signs identify starting points; hallway position does not add routing edges.
  entrances: {
    A: {building: 2, floor: 2, side: 'east', staircase: 'A'},
    B: {building: 2, floor: 2, side: 'east', staircase: 'B'},
    C: {building: 1, floor: 2, doorFloor: 1, side: 'east'},
    N: {building: 3, floor: 2, doorFloor: 1, side: 'east'},
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
};
