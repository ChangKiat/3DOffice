import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { dataGuide, dataConfigured, runReadOnlyQuery } from './data.js';

// POST /api/chat — lets the boss talk to the staff.
//
// Runs inside the Vite dev/preview server (see vite.config.js) so the API key
// and the database address stay on the server and never reach the browser.
//
// Each member of staff is in charge of one area and can only read that area's
// tables. There are two ways to talk:
//
//   One to one   { staff: "Azmir", activity, messages }
//     That person answers. Anything outside their area they must turn down.
//     Reply: plain text, streamed.
//
//   Meeting      { meeting: true, activities: { name: activity }, messages }
//     The boss speaks to the whole room. Whoever is in charge of the subject
//     answers (more than one person if it spans areas).
//     Reply: streamed text in which each speaker's part starts with
//     SPEAKER_START + name + SPEAKER_END.

const MODEL = 'claude-opus-5-5';
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 6000;
const MAX_BODY_BYTES = 300_000;
const MAX_TOOL_ROUNDS = 8;
const MAX_SPEAKERS = 3;
const SPEAKER_START = '\u001e';
const SPEAKER_END = '\u001f';
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

// Who the staff are, the one area each is in charge of, and the tables that
// area covers. Edit these to suit.
const STAFF = {
  Azmir: {
    role: 'the finance analyst',
    area: 'day-to-day money: spending, income, budgets and the payment accounts and cards',
    tables: ['expenses', 'incomes', 'budgets', 'payment_accounts', 'user_settings'],
  },
  Ken: {
    role: 'the investments and loans analyst',
    area: 'investments and loans: holdings and their buys and sells, interest earned, and loans and their repayments',
    tables: [
      'investment_instruments', 'investment_events', 'investment_lots',
      'interest_schedules', 'fixed_expenses', 'loan_payments', 'payment_accounts',
    ],
  },
  'Rong Zhao': {
    role: 'the health and fitness analyst',
    area: 'health and fitness: workouts, meals and macros, body weight and daily steps',
    tables: ['workouts', 'meals', 'body_weight_logs', 'daily_activity_logs', 'user_settings'],
  },
  'Chee Chong': {
    role: 'the operations executive',
    area: 'operations: recurring bills and their due dates, trips and what they cost, and car servicing',
    tables: ['fixed_expenses', 'trips', 'expenses', 'car_service_visits', 'car_service_items'],
  },
  Tracy: {
    role: 'the receptionist',
    area: 'tax relief claims and paperwork, and running the front desk',
    tables: ['tax_relief_claims'],
  },
};
const STAFF_NAMES = Object.keys(STAFF);

const whoDoesWhat = (except) =>
  STAFF_NAMES.filter((name) => name !== except)
    .map((name) => `${name} (${STAFF[name].area})`)
    .join('; ');

function todayInKualaLumpur() {
  const long = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'full' }).format(new Date());
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
  return `${long} (${iso})`;
}

// The part of the system prompt that says who the person is and how to answer.
function personaPrompt(name, { activity, hasData, meeting, saidAlready }) {
  const { role, area } = STAFF[name];

  const access = hasData
    ? `You are in charge of one area: ${area}. You can read that area's records with the query_tracking_data tool, and nothing else.`
    : `You are in charge of one area: ${area}. The connection to the tracking application's records is not set up on this computer, so you cannot look anything up right now; say so plainly if he asks for figures instead of making anything up.`;

  const setting = meeting
    ? `You are in a meeting in the meeting room with Chang Kiat, your boss, and the whole team. He has just spoken to the room, and you are answering because the subject falls in your area. Answer only the part that is yours. Your colleagues answer for their own areas: ${whoDoesWhat(name)}.${
        saidAlready ? `\n\nBefore you, in answer to the same question, this was said:\n${saidAlready}\nDo not repeat it; add your part.` : ''
      }`
    : `Chang Kiat, your boss, is talking to you one to one; you walked over to his room and are talking face to face.

Outside a meeting you only handle your own area. If he asks for something that belongs to another area, you have no right to look into it or answer it, even if you happen to know: tell him briefly that it is not yours, say who is in charge of it, and suggest he asks them or calls a meeting where the right person can answer. The others are: ${whoDoesWhat(name)}. Greetings, small talk and questions about you or your own work are fine.`;

  return `You are ${name}, ${role} in a small office run by Chang Kiat.

${access}

${setting}

Reply as ${name} would to their boss: friendly, direct and brief. Lead with the answer. Most replies should be one to four sentences; go longer only when he asks for detail or the answer is a short list of figures. Your reply is shown in a small chat panel that displays plain text, so write plain sentences without markdown, headings, tables or bullet symbols, and do not start with your own name. Refer to colleagues by name, not as he or she. For several figures, put each on its own line as "Label: RM 123.45".

Today is ${todayInKualaLumpur()}. Right now you are ${activity}. Mention that only if it is relevant or he asks what you are doing.`;
}

function queryToolFor(name) {
  const { tables } = STAFF[name];
  return betaTool({
    name: 'query_tracking_data',
    description: `Run one read-only SQL SELECT against the tracking application's Postgres database and get the rows back as JSON. Use it whenever the answer depends on his records in your area. You can read only these tables: ${tables.join(', ')}; they are described in the system prompt. Only a single SELECT (or WITH ... SELECT) statement is accepted, no semicolons, and at most 200 rows are returned, so aggregate in SQL where you can.`,
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'A single PostgreSQL SELECT statement over your own tables.',
        },
      },
      required: ['sql'],
      additionalProperties: false,
    },
    run: async (input) => runReadOnlyQuery(input?.sql, tables),
  });
}

let client = null;

// One person's reply. Streams text through `write` and returns the full text.
async function speak(name, { activity, messages, meeting = false, saidAlready = '', write }) {
  const hasData = dataConfigured();
  const persona = personaPrompt(name, { activity, hasData, meeting, saidAlready });

  // The data guide is the same on every turn for this person, so it goes
  // first and is cached; the persona (activity, date) follows it.
  const system = hasData
    ? [
        { type: 'text', text: dataGuide(STAFF[name].tables), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: persona },
      ]
    : persona;

  // The runner calls the model, runs any query it asks for, feeds the rows
  // back and repeats until the model answers. If a safety classifier declines
  // the request, `fallbacks` lets the API retry it on another model.
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    system,
    tools: hasData ? [queryToolFor(name)] : [],
    messages,
    stream: true,
    max_iterations: MAX_TOOL_ROUNDS,
  });

  let text = '';
  let refused = false;
  for await (const messageStream of runner) {
    let startedThisRound = false;
    for await (const event of messageStream) {
      if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
      // Separate anything said before a look-up from what follows it.
      const piece = (!startedThisRound && text ? '\n\n' : '') + event.delta.text;
      startedThisRound = true;
      text += piece;
      write(piece);
    }
    const message = await messageStream.finalMessage();
    if (message.stop_reason === 'refusal') {
      refused = true;
      break;
    }
  }

  if (!text) {
    text = refused ? "Sorry boss, that's not something I can help with." : '(No reply.)';
    write(text);
  }
  return text;
}

// In a meeting: who should answer what the boss just said?
async function chooseSpeakers(messages) {
  const recent = messages
    .slice(-6)
    .map((message) => `${message.role === 'user' ? 'Boss' : 'Staff'}: ${message.content}`)
    .join('\n\n');

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    ...FALLBACK,
    output_config: { effort: 'low' },
    system: `You decide who speaks next in an office meeting. The boss, Chang Kiat, has just spoken to the room. Each member of staff is in charge of one area:

${STAFF_NAMES.map((name) => `${name}: ${STAFF[name].area}`).join('\n')}

Pick who should answer the boss's latest message: the person in charge of what it is about. If it clearly spans more than one area, list each person needed, at most ${MAX_SPEAKERS}, in the order they should speak. If it is a follow-up, the person who was just speaking usually continues. For greetings, general remarks or anything that belongs to no area, pick Tracy, who hosts the meeting.

Reply with only the name or names, separated by commas.`,
    messages: [{ role: 'user', content: `The conversation so far:\n\n${recent}\n\nWho answers the boss's latest message?` }],
  });

  const answer = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ');
  // Keep the order the names appear in the answer.
  const picked = STAFF_NAMES.filter((name) => answer.includes(name))
    .sort((a, b) => answer.indexOf(a) - answer.indexOf(b))
    .slice(0, MAX_SPEAKERS);
  return picked.length > 0 ? picked : ['Tracy'];
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
  if (!body.meeting && !Object.hasOwn(STAFF, body.staff)) return 'Unknown staff member.';
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

const cleanActivity = (value, fallback) => (typeof value === 'string' ? value.slice(0, 200) : fallback);

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

  let closed = false;
  req.on('close', () => {
    closed = true;
  });
  const write = (text) => {
    if (closed) return;
    if (!res.headersSent) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.write(text);
  };

  const messages = body.messages.map(({ role, content }) => ({ role, content }));

  try {
    client ??= new Anthropic();

    if (body.meeting) {
      const speakers = await chooseSpeakers(messages);
      let saidAlready = '';
      for (const name of speakers) {
        if (closed) break;
        write(`${SPEAKER_START}${name}${SPEAKER_END}`);
        const text = await speak(name, {
          activity: cleanActivity(body.activities?.[name], 'sitting in a meeting in the meeting room'),
          messages,
          meeting: true,
          saidAlready,
          write,
        });
        saidAlready += `${saidAlready ? '\n\n' : ''}${name}: ${text}`;
      }
    } else {
      await speak(body.staff, {
        activity: cleanActivity(body.activity, 'at work in the office'),
        messages,
        write,
      });
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
