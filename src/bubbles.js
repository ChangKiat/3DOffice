import * as THREE from 'three';

// Speech bubbles: small HTML boxes that follow a person's head on screen.
//
// A bubble only carries the opening line of a reply, kept short; the chat
// panel has the full text.
//
// `getAnchor(name, target)` fills `target` with the world position just above
// that person's head and returns true, or returns false if they are not in
// the scene yet.

const MARGIN = 8; // pixels kept between a bubble and the edge of the screen
const TAIL_INSET = 18; // how close the tail may get to a bubble's corner
const MAX_CHARS = 70;
const SHOW_MS = 6000;

// The first sentence of a reply, cut at a word if it is still too long.
function shorten(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentenceEnd = clean.search(/[.!?](\s|$)/);
  const first = sentenceEnd === -1 ? clean : clean.slice(0, sentenceEnd + 1);
  const hasMore = first.length < clean.length;

  if (first.length <= MAX_CHARS) return hasMore ? `${first} …` : first;

  // Too long: stop at the last comma or similar pause that fits, else at a word.
  const cut = first.slice(0, MAX_CHARS);
  const pause = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(': '));
  if (pause > 25) return `${cut.slice(0, pause)} …`;
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 30 ? lastSpace : MAX_CHARS)}…`;
}

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

  // The person is thinking: show three bouncing dots.
  function thinking(name) {
    const bubble = bubbleFor(name);
    clearTimeout(bubble.hideTimer);
    bubble.element.classList.add('typing');
    bubble.element.replaceChildren(
      document.createElement('span'),
      document.createElement('span'),
      document.createElement('span'),
    );
    bubble.element.hidden = false;
  }

  // Show (or update) what a person is saying. Stays until done() or clear().
  function say(name, text) {
    const bubble = bubbleFor(name);
    clearTimeout(bubble.hideTimer);
    bubble.element.classList.remove('typing');
    bubble.element.textContent = shorten(text);
    bubble.element.hidden = false;
  }

  // The reply is complete: leave the bubble up for a moment, then hide it.
  function done(name) {
    const bubble = bubbles.get(name);
    if (!bubble || bubble.element.hidden) return;
    clearTimeout(bubble.hideTimer);
    bubble.hideTimer = setTimeout(() => clear(name), SHOW_MS);
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
      const { element } = bubble;
      if (element.hidden) continue;
      if (!getAnchor(name, anchor)) continue;
      anchor.project(camera);
      const visible = anchor.z > -1 && anchor.z < 1;
      element.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      const x = (anchor.x * 0.5 + 0.5) * width;
      const y = (-anchor.y * 0.5 + 0.5) * height;

      // Centre the bubble above the head, but keep all of it on screen, and
      // keep the tail pointing at the person even when the bubble is shifted.
      const bubbleWidth = element.offsetWidth;
      const bubbleHeight = element.offsetHeight;
      const left = Math.min(Math.max(x - bubbleWidth / 2, MARGIN), Math.max(MARGIN, width - bubbleWidth - MARGIN));
      const top = Math.min(Math.max(y - bubbleHeight, MARGIN), Math.max(MARGIN, height - bubbleHeight - MARGIN));
      const tail = Math.min(Math.max(x - left, TAIL_INSET), Math.max(TAIL_INSET, bubbleWidth - TAIL_INSET));
      element.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
      element.style.setProperty('--tail-x', `${tail.toFixed(1)}px`);
    }
  }

  return { thinking, say, done, clear, update };
}
