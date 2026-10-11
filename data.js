// School knowledge from the original prototype. Connections are unverified.
export const school = {
  buildings: {1: 'North Cafeteria', 2: 'Main', 3: 'Music/Auditorium', 4: 'Math/Science', 5: 'Gym'},
  staircases: {1: [1, 2], 2: [0, 1, 2, 3], 3: [1, 3], 4: [0, 1, 2]},
  connections: {'1-1': ['2-1'], '1-3': ['2-3'], '2-0': ['5-0'], '2-1': ['3-1', '4-1'], '2-3': ['3-3']},
  mainStairwellSides: {1: 'south', 3: 'north', 4: 'north', 5: 'north'},
  knownRooms: {
    '2205': {name: 'Library'},
    '2201': {
      name: 'Guidance',
      level: 'half-level below the 2nd floor',
      stairwellSide: 'south',
      arrival: 'Go a half-level below the 2nd floor to reach Guidance (room 2201).',
      departure: 'Go up a half-level via the south stairwell to reach the 2nd floor.',
    },
    // Office 2204 is provisional; its floor is known, but the exact room is unconfirmed.
    '2204': {name: 'Office'},
    '0501': {name: 'Gym'},
  },
};
