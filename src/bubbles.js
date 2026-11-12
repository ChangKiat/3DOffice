import * as THREE from 'three';

// Speech bubbles: HTML boxes that follow a person's head on screen.
//
// `getAnchor(name, target)` fills `target` with the world position just above
// that person's head and returns true, or returns false if they are not in
// the scene yet.
const MARGIN = 8; // pixels kept between a bubble and the edge of the screen

export function createBubbles({ camera, canvas, getAnchor }) {
  const layer = document.createElement('div');
  layer.className = 'speech-layer';
  document.body.append(layer);

  const bubbles = new Map(); // name -> { element, hideTimer }
  const anchor = new THREE.Vector3();

  function bubbleFor(name) {
    let bubble = bubbles.get(name);
    if (!bubble) {
      const element = document.createElement('div');
      element.className = 'speech';
      element.hidden = true;
      layer.append(element);
      bubble = { element, hideTimer: null };
      bubbles.set(name, bubble);
    }
    return bubble;
  }

  // Show (or update) what a person is saying. Stays until done() or clear().
  function say(name, text) {
    const bubble = bubbleFor(name);
    clearTimeout(bubble.hideTimer);
    bubble.element.textContent = text;
    bubble.element.hidden = false;
  }

  // The reply is complete: leave it up long enough to read, then hide it.
  function done(name) {
    const bubble = bubbles.get(name);
    if (!bubble || bubble.element.hidden) return;
    const readingTime = Math.min(15_000, Math.max(6_000, bubble.element.textContent.length * 60));
    clearTimeout(bubble.hideTimer);
    bubble.hideTimer = setTimeout(() => clear(name), readingTime);
  }

  function clear(name) {
    const bubble = bubbles.get(name);
    if (!bubble) return;
    clearTimeout(bubble.hideTimer);
    bubble.element.hidden = true;
  }

  // Call once per frame, after the camera has been updated.
  function update() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    for (const [name, bubble] of bubbles) {
      if (bubble.element.hidden) continue;
      if (!getAnchor(name, anchor)) continue;
      anchor.project(camera);
      const visible = anchor.z > -1 && anchor.z < 1;
      bubble.element.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      const x = (anchor.x * 0.5 + 0.5) * width;
      const y = (-anchor.y * 0.5 + 0.5) * height;

      // Centre the bubble above the head, but keep all of it on screen.
      const bubbleWidth = bubble.element.offsetWidth;
      const bubbleHeight = bubble.element.offsetHeight;
      const left = Math.min(Math.max(x - bubbleWidth / 2, MARGIN), Math.max(MARGIN, width - bubbleWidth - MARGIN));
      const top = Math.min(Math.max(y - bubbleHeight, MARGIN), Math.max(MARGIN, height - bubbleHeight - MARGIN));
      bubble.element.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    }
  }

  return { say, done, clear, update };
}
