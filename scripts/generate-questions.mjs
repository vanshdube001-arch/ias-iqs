// ============================================================
// IAS IQ — Daily question generator (powered by Groq's API)
//
// Reads three env vars (set as GitHub Actions secrets, or in a
// local untracked .env when run manually):
//   GROQ_API_KEY               - from https://console.groq.com/keys
//   SUPABASE_URL                - same project URL as config.js
//   SUPABASE_SERVICE_ROLE_KEY   - Project Settings -> API (NEVER put this in config.js)
//
// Usage:
//   node scripts/generate-questions.mjs            -> generates for today (IST)
//   node scripts/generate-questions.mjs 2026-07-05  -> generates for a specific date
// ============================================================

import { createClient } from '@supabase/supabase-js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

if (!GROQ_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing one of GROQ_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

// Target date: CLI arg, else "today" in IST
function todayIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.toISOString().slice(0, 10);
}
const targetDate = process.argv[2] || todayIST();

const SYSTEM_PROMPT = `You are a question-setter for a UPSC (Indian Civil Services) Prelims daily-practice app.
You write General Studies MCQs based on current affairs from the last few days, in the same spirit as The Hindu's
daily news coverage (polity, economy, environment, science & tech, international relations, government schemes,
defence, geography, culture).

Respond with ONLY a raw JSON array (no markdown fences, no commentary, no leading/trailing text) of exactly 15
question objects. Each object MUST have exactly this shape:

{
  "number": "Question 1 of 15",
  "text": "Consider the following statements ... OR a direct factual question",
  "statements": ["statement 1", "statement 2"],   // use [] (empty array) for direct factual questions with no statements
  "followup": "Which of the statements given above is/are correct?",  // use "" if there are no statements
  "options": [["A","option text"], ["B","option text"], ["C","option text"], ["D","option text"]],
  "correct": "C",
  "correctText": "C) option text",
  "explanation": "<strong>Explanation:</strong> 2-4 sentences explaining the correct answer and relevant context."
}

Rules:
- "number" must read "Question N of 15" for N = 1..15 in order.
- Mix statement-based ("Only 1" / "Only 2" / "Both 1 and 2" / "Neither 1 nor 2") and direct single-answer questions.
- Base every question on real, verifiable facts — do not invent schemes, numbers, or events.
- Keep each question self-contained and unambiguous, at UPSC Prelims difficulty.
- Output must be valid JSON — double-check brackets, quotes, and commas before responding.`;

const USER_PROMPT = `Generate today's (${targetDate}) set of 15 UPSC Prelims-style current affairs MCQs, covering a good mix of topics from recent Indian and international news relevant to UPSC preparation.`;

async function callGroq() {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.7,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT }
      ]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Groq API returned no content: ' + JSON.stringify(data));

  const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Could not parse Groq response as JSON:\n' + cleaned);
  }

  if (!Array.isArray(questions) || questions.length !== 15) {
    throw new Error(`Expected an array of 15 questions, got ${Array.isArray(questions) ? questions.length : typeof questions}`);
  }

  for (const [i, q] of questions.entries()) {
    const required = ['number', 'text', 'options', 'correct', 'correctText', 'explanation'];
    for (const field of required) {
      if (!(field in q)) throw new Error(`Question ${i + 1} is missing required field "${field}"`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question ${i + 1} has invalid options`);
    }
  }

  return questions;
}

async function main() {
  console.log(`Generating questions for ${targetDate} using Groq model "${GROQ_MODEL}"...`);
  const questions = await callGroq();
  console.log(`Got ${questions.length} questions back. Upserting into Supabase...`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from('questions_daily')
    .upsert({ date: targetDate, questions }, { onConflict: 'date' });

  if (error) {
    console.error('Supabase upsert failed:', error);
    process.exit(1);
  }

  console.log(`Done. ${targetDate}'s test is live with ${questions.length} questions.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
