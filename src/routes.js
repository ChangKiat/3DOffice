// Where people sit and where they can go on a break.
// All points are [x, z] on the floor and match the layout in office.js.
//
// Facing angles: 0 looks at the back wall (-z), PI looks at the camera side (+z),
// PI / 2 looks at the left wall (-x).

const facing = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));

// Walkway junctions
const AISLE_END = [-1.7, -2.4]; // right-hand end of the aisle behind the desks
const GATE = [-1.7, 0.4]; // gap between the planter and the meeting room glass
const SOFA_FRONT = [1.2, 1.9]; // entry to the strip between the sofa and coffee table
const PANTRY_TABLE = [-4, 3];

// One entry per desk position.
export function deskRoute(desk) {
  return {
    seat: [desk.x, desk.z + 0.8], // on the chair
    side: [desk.x - 0.75, desk.z + 0.85], // standing next to the chair
    aisle: [desk.x - 0.75, -2.4], // in the aisle behind the desks
  };
}

// Break spots, shared by everyone. `path` continues from the desk's aisle point.
// A spot with `seat` is somewhere to sit down; otherwise the person stands at the
// last point of the path.
export function createSpots() {
  const eatFront = [-4, 2.1];
  const eatSide = [-3.24, 3.44];

  return [
    {
      name: 'pantry table (front)',
      action: 'eat',
      path: [AISLE_END, GATE, eatFront],
      face: facing(eatFront, PANTRY_TABLE),
    },
    {
      name: 'pantry table (side)',
      action: 'eat',
      path: [AISLE_END, GATE, [-2.3, 3.0], eatSide],
      face: facing(eatSide, PANTRY_TABLE),
    },
    {
      name: 'coffee machine',
      action: 'drink',
      path: [AISLE_END, GATE, [-5.5, 1.0], [-6.95, 2.0]],
      face: Math.PI / 2,
    },
    {
      name: 'sofa (left seat)',
      action: 'rest',
      path: [AISLE_END, GATE, SOFA_FRONT, [3.45, 1.9]],
      seat: [3.45, 1.12],
      face: Math.PI,
      lift: 0.05,
    },
    {
      name: 'sofa (right seat)',
      action: 'rest',
      path: [AISLE_END, GATE, SOFA_FRONT, [4.55, 1.9]],
      seat: [4.55, 1.12],
      face: Math.PI,
      lift: 0.05,
    },
    {
      name: 'armchair',
      action: 'rest',
      path: [AISLE_END, GATE, SOFA_FRONT, [5.6, 1.9], [5.85, 2.9]],
      seat: [6.58, 2.9],
      face: Math.PI / 2,
      lift: 0.05,
    },
    {
      name: 'whiteboard',
      action: 'think',
      path: [AISLE_END, [-0.8, -1.0], [0.9, -1.0], [1.3, -4.9], [2.6, -5.1]],
      face: 0,
    },
  ].map((spot) => ({ ...spot, busy: false }));
}
