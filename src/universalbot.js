// ─── LeadPilot — Universal Bot Engine ────────────────────────────────────────
// One engine for all clients. Add new client in config/clients.js only.

const express = require('express');
const path    = require('path');
const router  = express.Router();
const { MessagingResponse } = require('twilio').twiml;
const clients = require('../config/clients');
const { saveUniversalLead, getUniversalLeads } = require('./sheets');

// ─── Session Store ────────────────────────────────────────────────────────────
const sessions     = {};  // { phone_clientId: session }
const lastInquiry  = {};  // { phone_clientId: { ...lead, timestamp } }

function sessionKey(phone, clientId) { return `${phone}__${clientId}`; }

function getSession(phone, clientId) {
  const k = sessionKey(phone, clientId);
  if (!sessions[k]) sessions[k] = { step: 'start', phone, clientId, flowIndex: -1 };
  return sessions[k];
}

// ─── Twilio Helper ────────────────────────────────────────────────────────────
function getTwilio() {
  return require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ─── Alert Owner ──────────────────────────────────────────────────────────────
async function alertOwner(client, session) {
  try {
    const score  = session.score || 0;
    const isHot  = score >= 4;
    const fields = client.flow.map(f => `${f.key}: ${session[f.key] || '—'}`).join('\n');
    const script = client.followUpMessages?.[3]?.(session) || `Namaste ${session.name} ji, follow up karo!`;

    await getTwilio().messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to:   `whatsapp:${client.ownerPhone}`,
      body: `${isHot ? '🔥 HOT LEAD' : '🆕 NAYA LEAD'} — ${client.name}\n\n${fields}\n⭐ Score: ${score}/5\n\n💡 3-Din Follow-Up:\n${script}`
    });
  } catch(e) { console.log(`[${client.id}] Alert error:`, e.message); }
}

// ─── Follow-Up Sender (called by scheduler) ───────────────────────────────────
async function sendFollowUp(client, lead, day) {
  try {
    const msg = client.followUpMessages?.[day]?.(lead);
    if (!msg) return;
    await getTwilio().messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to:   `whatsapp:${lead.phone}`,
      body: msg
    });
    console.log(`[${client.id}] Follow-up day ${day} sent to ${lead.phone}`);
    return true;
  } catch(e) {
    console.log(`[${client.id}] Follow-up error (day ${day}):`, e.message);
    return false;
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────
async function handleMessage(phone, body, session, client) {
  const text = body.toLowerCase().trim();
  const flow = client.flow;

  // Returning customer check
  const prevKey = sessionKey(phone, client.id);
  const prev    = lastInquiry[prevKey];
  const daysSince = prev ? Math.floor((Date.now() - new Date(prev.timestamp)) / 86400000) : 999;

  if (session.step === 'start') {
    if (prev && daysSince >= 7) {
      session.step = 'returning';
      session.name = prev.name;
      return `Namaste *${prev.name} ji*! 🎉 Wapas aaye — shukriya!\n\nPehle aapne *${prev[flow[2]?.key] || 'product'}* ke liye inquiry ki thi.\n\nKya phir se order karna hai?\n\n1️⃣ Haan, same order\n2️⃣ Naya order\n3️⃣ Offer / price janna hai`;
    }
    session.step    = 'greeting_sent';
    session.flowIdx = 0;
    return client.greeting;
  }

  if (session.step === 'returning') {
    if (text.includes('1') || text.includes('haan') || text.includes('same')) {
      // Copy previous answers, skip to last question
      Object.assign(session, prev);
      session.step    = 'flow';
      session.flowIdx = flow.length - 1;
      return flow[flow.length - 1].ask(session);
    }
    if (text.includes('3') || text.includes('price') || text.includes('offer')) {
      session.step = 'done';
      return `💰 *Current Offers — ${client.name}*\n\n🎁 Bulk order pe *15% OFF*\n🔸 Medium order pe *8% OFF*\n🚚 Free delivery\n\n📞 Best rate ke liye: *${client.ownerPhone}*`;
    }
    session.step = 'greeting_sent';
    session.flowIdx = 0;
    return client.greeting;
  }

  if (session.step === 'greeting_sent') {
    // First question (name) — validate
    const firstQ = flow[0];
    if (firstQ.validate && !firstQ.validate(body)) return firstQ.invalidMsg || 'Invalid input';
    session[firstQ.key] = firstQ.parse ? firstQ.parse(text, body) : body;
    session.step    = 'flow';
    session.flowIdx = 1;
    return flow[1].ask(session);
  }

  if (session.step === 'flow') {
    const idx  = session.flowIdx;
    const curr = flow[idx];
    // Parse and save current answer
    session[curr.key] = curr.parse ? curr.parse(text, body) : body;

    const nextIdx = idx + 1;
    if (nextIdx >= flow.length) {
      // All questions done
      session.score           = client.scoreCalc ? client.scoreCalc(session) : 3;
      session.timestamp       = new Date().toISOString();
      session.followUpStatus  = 'pending';
      session.step            = 'post_completion';

      // Save lead
      lastInquiry[prevKey] = { ...session };
      await alertOwner(client, session);
      await saveUniversalLead(client, session);

      return client.completionMsg(session);
    }

    session.flowIdx = nextIdx;
    return flow[nextIdx].ask(session);
  }

  if (session.step === 'post_completion') {
    if (text.includes('haan') || text.includes('yes') || text.includes('h')) {
      session.step = 'done';
      return `${client.followUpMessages?.[3]?.(session) || ''}\n\nHumari team jaldi contact karegi! 🙏`;
    }
    session.step = 'done';
    return `Shukriya *${session.name} ji*! Koi sawaal ho toh WhatsApp karein. 🙏`;
  }

  if (session.step === 'done') {
    session.step    = 'start';
    session.flowIdx = -1;
    return handleMessage(phone, body, session, client);
  }

  session.step    = 'start';
  session.flowIdx = -1;
  return handleMessage(phone, body, session, client);
}

// ─── Per-Client Routes ────────────────────────────────────────────────────────
Object.values(clients).forEach(client => {
  // Webhook
  router.post(`/${client.id}/webhook`, async (req, res) => {
    const twiml  = new MessagingResponse();
    const phone  = req.body.From || '';
    const body   = (req.body.Body || '').trim();
    console.log(`[${client.id}] MSG FROM: ${phone} | ${body}`);
    const session = getSession(phone, client.id);
    const reply   = await handleMessage(phone, body, session, client);
    twiml.message(reply);
    res.type('text/xml').send(twiml.toString());
  });

  // Leads API
  router.get(`/${client.id}/leads`, async (req, res) => {
    try {
      const real = await getUniversalLeads(client);
      const data = real.length > 0 ? real : getMockLeads(client);
      res.json({ success: true, client: client.name, leads: data, total: data.length, mock: real.length === 0 });
    } catch(e) {
      res.json({ success: true, leads: getMockLeads(client), total: 5, mock: true });
    }
  });

  // Dashboard
  router.get(`/${client.id}/dashboard`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'universal-dashboard.html'));
  });
});

// ─── Mock Data ────────────────────────────────────────────────────────────────
function getMockLeads(client) {
  const names  = ['Ramesh Gupta','Priya Sharma','Suresh Patel','Amit Joshi','Meena Verma'];
  const cities = ['Mumbai','Pune','Delhi','Nashik','Nagpur'];
  return names.map((name, i) => ({
    rowIndex: i + 2,
    timestamp:      new Date(Date.now() - (i+1)*86400000*(i+1)).toISOString(),
    phone:          `+9198765400${i+1}`,
    name,
    city:           cities[i],
    score:          [5,5,4,3,1][i],
    followUpStatus: ['pending','done','pending','pending','done'][i],
    followUpDay:    3,
    ...(client.flow.reduce((acc, f, fi) => {
      acc[f.key] = `Sample ${f.key} ${i+1}`;
      return acc;
    }, {}))
  }));
}

// ─── Clients List API ─────────────────────────────────────────────────────────
router.get('/clients', (req, res) => {
  res.json(Object.values(clients).map(c => ({
    id: c.id, name: c.name, emoji: c.emoji, color: c.color
  })));
});

module.exports = { router, sessions, sendFollowUp, clients };
