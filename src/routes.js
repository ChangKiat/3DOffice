import { DESK_POSITIONS, BOSS_DESK, RECEPTION_DESK } from './office.js';

// Where people sit, where they can go on a break, and how they walk there.
// All points are [x, z] on the floor and match the layout in office.js.
//
// Facing angles: 0 looks at the back wall (-z), PI looks at the front (+z),
// PI / 2 looks at the left wall (-x).

const facing = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));

// --- Walkway graph -----------------------------------------------------------
// People only walk in straight lines between connected nodes, which keeps them
// clear of furniture and glass walls.

const NODES = {
  aisle0: [DESK_POSITIONS[0].x - 0.75, -2.4], // aisle behind the three desks
  aisle1: [DESK_POSITIONS[1].x - 0.75, -2.4],
  aisle2: [DESK_POSITIONS[2].x - 0.75, -2.4],
  aisleEnd: [-1.7, -2.4],
  gate: [-1.7, 0.4], // gap between the planter and the meeting room glass
  meetingDoorOut: [-0.8, -1.0],
  meetingDoorIn: [0.9, -1.0],
  sofaFront: [1.2, 1.9], // the strip between the sofa and the coffee table...
  sofaLeft: [3.45, 1.9],
  sofaRight: [4.55, 1.9],
  armchairTurn: [5.6, 1.9],
  restEast: [7.6, 1.9], // ...which carries on towards reception
  reception: [9.3, 1.6],
  bossDoorOut: [9.5, 0.7],
  bossDoorIn: [9.5, -0.7],
  bossCorner: [12.6, -2.5], // beside the boss's desk
};

const EDGES = [
  ['aisle0', 'aisle1'],
  ['aisle1', 'aisle2'],
  ['aisle2', 'aisleEnd'],
  ['aisleEnd', 'gate'],
  ['aisleEnd', 'meetingDoorOut'],
  ['gate', 'meetingDoorOut'],
  ['meetingDoorOut', 'meetingDoorIn'],
  ['gate', 'sofaFront'],
  ['sofaFront', 'sofaLeft'],
  ['sofaLeft', 'sofaRight'],
  ['sofaRight', 'armchairTurn'],
  ['armchairTurn', 'restEast'],
  ['restEast', 'reception'],
  ['restEast', 'bossDoorOut'],
  ['reception', 'bossDoorOut'],
  ['bossDoorOut', 'bossDoorIn'],
  ['bossDoorIn', 'bossCorner'],
];

const neighbours = {};
for (const name of Object.keys(NODES)) neighbours[name] = [];
for (const [a, b] of EDGES) {
  const length = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);
  neighbours[a].push({ to: b, length });
  neighbours[b].push({ to: a, length });
}

// Shortest walk between two nodes, as a list of points including both ends.
export function findPath(from, to) {
  const distance = { [from]: 0 };
  const previous = {};
  const open = new Set(Object.keys(NODES));

  while (open.size > 0) {
    let current = null;
    for (const name of open) {
      if (distance[name] !== undefined && (current === null || distance[name] < distance[current])) {
        current = name;
      }
    }
    if (current === null || current === to) break;
    open.delete(current);
    for (const { to: next, length } of neighbours[current]) {
      const candidate = distance[current] + length;
      if (distance[next] === undefined || candidate < distance[next]) {
        distance[next] = candidate;
        previous[next] = current;
      }
    }
  }

  const path = [];
  for (let name = to; name !== undefined; name = previous[name]) path.unshift(NODES[name]);
  return path;
}

// --- Desks -------------------------------------------------------------------
// seat: on the chair.  side: standing next to the chair.  node: nearest walkway
// node.  face: which way the person looks while seated.

export const WORK_DESKS = DESK_POSITIONS.map((desk, i) => ({
  seat: [desk.x, desk.z + 0.8],
  side: [desk.x - 0.75, desk.z + 0.85],
  face: 0,
  node: `aisle${i}`,
}));

export const BOSS_SEAT = {
  seat: [BOSS_DESK.x, BOSS_DESK.z - 0.9],
  side: [BOSS_DESK.x + 0.9, BOSS_DESK.z - 0.9],
  face: Math.PI,
  node: 'bossCorner',
};

export const RECEPTION_SEAT = {
  seat: [RECEPTION_DESK.x, RECEPTION_DESK.z - 0.8],
  side: [RECEPTION_DESK.x - 0.85, RECEPTION_DESK.z - 0.8],
  face: Math.PI,
  node: 'reception',
};

// --- Break spots ---------------------------------------------------------------
// Shared by everyone; only one person uses a spot at a time. From `node` the
// person walks through `approach` (if any). A spot with `seat` is somewhere to
// sit down; otherwise the person stands at the last point.

export function createSpots() {
  const pantryTable = [-4, 3];
  const eatFront = [-4, 2.1];
  const eatSide = [-3.24, 3.44];

  return [
    {
      name: 'pantry table (front)',
      action: 'eat',
      node: 'gate',
      approach: [eatFront],
      face: facing(eatFront, pantryTable),
    },
    {
      name: 'pantry table (side)',
      action: 'eat',
      node: 'gate',
      approach: [[-2.3, 3.0], eatSide],
      face: facing(eatSide, pantryTable),
    },
    {
      name: 'coffee machine',
      action: 'drink',
      node: 'gate',
      approach: [[-5.5, 1.0], [-6.95, 2.0]],
      face: Math.PI / 2,
    },
    {
      name: 'sofa (left seat)',
      action: 'rest',
      node: 'sofaLeft',
      seat: [3.45, 1.12],
      face: Math.PI,
      lift: 0.05,
    },
    {
      name: 'sofa (right seat)',
      action: 'rest',
      node: 'sofaRight',
      seat: [4.55, 1.12],
      face: Math.PI,
      lift: 0.05,
    },
    {
      name: 'armchair',
      action: 'rest',
      node: 'armchairTurn',
      approach: [[5.85, 2.9]],
      seat: [6.58, 2.9],
      face: Math.PI / 2,
      lift: 0.05,
    },
    {
      name: 'whiteboard',
      action: 'think',
      node: 'meetingDoorIn',
      approach: [[1.3, -4.9], [2.6, -5.1]],
      face: 0,
    },
  ].map((spot) => ({ ...spot, busy: false }));
}
