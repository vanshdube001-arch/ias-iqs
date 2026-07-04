// Generates today's 15 UPSC current-affairs MCQs via the Grok (xAI) API
// and upserts them into the Supabase `questions_daily` table.
//
// Required environment variables (set as GitHub Actions secrets):
//   XAI_API_KEY                — your Grok API key
//   SUPABASE_URL               — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service_role key (Project Settings → API)
//                                 NOT the anon key — this one bypasses RLS
//                                 so the cron can write questions_daily.

import { createClient } from '@supabase/supabase-js';

const XAI_API_KEY = process.env.XAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!XAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing one of XAI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const SYSTEM_PROMPT = `You are a UPSC (Indian Civil Services) current-affairs question setter,
writing in the exact style of "The Hindu" daily MCQ practice sets.

Generate exactly 15 multiple-choice questions based on genuinely current, real news from the
last few days, covering a healthy mix of: polity & governance, economy, environment & ecology,
science & tech, international relations, defence & security, and schemes/reports in the news.

Return ONLY a raw JSON array (no markdown fences, no commentary) of 15 objects, each with this
EXACT shape:

{
  "number": "Question <N> of 15",
  "text": "<question stem, may start with 'Consider the following statements regarding ...'>",
  "statements": ["<statement 1>", "<statement 2>", "..."]   // use [] if not a statement-based question
  "followup": "Which of the statements given above is/are correct?"  // use "" if not applicable
  "options": [["A","..."],["B","..."],["C","..."],["D","..."]],
  "correct": "A" | "B" | "C" | "D",
  "correctText": "A) <full text of correct option>",
  "explanation": "<strong>Explanation:</strong> 2-4 sentences explaining why the correct answer is
                   correct and briefly why the others are wrong, in the tone of a UPSC coaching note."
}

Rules:
- Mix statement-based questions (2-3 statements) with direct one-line questions, like a real
  UPSC prelims-style set.
- Facts must be accurate and genuinely current — do not invent events.
- Vary correct answers across A/B/C/D, don't cluster on one option.
- "number" fields must read "Question 1 of 15" through "Question 15 of 15" in order.`;

async function generateQuestions() {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'grok-4-fast',                 // adjust to whichever Grok model your key has access to
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Generate today's (${today}) set of 15 questions now. Return raw JSON array only.` }
      ],
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Grok API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Could not parse Grok response as JSON:\n' + raw);
  }

  if (!Array.isArray(questions) || questions.length !== 15) {
    throw new Error(`Expected 15 questions, got ${Array.isArray(questions) ? questions.length : typeof questions}`);
  }

  return questions;
}

async function main() {
  console.log(`Generating questions for ${today}...`);
  const questions = await generateQuestions();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from('questions_daily')
    .upsert({ date: today, questions }, { onConflict: 'date' });

  if (error) throw error;
  console.log(`✅ Saved ${questions.length} questions for ${today} to Supabase.`);
}

main().catch(err => {
  console.error('❌ Failed:', err.message || err);
  process.exit(1);
});
