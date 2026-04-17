// ─── AI Interview Platform — Backend ─────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory session store
const interviewSessions = {};

// ─── Build Interviewer System Prompt ─────────────────────────────────────────
function buildSystemPrompt(config) {
  const { role, company, experience, domain, interviewerName } = config;

  return `You are ${interviewerName}, a senior ${domain} interviewer at ${company || 'a top company'}. You are conducting a job interview for the position of "${role}" for a candidate with ${experience} of experience.

INTERVIEW RULES — Follow strictly:
1. Ask ONE question at a time. Wait for the answer before asking next.
2. Ask 8-10 questions total. Mix of: introduction, behavioral (HR), technical/domain, situational, and closing questions.
3. Start with: "Good morning/afternoon. I'm ${interviewerName}. Please take a seat. Tell me about yourself."
4. Be professional, formal, and realistic. Not too friendly, not rude.
5. React briefly to answers (1 line max) — like a real interviewer would: "Interesting.", "I see.", "Good." — then ask next question.
6. Ask natural follow-up questions when an answer is vague or interesting.
7. NEVER give feedback, scores, or encouragement during the interview.
8. Keep track of question count internally.
9. When you have asked 8-10 questions and candidate has answered, say exactly: "Thank you for your time. That concludes our interview. We will get back to you. [END_INTERVIEW]"

QUESTION TYPES TO COVER:
- Self introduction
- Why this role / Why this company
- Key skills & experience
- A challenging situation they handled (behavioral)
- Technical/domain question relevant to "${role}"
- Teamwork or leadership scenario
- Weakness or area of improvement
- Where do they see themselves in 5 years
- Salary expectation or notice period (if relevant)
- Do they have questions for you

TONE: Professional. Formal. Realistic. Indian corporate context if applicable.
LANGUAGE: English only. Clear and concise.

Remember: You are the interviewer. The user is the candidate. Stay in character throughout.`;
}

// ─── Build Report Prompt ──────────────────────────────────────────────────────
function buildReportPrompt(config, conversation) {
  const { role, company, experience, domain } = config;
  const transcript = conversation
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');

  return `You just conducted an interview for the role of "${role}" at ${company || 'a company'} for a candidate with ${experience} experience in ${domain}.

Here is the complete interview transcript:
---
${transcript}
---

Generate a detailed, honest, and actionable interview performance report in the following JSON format ONLY (no extra text):

{
  "overallScore": <number 1-100>,
  "grade": "<A/B/C/D/F>",
  "verdict": "<Shortlisted / On Hold / Rejected>",
  "summary": "<2-3 line overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "questionAnalysis": [
    {
      "question": "<interviewer question>",
      "candidateAnswer": "<brief summary of what candidate said>",
      "score": <1-10>,
      "feedback": "<specific feedback on this answer>",
      "betterAnswer": "<example of a stronger answer>"
    }
  ],
  "skillScores": {
    "communication": <1-10>,
    "technicalKnowledge": <1-10>,
    "problemSolving": <1-10>,
    "confidence": <1-10>,
    "clarity": <1-10>
  },
  "improvementPlan": ["<tip 1>", "<tip 2>", "<tip 3>", "<tip 4>"],
  "nextSteps": "<what candidate should do to improve before next interview>"
}`;
}

// ─── Start Interview ──────────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  try {
    const { role, company, experience, domain, candidateName } = req.body;

    if (!role || !domain) {
      return res.json({ success: false, error: 'Role aur domain required hai' });
    }

    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const interviewerNames = ['Rahul Sharma', 'Priya Mehta', 'Ankit Gupta', 'Sneha Reddy', 'Vikram Nair'];
    const interviewerName  = interviewerNames[Math.floor(Math.random() * interviewerNames.length)];

    const config = { role, company: company || 'our company', experience: experience || 'fresher', domain, candidateName, interviewerName };

    interviewSessions[sessionId] = {
      config,
      conversation: [],
      questionCount: 0,
      startTime: Date.now(),
      ended: false
    };

    // Get first message from AI
    const systemPrompt = buildSystemPrompt(config);
    const firstResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Start the interview now.' }]
    });

    const firstMessage = firstResponse.content[0].text;
    interviewSessions[sessionId].conversation.push(
      { role: 'user',      content: 'Start the interview now.' },
      { role: 'assistant', content: firstMessage }
    );

    res.json({
      success: true,
      sessionId,
      interviewerName,
      message: firstMessage,
      questionCount: 1
    });

  } catch(e) {
    console.error('Interview start error:', e.message);
    res.json({ success: false, error: 'Server error. Try again.' });
  }
});

// ─── Send Answer, Get Next Question ──────────────────────────────────────────
router.post('/answer', async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    const session = interviewSessions[sessionId];

    if (!session) return res.json({ success: false, error: 'Session not found' });
    if (session.ended) return res.json({ success: false, error: 'Interview already ended' });

    // Add candidate answer
    session.conversation.push({ role: 'user', content: answer });

    const systemPrompt = buildSystemPrompt(session.config);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: session.conversation
    });

    const aiMessage = response.content[0].text;
    session.conversation.push({ role: 'assistant', content: aiMessage });
    session.questionCount++;

    const isEnded = aiMessage.includes('[END_INTERVIEW]');
    if (isEnded) session.ended = true;

    res.json({
      success: true,
      message: aiMessage.replace('[END_INTERVIEW]', '').trim(),
      ended: isEnded,
      questionCount: session.questionCount
    });

  } catch(e) {
    console.error('Interview answer error:', e.message);
    res.json({ success: false, error: 'Server error. Try again.' });
  }
});

// ─── Generate Report ──────────────────────────────────────────────────────────
router.post('/report', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = interviewSessions[sessionId];

    if (!session) return res.json({ success: false, error: 'Session not found' });

    const reportPrompt = buildReportPrompt(session.config, session.conversation);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: reportPrompt }]
    });

    const rawText = response.content[0].text.trim();
    // Extract JSON
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Report JSON not found');

    const report = JSON.parse(jsonMatch[0]);
    report.duration    = Math.floor((Date.now() - session.startTime) / 60000);
    report.role        = session.config.role;
    report.company     = session.config.company;
    report.domain      = session.config.domain;
    report.candidateName = session.config.candidateName || 'Candidate';
    report.interviewerName = session.config.interviewerName;
    report.date        = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

    // Clean up session
    delete interviewSessions[sessionId];

    res.json({ success: true, report });

  } catch(e) {
    console.error('Report error:', e.message);
    res.json({ success: false, error: 'Report generation failed. Try again.' });
  }
});

module.exports = { router };
