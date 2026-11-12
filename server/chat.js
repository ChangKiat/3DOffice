import Anthropic from '@anthropic-ai/sdk';

// POST /api/chat — lets the boss talk to a member of staff.
//
// Runs inside the Vite dev/preview server (see vite.config.js) so the API key
// stays on the server and never reaches the browser.
//
// Request body:  { staff: "Tracy", activity: "working at your desk", messages: [{ role, content }] }
// Response:      the reply as plain text, streamed as it is written.

const MODEL = 'claude-opus-5-5';
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_BODY_BYTES = 200_000;

// Who the staff are. The roles are placeholders — edit them to match the real team.
const STAFF = {
  'Rong Zhao': 'a software developer who builds and maintains the company\'s tracking application',
  Azmir: 'a data analyst who prepares reports from the company\'s tracking application',
  'Chee Chong': 'an operations executive who keeps day-to-day work and schedules on track',
  Tracy: 'the receptionist, who greets visitors, answers calls and manages the meeting room bookings',
};

function systemPrompt(name, activity) {
  return `You are ${name}, ${STAFF[name]}. You work in a small office run by Chang Kiat, who is your boss and is the person talking to you now. When he starts a conversation you walk over to his room and talk face to face.

Reply as ${name} would to their boss: friendly, direct and brief. Most replies should be one to four sentences; go longer only when he asks for detail. Your reply is shown in a small chat panel that displays plain text, so write plain sentences without markdown, headings or bullet symbols.

Right now you are ${activity}. Mention it only if it is relevant or he asks what you are doing.

You do not yet have a connection to the tracking application or any company records, so you cannot look up real figures, entries or schedules. If he asks for something that would need that data, say plainly that you can't check it from here yet instead of making up numbers or records. General questions, advice, explanations and drafting you can help with normally.`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// Returns an error message, or null when the body is usable.
function validate(body) {
  if (!body || typeof body !== 'object') return 'Request body must be an object.';
  if (!Object.hasOwn(STAFF, body.staff)) return 'Unknown staff member.';
  if (!Array.isArray(body.messages) || body.messages.length === 0) return 'No messages given.';
  if (body.messages.length > MAX_MESSAGES) return 'This conversation is too long. Clear it and start again.';
  for (const message of body.messages) {
    if (message?.role !== 'user' && message?.role !== 'assistant') return 'Invalid message role.';
    if (typeof message.content !== 'string' || message.content.trim() === '') return 'Empty message.';
    if (message.content.length > MAX_MESSAGE_LENGTH) return 'A message is too long.';
  }
  if (body.messages[body.messages.length - 1].role !== 'user') return 'The last message must be from the user.';
  return null;
}

function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

let client = null;

async function handleChat(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    sendError(res, 400, error.message);
    return;
  }
  const problem = validate(body);
  if (problem) {
    sendError(res, 400, problem);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    sendError(res, 503, 'No Claude API key is set. Add ANTHROPIC_API_KEY to the .env file and restart the server.');
    return;
  }

  const activity = typeof body.activity === 'string' ? body.activity.slice(0, 200) : 'at work in the office';

  try {
    client ??= new Anthropic();

    // If a safety classifier declines the request, `fallbacks` lets the API
    // retry it on another model inside the same call.
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' }, // short conversational replies
      system: systemPrompt(body.staff, activity),
      messages: body.messages.map(({ role, content }) => ({ role, content })),
    });

    let wroteText = false;
    stream.on('text', (delta) => {
      if (!res.headersSent) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
      }
      wroteText = true;
      res.write(delta);
    });
    req.on('close', () => {
      if (!res.writableEnded) stream.abort();
    });

    const message = await stream.finalMessage();
    if (!wroteText) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.write(
        message.stop_reason === 'refusal'
          ? "Sorry boss, that's not something I can help with."
          : '(No reply.)',
      );
    }
    res.end();
  } catch (error) {
    if (res.headersSent) {
      res.end(); // already streaming; the browser keeps what it has
      return;
    }
    if (error instanceof Anthropic.AuthenticationError) {
      sendError(res, 401, 'The Claude API key was rejected. Check ANTHROPIC_API_KEY in the .env file.');
    } else if (error instanceof Anthropic.RateLimitError) {
      sendError(res, 429, 'The Claude API is rate limited right now. Try again in a moment.');
    } else if (error instanceof Anthropic.APIUserAbortError) {
      res.end();
    } else if (error instanceof Anthropic.APIConnectionError) {
      sendError(res, 502, 'Could not reach the Claude API. Check the internet connection.');
    } else if (error instanceof Anthropic.APIError) {
      sendError(res, error.status ?? 500, `Claude API error: ${error.message}`);
    } else {
      console.error('[chat]', error);
      sendError(res, 500, 'The chat server hit an unexpected error.');
    }
  }
}

function middleware(req, res, next) {
  if (req.url?.split('?')[0] !== '/api/chat') {
    next();
    return;
  }
  if (req.method !== 'POST') {
    sendError(res, 405, 'Use POST.');
    return;
  }
  handleChat(req, res);
}

export function chatPlugin() {
  return {
    name: 'office-chat',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export const STAFF_NAMES = Object.keys(STAFF);
