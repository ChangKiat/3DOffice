import postgres from 'postgres';

// Read-only access to the tracking application's database (the Supabase
// Postgres shared by the Dashboard and the Telegram AI Agent).
//
// The staff can only read: every query runs inside a READ ONLY transaction
// with a time limit and a row limit, and only single SELECT statements on the
// public tables are accepted.

const MAX_ROWS = 200;
const MAX_RESULT_CHARS = 30_000;
const MAX_SQL_LENGTH = 4000;
const TIMEOUT = '8s';

let sql = null;

export const dataConfigured = () => Boolean(process.env.DATABASE_URL);

function connection() {
  if (sql) return sql;
  const url = new URL(process.env.DATABASE_URL);

  // Supabase's session pooler (port 5432) has only 15 slots, shared with the
  // Dashboard and the bot. The transaction pooler (6543) on the same host does
  // not have that limit, so use it and keep a single connection.
  if (url.hostname.endsWith('pooler.supabase.com') && url.port === '5432') url.port = '6543';

  sql = postgres(url.toString(), {
    max: 1,
    prepare: false, // required by the transaction pooler
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return sql;
}

// Returns a reason the query is not allowed, or null when it is acceptable.
function rejectReason(query) {
  if (query.length > MAX_SQL_LENGTH) return 'The query is too long.';
  if (!/^\s*(select|with)\b/i.test(query)) return 'Only SELECT queries are allowed.';
  if (query.includes(';')) return 'Send one statement only, without semicolons.';
  if (/\btax_relief_receipts\b/i.test(query)) return 'Receipt files are not available; use tax_relief_claims.';
  if (/\b(pg_\w*|information_schema|auth|storage|vault|extensions|dblink\w*|lo_\w+)\b\s*[.(]/i.test(query)) {
    return 'Only the tracking tables in the public schema can be queried.';
  }
  return null;
}

// Runs one read-only query and returns the result as text for the model.
export async function runReadOnlyQuery(rawQuery) {
  if (typeof rawQuery !== 'string' || rawQuery.trim() === '') return 'Error: no SQL was given.';
  const query = rawQuery.trim().replace(/;\s*$/, '');
  const reason = rejectReason(query);
  if (reason) return `Error: ${reason}`;

  try {
    const rows = await connection().begin('read only', async (tx) => {
      await tx.unsafe(`set local statement_timeout = '${TIMEOUT}'`);
      await tx.unsafe('set local search_path = public');
      // The newline keeps a trailing "--" comment from swallowing the wrapper.
      return tx.unsafe(`select * from (${query}\n) as result limit ${MAX_ROWS + 1}`);
    });

    const truncated = rows.length > MAX_ROWS;
    const shown = truncated ? rows.slice(0, MAX_ROWS) : rows;
    let text = JSON.stringify(shown);
    if (text.length > MAX_RESULT_CHARS) {
      return `Error: the result is too large (${rows.length} rows). Select fewer columns, aggregate, or add a tighter filter.`;
    }
    if (truncated) text += `\n(Only the first ${MAX_ROWS} rows are shown. Aggregate or filter to see the rest.)`;
    return `${shown.length} row(s):\n${text}`;
  } catch (error) {
    return `Error: the query failed: ${error.message}`;
  }
}

// What the tables hold, written for the model. Keep this text stable: it is
// the cached part of the system prompt.
export const DATA_GUIDE = `# The tracking application's data

The office works for Chang Kiat's personal tracking application: a personal finance and health tracker for one person (Chang Kiat himself), based in Malaysia. Money is in MYR (write amounts as "RM 1,234.50") unless a row says otherwise, and dates are in the Asia/Kuala_Lumpur timezone. Entries are logged through a Telegram bot and a web Dashboard; both write to the Postgres database you can read with the query_tracking_data tool.

All date columns are text in YYYY-MM-DD form (compare them as strings, e.g. date >= '2026-11-01' and date < '2026-12-01'). Amount columns are numeric. The database is read-only for you.

## Money

expenses(id, date, amount, currency, category, description, payment_method, trip_id, trip_leg, fx_amount, fx_currency, fx_rate, created_at)
  Every purchase or payment. category is one of the budget categories such as Food, Drink, Transport, Shopping, Entertainment, Utility, Insurance, Loan, Investment, Travel, Bank charges, Other. payment_method is the name of the account or card used (see payment_accounts.name). fx_* hold the original foreign amount for overseas spending.

incomes(id, date, amount, currency, category, description, source, expense_id, payment_method, from_payment_method, transfer_fee, rebate_account_id, rebate_period_month, rebate_category, created_at)
  Money received. category is one of Salary, Claim, Transfer, Cashback, Interest, Other, or "Account transfer".
  - category = 'Account transfer' is money moved between his own accounts (from_payment_method to payment_method), such as paying off a credit card or funding an investment. It is not real income: leave it out of income totals.
  - A row with expense_id set and category 'Transfer' or 'Claim' is someone paying him back for that expense (a shared bill or a claim). His net spend on that expense is the expense amount minus those rows.

budgets(id, category, monthly_budget, currency)
  The monthly budget for each expense category.

fixed_expenses(id, day_of_month, amount, frequency_months, currency, category, description, start_month, interval_days, interval_start_date, active, payment_method, to_investment_account, instrument_id, loan_method, original_principal, remaining_principal, annual_rate_pct, tenure_months, loan_start_date, created_at)
  Recurring bills, subscriptions, regular investments and loans. active = true means it still applies. Loan rows carry the principal, rate and tenure.

loan_payments(id, fixed_expense_id, expense_id, date, installment, interest_amount, principal_amount, remaining_after, created_at)
  Each loan instalment, split into interest and principal.

payment_accounts(id, name, account_type, initial_balance, balance_baseline_date, credit_limit, statement_day, rebate_config, active, created_at)
  Bank accounts, e-wallets, credit cards and investment accounts. account_type is 'account' (debit), 'credit' or 'investment'. Current balances are not stored here: the Dashboard works them out from every transaction with rules for transfers, fees and holdings. Do not try to reproduce that. If he asks for an account balance or how much is owed on a card, tell him the Income tab of the Dashboard shows it, and offer what you can read directly (recent transactions on the account, totals in and out for a period).

interest_schedules(id, payment_method, frequency, day_of_month, annual_rate_pct, fixed_amount, currency, description, active, created_at)
  Interest that accounts earn on a schedule.

investment_instruments(id, payment_account_id, kind, symbol, name, currency, last_price, last_price_at, principal, annual_rate_pct, start_date, maturity_date, active, created_at)
investment_events(id, instrument_id, event_type, date, quantity, unit_price, amount, realized_gain, notes, linked_income_id, linked_expense_id, created_at)
investment_lots(id, instrument_id, opened_at, quantity, remaining_qty, unit_cost, buy_event_id, created_at)
  Holdings inside investment accounts, their buys, sells and other events, and the open lots.

trips(id, name, start_date, end_date, trip_currency, notes, created_at)
  Trips. Expenses on a trip have expenses.trip_id set.

tax_relief_claims(id, year, date, category, description, amount, notes, created_at)
  Items he can claim as income tax relief for a tax year.

car_service_visits(id, date, odometer_km, notes, created_at)
car_service_items(id, visit_id, category, description, amount, created_at)
  Car servicing history and what each visit cost.

## Health

workouts(id, date, exercise, sets, reps, weight_kg, weights_kg, duration_min, notes, calories_burned, fat_burned_g, session_id, session_label, superset_group, created_at)
  One row per exercise performed. Rows with the same session_id belong to one gym session.

meals(id, date, meal_type, description, protein_g, carbs_g, fat_g, calories, created_at)
  Each meal with its macros.

user_settings(daily_protein_target_g, daily_calorie_target, daily_carbs_target_g, daily_fat_target_g, timezone, salary_after_tax, body_weight_kg, height_cm, age, sex)
  One row: his nutrition targets, monthly salary after tax and body details.

body_weight_logs(id, date, weight_kg, created_at)
daily_activity_logs(id, date, steps, created_at)
  Daily weigh-ins and step counts.

## Working with the data

- Look things up before answering a question about his records. Do not guess a figure: if a query returns nothing, say there are no records for that.
- Prefer aggregate queries (sum, count, group by) over pulling many rows. At most 200 rows come back.
- Category and account names vary in spelling and case, so check the distinct values (or match with ILIKE) when a filter finds nothing.
- If a query fails, read the error, fix the SQL and try again.
- State the period your answer covers when it matters ("so far this month", "in October").`;
