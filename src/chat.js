// Chat panel: the boss picks a member of staff and messages them.
// Replies come from the /api/chat endpoint (server/chat.js) and are streamed in.

const STAFF = ['Tracy', 'Rong Zhao', 'Azmir', 'Chee Chong'];

// `getActivity(name)` returns what that person is doing in the office right now.
// `onActive(name)` is called whenever the conversation with that person is in use,
// and `onLeave()` when the boss stops talking to them.
export function setupChat({ getActivity, onActive, onLeave }) {
  const panel = document.getElementById('chat');
  const toggle = document.getElementById('chat-toggle');
  const select = document.getElementById('chat-staff');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');

  // One conversation per member of staff, kept only while the page is open.
  const conversations = Object.fromEntries(STAFF.map((name) => [name, []]));
  let busy = false;

  for (const name of STAFF) select.add(new Option(name, name));

  function addBubble(kind, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${kind}`;
    bubble.textContent = text;
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  function render() {
    log.replaceChildren();
    const messages = conversations[select.value];
    if (messages.length === 0) {
      addBubble('note', `Ask ${select.value} something.`);
      return;
    }
    for (const message of messages) addBubble(message.role === 'user' ? 'me' : 'them', message.content);
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    select.disabled = value;
  }

  async function ask(text) {
    const staff = select.value;
    const messages = conversations[staff];
    if (messages.length === 0) log.replaceChildren();

    onActive(staff);
    messages.push({ role: 'user', content: text });
    addBubble('me', text);
    const bubble = addBubble('them pending', '…');
    setBusy(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff, activity: getActivity(staff), messages }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `The chat server returned an error (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        bubble.classList.remove('pending');
        bubble.textContent = reply;
        log.scrollTop = log.scrollHeight;
      }

      if (reply.trim() === '') throw new Error('No reply came back.');
      messages.push({ role: 'assistant', content: reply });
      onActive(staff); // keep them here while the boss reads the reply
    } catch (error) {
      // Take the question back out so the conversation still alternates.
      messages.pop();
      bubble.className = 'chat-bubble error';
      bubble.textContent = error.message;
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (text === '' || busy) return;
    input.value = '';
    ask(text);
  });

  select.addEventListener('change', () => {
    onLeave();
    render();
  });

  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.textContent = collapsed ? 'Chat' : '–';
    toggle.setAttribute('aria-label', collapsed ? 'Open chat' : 'Minimise chat');
    if (collapsed) onLeave();
    else input.focus();
  });

  render();
}
