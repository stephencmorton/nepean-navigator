// School knowledge from the original prototype. Connections are unverified.
export const school = {
  buildings: {1: 'North Cafeteria', 2: 'Main', 3: 'Music/Auditorium', 4: 'Math/Science', 5: 'Gym'},
  staircases: {1: [1, 2], 2: [0, 1, 2, 3], 3: [1, 3], 4: [0, 1, 2]},
  connections: {'1-1': ['2-1'], '1-3': ['2-3'], '2-0': ['5-1'], '2-1': ['3-1', '4-1'], '2-3': ['3-3']},
  // Office 2204 is provisional; its floor is known, but the exact room is unconfirmed.
  roomAliases: {library: '2205', guidance: '2201', office: '2204'},
  guidanceRoom: '2201',
  guidanceInstructions: [
    'Go to the Main building (either set of main steps leads there).',
    'Go to the stairwell at the South end of the building.',
    'Go a half-level below the 2nd floor to reach Guidance (room 2201).',
  ],
};
