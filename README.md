# 3D Office

A small 3D office scene built with [Three.js](https://threejs.org/) and Vite. The office has four zones — workstations, a meeting room, a pantry and a rest area — and three named people (Rong Zhao, Chee Chong and the boss, Chang Kiat). They type at their desks, then get up and walk to the pantry to eat or get coffee, sit in the rest area, or look at the meeting room whiteboard, and walk back. There is no other functionality yet.

## Run

```bash
npm install
npm run dev
```

Then open the address Vite prints (http://localhost:5173 by default).

- Drag to rotate the camera
- Scroll to zoom
- Right-drag to pan

## Build

```bash
npm run build
```

The static site is written to `dist/`.

## Layout

- `index.html` – page shell
- `src/main.js` – renderer, camera, lights, animation loop
- `src/office.js` – floor plan and the four zones
- `src/furniture.js` – reusable furniture (desk, monitor, chair, sofa, plant, …)
- `src/person.js` – a person: body, name tag, animations and break behaviour
- `src/routes.js` – desk positions, walking paths and break spots
- `src/helpers.js` – small mesh helpers
