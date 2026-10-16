// AI interpretation layer. Receives the structured statistics from analytics.js
// and turns them into human insights. Uses Claude when ANTHROPIC_API_KEY is set,
// otherwise a built-in rule-based interpreter produces the same shape of output.

import crypto from 'node:crypto';

const hm = m => {
  if (m == null) return '—';
  const t = Math.round(m), h = Math.floor(t / 60), r = t % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};
const hrs = h => hm(h * 60);

/* ---------------- Rule-based interpreter ---------------- */

function rulesDay(s) {
  const out = { headline: '', observations: [], patterns: [], suggestions: [] };
  const label = s.is_today ? "Today's analysis" : `Analysis for ${s.date}`;
  if (!s.total_tracked_min) {
    out.headline = `${label}: nothing tracked yet`;
    out.suggestions.push('Add a few sessions in the Time Tracker (or start a timer) and come back for insights.');
    return out;
  }
  out.headline = label;
  if (s.focus_time_min) out.observations.push(`You spent ${hm(s.focus_time_min)} on focused work (study + work).`);
  out.observations.push(`You tracked ${hm(s.total_tracked_min)} in total across ${s.by_category.filter(c => c.minutes > 0).length} categories.`);
  if (s.most_consistent_activity && s.most_consistent_activity.sessions > 1) {
    out.observations.push(`${s.most_consistent_activity.category} was your most consistent activity (${s.most_consistent_activity.sessions} sessions, ${hm(s.most_consistent_activity.minutes)}).`);
  }
  if (s.longest_session) out.observations.push(`Your longest uninterrupted session was ${hm(s.longest_session.minutes)} of ${s.longest_session.category} (${s.longest_session.from}–${s.longest_session.to}).`);
  if (s.largest_gap && s.largest_gap.minutes >= 60) out.observations.push(`You had a ${hm(s.largest_gap.minutes)} gap between ${s.largest_gap.from} and ${s.largest_gap.to}.`);
  if (s.goals.categories_with_goal) out.observations.push(`You met ${s.goals.goals_met} of ${s.goals.categories_with_goal} daily goals.`);

  const ev = s.early_vs_late;
  if (ev.avg_session_before_10am_min && ev.avg_session_after_10am_min) {
    if (ev.avg_session_before_10am_min > ev.avg_session_after_10am_min * 1.2) {
      out.patterns.push(`Your sessions are longer when you start before 10 AM (${hm(ev.avg_session_before_10am_min)} vs ${hm(ev.avg_session_after_10am_min)} on average).`);
      out.suggestions.push('Try scheduling your hardest task between 9–11 AM.');
    } else if (ev.avg_session_after_10am_min > ev.avg_session_before_10am_min * 1.2) {
      out.patterns.push(`Your later sessions run longer than early ones (${hm(ev.avg_session_after_10am_min)} vs ${hm(ev.avg_session_before_10am_min)}).`);
      out.suggestions.push('You seem to warm up as the day goes on — keep mornings for lighter tasks and plan deep work after 10 AM.');
    }
  }
  const topBlock = [...s.start_time_distribution].sort((a, b) => b.minutes - a.minutes)[0];
  if (topBlock?.minutes) out.patterns.push(`Most of your productive time happened in the ${topBlock.block.split(' (')[0].toLowerCase()} (${hm(topBlock.minutes)}).`);
  if (s.break_frequency >= 2) out.patterns.push(`You took ${s.break_frequency} breaks averaging ${hm(s.average_break_min)}.`);
  if (s.timer.abandoned) out.patterns.push(`You stopped ${s.timer.abandoned} of ${s.timer.timer_sessions} timers early, usually after about ${hm(s.timer.median_minutes_before_abandoning)}.`);

  const missed = s.goals.missed.sort((a, b) => b.short_by_min - a.short_by_min)[0];
  if (missed && missed.short_by_min > 0) out.suggestions.push(`You were ${hm(missed.short_by_min)} short on ${missed.category}. Start it earlier tomorrow so it doesn't get squeezed.`);
  if (s.largest_gap && s.largest_gap.minutes >= 90) out.suggestions.push(`Turn part of the ${s.largest_gap.from}–${s.largest_gap.to} gap into a short planned block (even 30 minutes).`);
  if (s.longest_session && s.longest_session.minutes < 40 && s.productive_session_count >= 2) out.suggestions.push('Your sessions are short. Try one uninterrupted 45–60 minute block tomorrow.');
  if (!out.suggestions.length) out.suggestions.push('Good balance today. Repeat the same structure tomorrow and watch your streaks grow.');
  return out;
}

function rulesRange(s) {
  const out = { headline: '', observations: [], patterns: [], suggestions: [] };
  const label = `Insight for the last ${s.period.days} days`;
  if (!s.total_tracked_hours) {
    out.headline = `${label}: no data yet`;
    out.suggestions.push('Track a few days of sessions to unlock weekly patterns.');
    return out;
  }
  out.headline = label;
  const pva = s.planned_vs_actual_focus;
  if (pva.planned_hours) out.observations.push(`You planned ${hrs(pva.planned_hours)} of focused work but completed ${hrs(pva.actual_hours)} (${pva.completion_pct}%).`);
  else out.observations.push(`You tracked ${hrs(s.focus_hours)} of focused work and ${hrs(s.total_tracked_hours)} overall.`);
  if (s.most_consistent_category) out.observations.push(`Your strongest consistency was in ${s.most_consistent_category.category} (active ${s.most_consistent_category.days_active} of ${s.most_consistent_category.of_days} days).`);
  if (s.average_session_min) out.observations.push(`Average session: ${hm(s.average_session_min)}. Longest: ${hm(s.longest_session.minutes)} of ${s.longest_session.category} on ${s.longest_session.date}.`);
  if (s.change_vs_previous_pct != null) out.observations.push(`Focus time is ${s.change_vs_previous_pct >= 0 ? 'up' : 'down'} ${Math.abs(s.change_vs_previous_pct)}% compared with the previous ${s.period.days} days.`);

  if (s.most_productive_window) out.patterns.push(`Most productive window: ${s.most_productive_window.from} – ${s.most_productive_window.to}. Least productive: ${s.least_productive_window.from} – ${s.least_productive_window.to}.`);
  const blocks = Object.fromEntries(s.start_time_distribution.map(b => [b.key, b]));
  if (blocks.morning.avg_session_min && blocks.afternoon.avg_session_min) {
    const m = blocks.morning.avg_session_min, a = blocks.afternoon.avg_session_min;
    if (m > a * 1.25) out.patterns.push(`Your afternoon sessions were significantly shorter than your morning sessions (${hm(a)} vs ${hm(m)}).`);
    else if (a > m * 1.25) out.patterns.push(`Your afternoon sessions ran longer than your morning ones (${hm(a)} vs ${hm(m)}).`);
  }
  if (s.timer.abandoned >= 2 && s.timer.median_minutes_before_abandoning) out.patterns.push(`You tend to abandon timed sessions after ~${hm(s.timer.median_minutes_before_abandoning)}.`);
  const long = s.timer.completion_by_planned_length.find(b => b.planned === 'over 90 min');
  const short = s.timer.completion_by_planned_length.find(b => b.planned === 'up to 45 min');
  if (long && short && long.completion_rate < short.completion_rate - 20) out.patterns.push(`Timers over 90 min are completed ${long.completion_rate}% of the time vs ${short.completion_rate}% for short ones.`);
  if (s.daily_consistency.active_focus_days < s.period.days) out.patterns.push(`You did focused work on ${s.daily_consistency.active_focus_days} of ${s.period.days} days.`);

  if (s.most_productive_window) out.suggestions.push(`Put difficult subjects in your ${s.most_productive_window.from}–${s.most_productive_window.to} block and reserve ${s.least_productive_window.from}–${s.least_productive_window.to} for lighter tasks.`);
  if (long && long.completion_rate < 60) out.suggestions.push('Split long sessions into 60–75 minute blocks with a 10-minute break in between.');
  if (pva.completion_pct != null && pva.completion_pct < 80) out.suggestions.push('Your plan is ahead of your reality. Lower the daily goal a little or protect one extra hour each day.');
  const weak = s.streaks.filter(x => x.current_days === 0 && x.best_days > 0)[0];
  if (weak) out.suggestions.push(`Rebuild your ${weak.category} streak — your best was ${weak.best_days} days.`);
  if (!out.suggestions.length) out.suggestions.push('Keep the same rhythm next week — your numbers are steady.');
  return out;
}

export function rulesInterpret(kind, stats) {
  return { ...(kind === 'day' ? rulesDay(stats) : rulesRange(stats)), source: 'rules' };
}

/* ---------------- Claude interpreter ---------------- */

const cache = new Map(); // hash(stats) -> { at, value }
const TTL = 10 * 60 * 1000;

const SYSTEM = `You are the analyst inside a personal time-tracking app.
You receive statistics that the app's analytics engine has ALREADY computed from the user's tracked sessions.
Do not recompute or invent numbers: only use values present in the JSON. Durations are in minutes unless the key says hours.
"focus" means study + work categories. The "rest" group (e.g. sleep) is excluded from productivity metrics.
Write short, specific, friendly insights in plain English, quoting concrete numbers and times.
Respond with ONLY a JSON object, no markdown fences, of the form:
{"headline": string, "observations": string[], "patterns": string[], "suggestions": string[]}
Use 3-5 observations, 1-3 patterns ("Pattern detected: ..." style, only if supported by the data), and 1-3 actionable suggestions.
If there is little or no data, say so briefly and suggest what to track.`;

export async function interpret(kind, stats) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return rulesInterpret(kind, stats);

  const { timeline, ...forModel } = stats; // the raw timeline isn't needed; keep the prompt to features
  const payload = JSON.stringify(forModel);
  const h = crypto.createHash('sha1').update(kind + payload).digest('hex');
  const hit = cache.get(h);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 1000, system: SYSTEM,
        messages: [{ role: 'user', content: `Statistics (${kind === 'day' ? 'single day' : `last ${stats.period.days} days`}):\n${payload}` }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const json = JSON.parse(text.replace(/^```(json)?|```$/gm, '').trim());
    const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 6) : []);
    const value = {
      headline: String(json.headline || ''), observations: arr(json.observations),
      patterns: arr(json.patterns), suggestions: arr(json.suggestions), source: 'claude', model,
    };
    cache.set(h, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.warn('[AI] falling back to rule-based insights:', e.message);
    return { ...rulesInterpret(kind, stats), note: 'AI service unavailable — showing built-in insights.' };
  }
}
