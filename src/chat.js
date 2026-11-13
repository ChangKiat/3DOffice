// Chat panel: the boss talks to one member of staff, or to the whole room
// while a meeting is on. Replies come from the /api/chat endpoint
// (server/chat.js) and are streamed in.

const STAFF = ['Tracy', 'Rong Zhao', 'Azmir', 'Chee Chong', 'Ken'];
const MEETING = '__meeting__';

// In a meeting reply each speaker's part starts with these two markers around
// their name (see server/chat.js).
const SPEAKER_START = '\u001e';
const SPEAKER_END = '\u001f';

// Splits a streamed meeting reply into [{ name, text }], one per speaker.
function splitSpeakers(raw) {
  const parts = [];
  for (const chunk of raw.split(SPEAKER_START).slice(1)) {
    const end = chunk.indexOf(SPEAKER_END);
    if (end === -1) continue; // the name itself has not finished arriving
    parts.push({ name: chunk.slice(0, end), text: chunk.slice(end + 1) });
  }
  return parts;
}

// `getActivity(name)` returns what that person is doing in the office right now.
// `onActive(name)` is called whenever the one-to-one conversation with that
// person is in use, and `onLeave()` when the boss stops talking to them.
// `onReplyStart(name)` is called when a question is sent (name is null in a
// meeting, where the speaker isn't known yet), `onReplyText(name, text)` with a
// speaker's reply so far as it streams in, and `onReplyEnd(name, ok)` when that
// speaker finishes or the request fails.
export function setupChat({ getActivity, onActive, onLeave, onReplyStart, onReplyText, onReplyEnd }) {
  const panel = document.getElementById('chat');
  const toggle = document.getElementById('chat-toggle');
  const select = document.getElementById('chat-staff');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');

  // One conversation per member of staff plus one for meetings, kept only
  // while the page is open.
  const conversations = Object.fromEntries([...STAFF, MEETING].map((key) => [key, []]));
  let busy = false;
  let meeting = false;
  let beforeMeeting = STAFF[0];

  for (const name of STAFF) select.add(new Option(name, name));
  const meetingOption = new Option('Everyone (meeting)', MEETING);

  function addBubble(kind, text, speaker = null) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${kind}`;
    if (speaker) {
      const label = document.createElement('div');
      label.className = 'chat-speaker';
      label.textContent = speaker;
      bubble.append(label);
    }
    const body = document.createElement('div');
    body.textContent = text;
    bubble.append(body);
    bubble.setText = (value) => {
      body.textContent = value;
    };
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  function render() {
    log.replaceChildren();
    const messages = conversations[select.value];
    if (messages.length === 0) {
      addBubble(
        'note',
        meeting
          ? 'Meeting in progress. Ask the room: whoever is in charge of the subject will answer.'
          : `Ask ${select.value} about their area.`,
      );
      return;
    }
    for (const message of messages) {
      if (message.role === 'user') addBubble('me', message.content);
      else if (message.parts) message.parts.forEach((part) => addBubble('them', part.text, part.name));
      else addBubble('them', message.content);
    }
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    select.disabled = value || meeting;
  }

  async function readStream(response, onText) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      onText(raw);
    }
    return raw;
  }

  async function post(body) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error ?? `The chat server returned an error (${response.status}).`);
    }
    return response;
  }

  // What the model is sent: plain text turns. A meeting reply is flattened to
  // "Name: text" paragraphs so later turns know who said what.
  const forServer = (messages) => messages.map(({ role, content }) => ({ role, content }));

  async function askOne(staff, messages, pending) {
    onActive(staff);
    onReplyStart(staff);
    try {
      const response = await post({ staff, activity: getActivity(staff), messages: forServer(messages) });
      const reply = await readStream(response, (raw) => {
        pending.classList.remove('pending');
        pending.setText(raw);
        onReplyText(staff, raw);
        log.scrollTop = log.scrollHeight;
      });
      if (reply.trim() === '') throw new Error('No reply came back.');
      messages.push({ role: 'assistant', content: reply });
      onActive(staff); // keep them here while the boss reads the reply
      onReplyEnd(staff, true);
    } catch (error) {
      onReplyEnd(staff, false);
      throw error;
    }
  }

  async function askRoom(messages, pending) {
    onReplyStart(null);
    const bubbles = []; // one chat bubble per speaker, in order
    let current = null;
    try {
      const activities = Object.fromEntries(STAFF.map((name) => [name, getActivity(name)]));
      const response = await post({ meeting: true, activities, messages: forServer(messages) });
      const raw = await readStream(response, (soFar) => {
        const parts = splitSpeakers(soFar);
        if (parts.length === 0) return;
        pending.remove();
        parts.forEach((part, i) => {
          bubbles[i] ??= addBubble('them', '', part.name);
          bubbles[i].setText(part.text || '…');
        });
        const latest = parts[parts.length - 1];
        if (current !== null && current !== latest.name) onReplyEnd(current, true);
        current = latest.name;
        if (latest.text) onReplyText(latest.name, latest.text);
        log.scrollTop = log.scrollHeight;
      });

      const parts = splitSpeakers(raw).filter((part) => part.text.trim() !== '');
      if (parts.length === 0) throw new Error('No reply came back.');
      messages.push({
        role: 'assistant',
        parts,
        content: parts.map((part) => `${part.name}: ${part.text.trim()}`).join('\n\n'),
      });
      if (current !== null) onReplyEnd(current, true);
    } catch (error) {
      bubbles.forEach((bubble) => bubble.remove());
      if (current !== null) onReplyEnd(current, false);
      throw error;
    }
  }

  async function ask(text) {
    const key = select.value;
    const messages = conversations[key];
    if (messages.length === 0) log.replaceChildren();

    messages.push({ role: 'user', content: text });
    addBubble('me', text);
    const pending = addBubble('them pending', '…');
    setBusy(true);

    try {
      if (key === MEETING) await askRoom(messages, pending);
      else await askOne(key, messages, pending);
    } catch (error) {
      // Take the question back out so the conversation still alternates.
      messages.pop();
      if (!pending.isConnected) log.append(pending);
      pending.className = 'chat-bubble error';
      pending.setText(error.message);
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

  // Switch the chat to `name` (used when a person is clicked in the office).
  // Returns false if that person can't be chatted with one to one right now.
  function selectStaff(name) {
    if (!STAFF.includes(name) || busy || meeting) return false;
    if (select.value !== name) {
      onLeave();
      select.value = name;
      render();
    }
    if (panel.classList.contains('collapsed')) toggle.click();
    input.focus();
    return true;
  }

  // While a meeting is on, the chat talks to the whole room.
  function setMeeting(on) {
    if (on === meeting) return;
    meeting = on;
    if (on) {
      beforeMeeting = select.value;
      select.add(meetingOption, 0);
      select.value = MEETING;
    } else {
      meetingOption.remove();
      select.value = beforeMeeting;
    }
    select.disabled = busy || meeting;
    input.placeholder = on ? 'Ask the room…' : 'Type a question…';
    render();
  }

  render();
  return { selectStaff, setMeeting, canChatWith: (name) => STAFF.includes(name) };
}
