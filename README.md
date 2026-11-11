# 3D Office

A small 3D office scene built with [Three.js](https://threejs.org/) and Vite. One worker sits at a desk and types. There is no other functionality yet.

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
- `src/office.js` – room and furniture
- `src/worker.js` – the worker and the typing animation
