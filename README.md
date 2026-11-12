# 3D Office

A small 3D office scene built with [Three.js](https://threejs.org/) and Vite.

The office has six areas: workstations, a meeting room, a boss room, a pantry, a rest area and reception. Five named people work in it:

- Rong Zhao, Azmir and Chee Chong at the workstations
- Chang Kiat (Boss) in the boss room
- Tracy at reception

They type at their desks, then get up and walk to the pantry to eat or get coffee, sit in the rest area, or look at the meeting room whiteboard, and walk back. There is no other functionality yet.

## Run

```bash
npm install
npm run dev
```

Then open the address Vite prints (http://localhost:5173 by default).

- Drag to rotate the camera
- Scroll to zoom
- Right-drag to pan
- **Call meeting** (top right) sends everyone to the meeting room; press it again to send them back to their desks

## Chat with the staff

The chat panel (bottom left) lets you message Tracy, Rong Zhao, Azmir or Chee Chong. Replies are written by Claude through the `/api/chat` endpoint in `server/chat.js`, which runs inside the Vite server so the API key never reaches the browser.

To turn it on:

1. Copy `.env.example` to `.env`.
2. Put your Claude API key after `ANTHROPIC_API_KEY=`.
3. Restart `npm run dev`.

The staff answer in character and know what they are doing in the office at that moment. They are not connected to the tracking application yet, so they cannot look up real data. Their roles are placeholders set in `server/chat.js`.

The chat only works while the Vite server is running (`npm run dev` or `npm run preview`); the static files in `dist/` alone have no chat endpoint.

## Build

```bash
npm run build
```

The static site is written to `dist/`.

## Character models

People are drawn with Mixamo characters when these files exist in `public/models/` (they are not stored in git):

- Characters: `ch17.glb` (workers), `ch33.glb` (boss), `kachujin.glb` (receptionist)
- Clips: `idle.glb`, `drinking.glb`, `stand-to-sit.glb`, `sit-to-type.glb`

They are converted from Mixamo FBX downloads with FBX2glTF, and the character textures are shrunk with `gltf-transform optimize --texture-size 1024 --texture-compress webp`. If the files are missing, the page falls back to simple box figures.

`viewer.html` is a development page for checking one character in one pose, for example `/viewer.html?kind=boss&state=work&cam=side`.

## Layout

- `index.html` – page shell
- `src/main.js` – renderer, camera, lights, animation loop, the team list
- `src/office.js` – floor plan and the six areas
- `src/furniture.js` – reusable furniture (desk, monitor, chair, sofa, plant, …)
- `src/person.js` – a person's behaviour: name tag, work, breaks and walking
- `src/models.js` – loads the Mixamo characters and clips
- `src/bodyModel.js` – a person's body using a Mixamo character
- `src/bodyBox.js` – fallback body made from boxes
- `src/routes.js` – seats, the walkway graph and break spots
- `src/helpers.js` – small mesh helpers
- `src/chat.js` – the chat panel
- `server/chat.js` – the chat endpoint that calls Claude
- `vite.config.js` – loads `.env` and adds the chat endpoint to the Vite server
