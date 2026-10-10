// School knowledge from the original prototype. Connections are unverified.
export const school = {
  buildings: {1: 'North Cafeteria', 2: 'Main', 3: 'Music/Auditorium', 4: 'Math/Science', 5: 'Gym'},
  staircases: {1: [1, 2], 2: [0, 1, 2, 3], 3: [1, 3], 4: [0, 1, 2]},
  connections: {'1-1': ['2-1'], '1-3': ['2-3'], '2-0': ['5-1'], '2-1': ['3-1'], '2-3': ['3-3']},
  guidanceRoom: '2201',
  guidanceInstructions: 'To access the guidance department (room 2201), go to the main building (where either set of main steps lead), go to the stairwell at the South end of the building, and you will find guidance a half-level below the 2nd floor.',
};
