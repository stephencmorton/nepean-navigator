// School map and destination exceptions from the original prototype; connections are unverified.
export const school = {
  // Building identities and travel links; graph nodes use building-floor order.
  buildings: {1: 'North Cafeteria', 2: 'Main', 3: 'Music/Auditorium', 4: 'Math/Science', 5: 'Gym'},
  staircases: {1: [1, 2], 2: [0, 1, 2, 3], 3: [1, 3], 4: [0, 1, 2]},
  connections: {'1-1': ['2-1'], '1-3': ['2-3'], '2-0': ['5-0'], '2-1': ['3-1', '4-1'], '2-3': ['3-3']},
  // Main-building stairwell sides used when arriving from or leaving for another building.
  mainStairwellSides: {1: 'south', 3: 'north', 4: 'north', 5: 'north'},
  // Named destinations and instructions that cannot be inferred from their room numbers.
  knownRooms: {
    '2205': {name: 'Library'},
    '2201': {
      name: 'Guidance',
      level: 'half-level below the 2nd floor',
      stairwellSide: 'south',
      arrival: 'Take the south stairwell down a half-level from the 2nd floor to Guidance (room 2201).',
      departure: 'Take the south stairwell up a half-level to the 2nd floor.',
    },
    // Office 2204 is provisional; its floor is known, but the exact room is unconfirmed.
    '2204': {name: 'Office'},
    '0501': {name: 'Gym'},
  },
};
