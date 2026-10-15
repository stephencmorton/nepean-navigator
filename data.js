// School map and destination exceptions from the original prototype; connections are unverified.
export const school = {
  // Building identities and travel links; graph nodes use building-floor order.
  buildings: {1: 'Cafeteria', 2: 'Main', 3: 'Music/Auditorium', 4: 'Math/Science', 5: 'Gym'},
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

// Approximate footprints traced from nepean_top_view.jpg; coordinates describe presentation only.
export const mapLayout = {
  viewBox: '0 0 1200 1100',
  buildings: {
    1: {outline: 'M80 500H328V940H260V1065H88V940H80Z', center: [165, 760], label: ['Cafeteria']},
    2: {outline: 'M328 700H889V968H732V986H486V968H328Z', center: [605, 765], label: ['Main']},
    3: {outline: 'M889 700H990V607H1152V1055H975V926H889Z', center: [1020, 775], label: ['Music /', 'Auditorium']},
    4: {outline: 'M799 29H1008V491H799Z', center: [903, 230], label: ['Math /', 'Science']},
    5: {outline: 'M418 190H715V477H671V587H516V477H418Z', center: [565, 310], label: ['Gym']},
  },
  // Unassigned connecting areas provide visual context without creating graph connections.
  background: 'M548 587H671V455H799V491H874V607H990V700H548Z M874 491H1110V607H874Z',
  // Remembered hallways from nepean_buildings.png; left/right refer to the drawing, not compass bearings.
  mainHallway: {left: [355, 850], center: [605, 850], right: [855, 850]},
  hallways: [
    [[120, 600], [270, 600], [270, 850], [1020, 850]],
    [[855, 850], [855, 530], [903, 530], [903, 100]],
    [[855, 570], [565, 570], [565, 430]],
  ],
  // All Main connections use its ends; these alignments remain approximate and are not floor-specific.
  links: {
    '1-2': [[120, 600], [270, 600], [270, 850], [355, 850], [605, 850]],
    '2-3': [[605, 850], [855, 850], [1020, 850]],
    '2-4': [[605, 850], [855, 850], [855, 530], [903, 530], [903, 100]],
    '2-5': [[605, 850], [855, 850], [855, 570], [565, 570], [565, 430]],
  },
};
