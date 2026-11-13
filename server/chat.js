import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { DATA_GUIDE, dataConfigured, runReadOnlyQuery } from './data.js';

// POST /api/chat — lets the boss talk to a member of staff.
//
// Runs inside the Vite dev/preview server (see vite.config.js) so the API key
// and the database address stay on the server and never reach the browser.
//
// Request body:  { staff: "Tracy", activity: "working at your desk", messages: [{ role, content }] }
// Response:      the reply as plain text, streamed as it is written.

const MODEL = 'claude-opus-5-5';
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_BODY_BYTES = 200_000;
const MAX_TOOL_ROUNDS = 8;

// Who the staff are and what each looks after. Everyone can read all the data;
// the speciality only shapes how they answer. Edit these to suit.
const STAFF = {
  Azmir: {
    role: 'the finance analyst',
    focus: 'spending, income, budgets and tax relief',
  },
  'Rong Zhao': {
    role: 'the health and fitness analyst',
    focus: 'workouts, meals and macros, body weight and daily steps',
  },
  'Chee Chong': {
    role: 'the operations executive',
    focus: 'upcoming recurring bills and due dates, trips and their costs, and car servicing',
  },
  Ken: {
    role: 'the investments and loans analyst',
    focus: 'investment holdings and their buys and sells, interest earned, and loans and their repayments',
  },
  Tracy: {
    role: 'the receptionist and personal assistant',
    focus: 'quick look-ups across everything and short summaries of the day or week',
  },
};

function todayInKualaLumpur() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'full',
  }).format(new Date());
}

function isoDateInKualaLumpur() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
}

function personaPrompt(name, activity, hasData) {
  const { role, focus } = STAFF[name];
  const dataPart = hasData
    ? `You can read his tracking application's records with the query_tracking_data tool. Your speciality is ${focus}, and you answer those questions with the most care, but you can look up anything he asks. When a question is far outside your area you may add which colleague knows it best (Azmir for spending, income and budgets, Ken for investments and loans, Rong Zhao for health, Chee Chong for bills, trips and the car, Tracy for quick summaries), after you have answered it.`
    : `You look after ${focus}, but the connection to the tracking application's records is not set up on this computer, so you cannot look anything up right now. If he asks for figures or records, say plainly that you can't reach the data yet instead of making anything up.`;

  return `You are ${name}, ${role} in a small office run by Chang Kiat. He is your boss and is the person talking to you now. When he starts a conversation you walk over to his room and talk face to face.

${dataPart}

Reply as ${name} would to their boss: friendly, direct and brief. Lead with the answer. Most replies should be one to four sentences; go longer only when he asks for detail or the answer is a short list of figures. Your reply is shown in a small chat panel that displays plain text, so write plain sentences without markdown, headings, tables or bullet symbols. For several figures, put each on its own line as "Label: RM 123.45".

Today is ${todayInKualaLumpur()} (${isoDateInKualaLumpur()}). Right now you are ${activity}. Mention that only if it is relevant or he asks what you are doing.`;
}

const queryTool = betaTool({
  name: 'query_tracking_data',
  description:
    "Run one read-only SQL SELECT against the tracking application's Postgres database and get the rows back as JSON. Use it whenever the answer depends on his recorded expenses, income, budgets, bills, loans, investments, trips, tax relief, car servicing, workouts, meals, weight or steps. The tables and columns are described in the system prompt. Only a single SELECT (or WITH ... SELECT) statement is accepted, no semicolons, and at most 200 rows are returned, so aggregate in SQL where you can.",
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'A single PostgreSQL SELECT statement, for example: select category, sum(amount) from expenses where date >= \'2026-11-01\' group by category order by 2 desc',
      },
    },
    required: ['sql'],
    additionalProperties: false,
  },
  run: async (input) => runReadOnlyQuery(input?.sql),
});

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
  const hasData = dataConfigured();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const startBody = () => {
    if (res.headersSent) return;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
  };

  try {
    client ??= new Anthropic();

    // The data guide is identical for everyone, so it goes first and is cached;
    // the persona (who, what they are doing, today's date) follows it.
    const system = hasData
      ? [
          { type: 'text', text: DATA_GUIDE, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: personaPrompt(body.staff, activity, true) },
        ]
      : personaPrompt(body.staff, activity, false);

    // The runner calls the model, runs any query it asks for, feeds the rows
    // back and repeats until the model answers. If a safety classifier declines
    // the request, `fallbacks` lets the API retry it on another model.
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      tools: hasData ? [queryTool] : [],
      messages: body.messages.map(({ role, content }) => ({ role, content })),
      stream: true,
      max_iterations: MAX_TOOL_ROUNDS,
    });

    let wroteText = false;
    let refused = false;
    for await (const messageStream of runner) {
      let startedThisRound = false;
      for await (const event of messageStream) {
        if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
        if (closed) continue;
        startBody();
        // Separate anything said before a look-up from what follows it.
        if (!startedThisRound && wroteText) res.write('\n\n');
        startedThisRound = true;
        wroteText = true;
        res.write(event.delta.text);
      }
      const message = await messageStream.finalMessage();
      if (message.stop_reason === 'refusal') {
        refused = true;
        break;
      }
    }

    if (!wroteText && !closed) {
      startBody();
      res.write(refused ? "Sorry boss, that's not something I can help with." : '(No reply.)');
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
