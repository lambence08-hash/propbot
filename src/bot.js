require('dotenv').config();
const express = require('express');
const path = require('path');
const { MessagingResponse } = require('twilio').twiml;
const sheets = require('./sheets');
const properties = require('../config/properties');
const { router: docbotRouter } = require('./docbot');
const { router: chembotRouter } = require('./chembot');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));
app.use('/docbot', docbotRouter);
app.use('/chem', chembotRouter);

// ─── In-memory session store ────────────────────────────────────────────────
const sessions = {};
function getSession(phone) {
  if (!sessions[phone]) sessions[phone] = { step: 'start', phone };
  return sessions[phone];
}

// ─── Lead Scoring ────────────────────────────────────────────────────────────
function calcLeadScore(s) {
  let score = 0;
  const budgetPts  = { under_50L: 0, '50L_1Cr': 1, '1Cr_2Cr': 2, above_2Cr: 3 };
  const timePts    = { immediate: 3, '1_3months': 2, '3_6months': 1, just_looking: 0 };
  const purposePts = { self_use: 2, investment: 1 };
  score += budgetPts[s.budget]   || 0;
  score += timePts[s.timeline]   || 0;
  score += purposePts[s.purpose] || 0;
  if (s.bookedVisit)     score += 3;
  if (s.requestedAgent)  score += 1;
  return Math.min(score, 10);
}
function getTemp(score) {
  if (score >= 7) return 'hot';
  if (score >= 4) return 'warm';
  return 'cold';
}
const tempLabel = { hot: '🔥 HOT', warm: '🌡️ WARM', cold: '❄️ COLD' };

// ─── Agent Notification (WhatsApp) ──────────────────────────────────────────
async function notifyAgent(session) {
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const agentNum = process.env.AGENT_PHONE || '+919999999999';
    const score    = session.leadScore;
    const temp     = session.leadTemp;
    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to:   `whatsapp:${agentNum}`,
      body: `🔔 *NEW ${tempLabel[temp]} LEAD*\n\n👤 ${session.name}\n📱 ${session.phone}\n💰 Budget: ${session.budget}\n🏠 BHK: ${session.bhk}\n📍 Location: ${session.location}\n⏰ Timeline: ${session.timeline || 'N/A'}\n📊 Score: ${score}/10\n\nReply fast — they're hot! 🚀`
    });
  } catch(e) { console.error('Agent notify error:', e.message); }
}

// ─── Message Handler ─────────────────────────────────────────────────────────
async function handleMessage(phone, body, session) {
  const text = body.toLowerCase().trim();
  const num  = body.trim();

  // Global reset
  if (['reset','menu','0','start'].includes(text)) {
    sessions[phone] = { step: 'start', phone };
    return welcome();
  }

  // ── start ──
  if (session.step === 'start') {
    session.step = 'ask_name';
    return welcome();
  }

  // ── ask_name ──
  if (session.step === 'ask_name') {
    if (body.trim().length < 2) return '😊 Apna naam batayein (e.g. *Rahul Sharma*):';
    session.name = body.split(' ')[0];
    session.step = 'ask_bhk';
    return `Shukriya *${session.name} ji*! 🙏\n\nKaunsa property type dhundh rahe hain?\n\n1️⃣  1 BHK\n2️⃣  2 BHK\n3️⃣  3 BHK\n4️⃣  4 BHK / Villa\n5️⃣  Commercial / Office`;
  }

  // ── ask_bhk ──
  if (session.step === 'ask_bhk') {
    const bhkMap = { '1':'1BHK','2':'2BHK','3':'3BHK','4':'4BHK+','5':'Commercial' };
    if (!bhkMap[num]) return '1 se 5 ke beech number bhejein 😊';
    session.bhk  = bhkMap[num];
    session.step = 'ask_budget';
    return `Theek hai! *${session.bhk}* — aapka budget range kya hai?\n\n1️⃣  50 Lakh se kam\n2️⃣  50 Lakh – 1 Crore\n3️⃣  1 Crore – 2 Crore\n4️⃣  2 Crore se zyada`;
  }

  // ── ask_budget ──
  if (session.step === 'ask_budget') {
    const m = { '1':'under_50L','2':'50L_1Cr','3':'1Cr_2Cr','4':'above_2Cr' };
    if (!m[num]) return '1 se 4 ke beech number bhejein 😊';
    session.budget = m[num];
    session.step   = 'ask_location';
    return `Kahan chahiye property?\n\n1️⃣  Noida / Greater Noida\n2️⃣  Gurugram\n3️⃣  Delhi\n4️⃣  Faridabad\n5️⃣  Koi bhi location chalega`;
  }

  // ── ask_location ──
  if (session.step === 'ask_location') {
    const m = { '1':'Noida','2':'Gurugram','3':'Delhi','4':'Faridabad','5':'Any' };
    if (!m[num]) return '1 se 5 ke beech number bhejein 😊';
    session.location = m[num];
    session.step     = 'ask_timeline';
    return `Kab tak lena chahte hain property?\n\n1️⃣  Turant chahiye (1-30 days)\n2️⃣  1–3 mahine mein\n3️⃣  3–6 mahine mein\n4️⃣  Abhi sirf dekh rahe hain`;
  }

  // ── ask_timeline ──
  if (session.step === 'ask_timeline') {
    const m = { '1':'immediate','2':'1_3months','3':'3_6months','4':'just_looking' };
    if (!m[num]) return '1 se 4 ke beech number bhejein 😊';
    session.timeline = m[num];
    session.step     = 'ask_purpose';
    return `Property kisliye chahiye?\n\n1️⃣  Khud rehne ke liye\n2️⃣  Investment ke liye\n3️⃣  Dono`;
  }

  // ── ask_purpose ──
  if (session.step === 'ask_purpose') {
    const m = { '1':'self_use','2':'investment','3':'both' };
    if (!m[num]) return '1, 2 ya 3 bhejein 😊';
    session.purpose = m[num];
    session.step    = 'show_properties';

    // Filter properties
    const filtered = properties.filter(p =>
      (session.location === 'Any' || p.location.toLowerCase().includes(session.location.toLowerCase())) &&
      p.bhk === session.bhk &&
      p.budget_category === session.budget
    );

    // Score lead (pre-visit)
    session.leadScore = calcLeadScore(session);
    session.leadTemp  = getTemp(session.leadScore);

    if (!filtered.length) {
      // Save cold lead
      await sheets.saveLead({
        phone: session.phone, name: session.name, budget: session.budget,
        bhk: session.bhk, location: session.location, timeline: session.timeline,
        purpose: session.purpose, leadScore: session.leadScore, leadTemp: session.leadTemp,
        timestamp: new Date().toISOString(), notes: 'No matching properties found'
      });
      session.step = 'done';
      return `😔 *${session.name} ji*, abhi aapke criteria ke hisaab se koi property available nahi hai.\n\nHum nayi property aane pe turant inform karenge! ✅\n\nKoi aur help chahiye? *menu* type karein 😊`;
    }

    session.filteredProperties = filtered;
    let msg = `🎯 *${filtered.length} perfect properties mili hain ${session.name} ji!*\n${'─'.repeat(22)}\n\n`;
    filtered.forEach((p, i) => {
      msg += `*${i+1}. ${p.name}*\n📍 ${p.location}\n💰 ${p.price} | 📐 ${p.area}\n🏗 ${p.status} | ✨ ${p.amenities}\n\n`;
    });
    msg += `Kaunsi property mein interest hai?\nNumber bhejein (1–${filtered.length}):`;
    return msg;
  }

  // ── show_properties ──
  if (session.step === 'show_properties') {
    const idx = parseInt(num) - 1;
    const f   = session.filteredProperties || [];
    if (isNaN(idx) || idx < 0 || idx >= f.length) return `1 se ${f.length} ke beech number bhejein 😊`;
    session.selectedProperty = f[idx];
    session.step = 'ask_action';
    const p = f[idx];
    return `✅ *${p.name}*\n${'─'.repeat(22)}\n📍 ${p.location}\n💰 ${p.price}\n📐 ${p.area}\n🏗 ${p.status}\n🏢 Builder: ${p.builder || 'N/A'}\n🗓 Possession: ${p.possession || 'N/A'}\n✨ ${p.amenities}\n${'─'.repeat(22)}\n\nKya karna chahenge?\n\n1️⃣  Site visit book karein 📅\n2️⃣  Aur properties dekhni hain 🔍\n3️⃣  Agent se baat karni hai 📞\n4️⃣  WhatsApp pe brochure chahiye 📄`;
  }

  // ── ask_action ──
  if (session.step === 'ask_action') {
    if (num === '1') {
      session.step = 'ask_slot';
      return buildSlotMessage(session);
    }
    if (num === '2') {
      session.step = 'show_properties';
      const f = session.filteredProperties || [];
      let msg = `🔍 *Saari properties phir se:*\n\n`;
      f.forEach((p, i) => { msg += `*${i+1}. ${p.name}*\n📍 ${p.location} | 💰 ${p.price}\n\n`; });
      return msg + `Number bhejein (1–${f.length}):`;
    }
    if (num === '3') {
      session.requestedAgent = true;
      session.leadScore = calcLeadScore(session);
      session.leadTemp  = getTemp(session.leadScore);
      await sheets.saveLead({
        phone: session.phone, name: session.name, budget: session.budget,
        bhk: session.bhk, location: session.location, timeline: session.timeline,
        purpose: session.purpose, leadScore: session.leadScore, leadTemp: session.leadTemp,
        timestamp: new Date().toISOString(), notes: `Agent requested for: ${session.selectedProperty?.name}`
      });
      if (session.leadTemp === 'hot' || session.leadTemp === 'warm') await notifyAgent(session);
      session.step = 'done';
      return `📞 *Agent Connect*\n${'─'.repeat(22)}\nHumara senior agent *Rahul Sharma* aapko 15 minutes mein call karenge!\n\n📱 Direct: *+91-98765-43210*\n💬 Ya WhatsApp pe message karein\n\nAapka lead ID: *PB${Date.now().toString().slice(-6)}*\nShukriya ${session.name} ji! 🙏`;
    }
    if (num === '4') {
      session.step = 'done';
      return `📄 *Brochure & Details*\n${'─'.repeat(22)}\nHum aapko 2 minutes mein send kar rahe hain:\n• Floor Plans\n• Price Sheet\n• Location Map\n• Builder Profile\n\n*${session.selectedProperty?.name}* ke baare mein aur jaankari ke liye:\n📞 +91-98765-43210\n\nShukriya! 🙏`;
    }
    return '1 se 4 ke beech number bhejein 😊';
  }

  // ── ask_slot ──
  if (session.step === 'ask_slot') {
    const slots = generateSlots();
    session.slots = slots;
    const idx = parseInt(num) - 1;
    if (isNaN(idx) || idx < 0 || idx >= slots.length) return `1 se ${slots.length} ke beech number bhejein 😊`;
    session.visitSlot = slots[idx];
    session.step      = 'confirm_name';
    return `✅ *${session.visitSlot}* — slot lock ho gaya! 🎉\n\nConfirmation ke liye aapka *poora naam* batayein:`;
  }

  // ── confirm_name ──
  if (session.step === 'confirm_name') {
    session.fullName   = body;
    session.bookedVisit = true;
    session.leadScore  = calcLeadScore(session);
    session.leadTemp   = getTemp(session.leadScore);
    const p = session.selectedProperty;

    try {
      await sheets.saveVisitBooking({
        phone: session.phone, name: session.fullName, property: p.name,
        location: p.location, price: p.price, slot: session.visitSlot,
        budget: session.budget, bhk: session.bhk, timestamp: new Date().toISOString()
      });
      await sheets.saveLead({
        phone: session.phone, name: session.fullName, budget: session.budget,
        bhk: session.bhk, location: session.location, timeline: session.timeline,
        purpose: session.purpose, leadScore: session.leadScore, leadTemp: session.leadTemp,
        timestamp: new Date().toISOString(), notes: `Visit booked: ${p.name} @ ${session.visitSlot}`
      });
      if (session.leadTemp === 'hot') await notifyAgent(session);
    } catch(e) { console.error('Save error:', e.message); }

    session.step = 'post_visit';
    const visitId = 'PV' + Date.now().toString().slice(-6);
    return `🎉 *Site Visit Confirmed!*\n${'═'.repeat(22)}\n👤 *${session.fullName}*\n🏠 ${p.name}\n📍 ${p.location}\n📅 ${session.visitSlot}\n👔 Agent: Rahul Sharma\n📞 +91-98765-43210\n🆔 Booking ID: *${visitId}*\n${'═'.repeat(22)}\n⏰ 1 ghante pehle reminder milega!\n\nKuch aur help chahiye?\n1️⃣ Aur property dekhni hai\n2️⃣ Done, shukriya!`;
  }

  // ── post_visit ──
  if (session.step === 'post_visit') {
    if (num === '1') {
      sessions[session.phone] = { step: 'ask_bhk', phone: session.phone, name: session.name };
      return `Naya search shuru karte hain!\n\nKaunsa property type chahiye?\n\n1️⃣  1 BHK\n2️⃣  2 BHK\n3️⃣  3 BHK\n4️⃣  4 BHK / Villa\n5️⃣  Commercial`;
    }
    session.step = 'done';
    return `Bahut shukriya *${session.name} ji*! 🙏\n\nHum visit ke din milenge. Koi bhi sawaal ho to:\n📞 *+91-98765-43210*\n\nPropBot pe aap hamesha trust kar sakte hain! 🏠✨`;
  }

  return `Madad ke liye *menu* type karein 😊\n\nYa call karein: 📞 *+91-98765-43210*`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateSlots() {
  const slots = [];
  const now = new Date();
  for (let d = 1; d <= 4; d++) {
    const dt = new Date(now);
    dt.setDate(now.getDate() + d);
    if (dt.getDay() === 0) continue; // skip Sundays
    const dn = dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    slots.push(`${dn} — 10:30 AM`);
    slots.push(`${dn} — 4:00 PM`);
    if (slots.length >= 6) break;
  }
  return slots.slice(0, 6);
}

function buildSlotMessage(session) {
  const slots = generateSlots();
  session.slots = slots;
  let msg = `📅 *Site Visit Slots — ${session.selectedProperty?.name}*\n${'─'.repeat(22)}\n\n`;
  slots.forEach((s, i) => { msg += `${i + 1}️⃣  ${s}\n`; });
  msg += `\nSlot number bhejein:`;
  return msg;
}

function welcome() {
  return `🏠 *PropBot — AI Property Assistant*\n${'═'.repeat(22)}\n\nNamaste! Main aapko perfect property dhundhne mein madad karunga — *24/7, Hindi & English mein!*\n\n✅ 1000+ verified properties\n✅ Free site visit booking\n✅ Expert agent support\n\nShuruaat karte hain! Aapka naam kya hai? 😊`;
}

// ─── WhatsApp Webhook ─────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const twiml  = new MessagingResponse();
  const phone  = req.body.From || '';
  const body   = (req.body.Body || '').trim();
  console.log(`📩 MSG FROM: ${phone} | BODY: ${body}`);
  const session = getSession(phone);
  const reply   = await handleMessage(phone, body, session);
  console.log(`📤 REPLY TO: ${phone} | STEP: ${session.step}`);
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

// ─── Dashboard API ────────────────────────────────────────────────────────────
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await sheets.getLeads();
    const mock = getMockLeads();
    // Always merge real + mock so dashboard always has data to show
    const allLeads = leads.length > 0 ? leads : mock;
    res.json({ success: true, leads: allLeads, total: allLeads.length, mock: leads.length === 0 });
  } catch(e) {
    const mock = getMockLeads();
    res.json({ success: true, leads: mock, total: mock.length, mock: true });
  }
});

app.get('/api/visits', async (req, res) => {
  try {
    const visits = await sheets.getVisits();
    const mock = getMockVisits();
    const allVisits = visits.length > 0 ? visits : mock;
    res.json({ success: true, visits: allVisits, total: allVisits.length, mock: visits.length === 0 });
  } catch(e) {
    const mock = getMockVisits();
    res.json({ success: true, visits: mock, total: mock.length, mock: true });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const leads  = await sheets.getLeads();
    const visits = await sheets.getVisits();
    if (leads.length > 0) {
      const hot  = leads.filter(l => l.leadTemp === 'hot').length;
      const warm = leads.filter(l => l.leadTemp === 'warm').length;
      return res.json({ success: true, total: leads.length, hot, warm, cold: leads.length - hot - warm, visits: visits.length });
    }
    // Demo data when sheets empty
    res.json({ success: true, total: 48, hot: 12, warm: 21, cold: 15, visits: 18, mock: true });
  } catch(e) {
    res.json({ success: true, total: 48, hot: 12, warm: 21, cold: 15, visits: 18, mock: true });
  }
});

app.get('/api/sessions', (req, res) => {
  const summary = Object.values(sessions).map(s => ({
    phone: s.phone?.replace(/\+91(\d{5})(\d{5})/, '+91 $1*****'),
    name: s.name, step: s.step, leadScore: s.leadScore, leadTemp: s.leadTemp
  }));
  res.json({ active: summary.length, sessions: summary });
});

// ─── Mock Data (fallback when Sheets not connected) ───────────────────────────
function getMockLeads() {
  return [
    { timestamp:'2025-04-15T09:23:00Z', phone:'+919876540001', name:'Amit Sharma',    budget:'1Cr_2Cr',  bhk:'3BHK', location:'Noida',    timeline:'immediate',   purpose:'self_use',   leadScore:'8', leadTemp:'hot',  notes:'Visit booked: DLF Skycourt' },
    { timestamp:'2025-04-15T10:11:00Z', phone:'+919876540002', name:'Priya Mehta',    budget:'50L_1Cr',  bhk:'2BHK', location:'Gurugram', timeline:'1_3months',   purpose:'investment', leadScore:'5', leadTemp:'warm', notes:'Requested brochure' },
    { timestamp:'2025-04-15T11:02:00Z', phone:'+919876540003', name:'Rohit Gupta',    budget:'above_2Cr',bhk:'4BHK+',location:'Gurugram', timeline:'immediate',   purpose:'self_use',   leadScore:'9', leadTemp:'hot',  notes:'Visit booked: M3M Golf Estate' },
    { timestamp:'2025-04-15T11:45:00Z', phone:'+919876540004', name:'Neha Singh',     budget:'under_50L',bhk:'2BHK', location:'Noida',    timeline:'3_6months',   purpose:'investment', leadScore:'2', leadTemp:'cold', notes:'No property found' },
    { timestamp:'2025-04-15T12:30:00Z', phone:'+919876540005', name:'Suresh Agarwal', budget:'1Cr_2Cr',  bhk:'3BHK', location:'Delhi',    timeline:'1_3months',   purpose:'self_use',   leadScore:'6', leadTemp:'warm', notes:'Agent requested' },
    { timestamp:'2025-04-15T13:15:00Z', phone:'+919876540006', name:'Kavya Reddy',    budget:'50L_1Cr',  bhk:'3BHK', location:'Any',      timeline:'immediate',   purpose:'investment', leadScore:'7', leadTemp:'hot',  notes:'Visit booked: ATS Pristine' },
    { timestamp:'2025-04-15T14:00:00Z', phone:'+919876540007', name:'Vikram Patel',   budget:'above_2Cr',bhk:'4BHK+',location:'Gurugram', timeline:'immediate',   purpose:'both',       leadScore:'9', leadTemp:'hot',  notes:'Visit booked: Emaar Palm Springs' },
    { timestamp:'2025-04-15T14:45:00Z', phone:'+919876540008', name:'Anita Kumar',    budget:'50L_1Cr',  bhk:'2BHK', location:'Faridabad',timeline:'3_6months',   purpose:'self_use',   leadScore:'3', leadTemp:'cold', notes:'Just browsing' },
  ];
}

function getMockVisits() {
  return [
    { timestamp:'2025-04-15T09:23:00Z', phone:'+919876540001', name:'Amit Sharma',    property:'DLF Skycourt — 3 BHK',       location:'Sector 86, Gurugram',  price:'₹95 Lakh',   slot:'Wednesday, 16 Apr — 10:30 AM', budget:'1Cr_2Cr',  bhk:'3BHK', status:'Confirmed' },
    { timestamp:'2025-04-15T11:02:00Z', phone:'+919876540003', name:'Rohit Gupta',    property:'M3M Golf Estate — 4 BHK',    location:'Sector 65, Gurugram',  price:'₹2.1 Crore', slot:'Thursday, 17 Apr — 4:00 PM',   budget:'above_2Cr',bhk:'4BHK+',status:'Confirmed' },
    { timestamp:'2025-04-15T13:15:00Z', phone:'+919876540006', name:'Kavya Reddy',    property:'ATS Pristine — 3 BHK',       location:'Sector 150, Noida',    price:'₹85 Lakh',   slot:'Thursday, 17 Apr — 10:30 AM',  budget:'50L_1Cr',  bhk:'3BHK', status:'Confirmed' },
    { timestamp:'2025-04-15T14:00:00Z', phone:'+919876540007', name:'Vikram Patel',   property:'Emaar Palm Springs — Villa', location:'Sector 54, Gurugram',  price:'₹4.8 Crore', slot:'Friday, 18 Apr — 4:00 PM',     budget:'above_2Cr',bhk:'4BHK+',status:'Confirmed' },
  ];
}

// ─── Demo Request ─────────────────────────────────────────────────────────────
app.post('/api/demo-request', async (req, res) => {
  try {
    const { name, phone, city, budget } = req.body;
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:+919518709573`,
      body: `🔔 *NAYA DEMO REQUEST!*\n\n👤 Naam: ${name}\n📱 Phone: ${phone}\n🏙️ City: ${city}\n💰 Budget: ${budget}\n\nJaldi contact karo! 🚀`
    });
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false });
  }
});

// ─── Static pages ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'dashboard.html')));
app.get('/demo-script', (req, res) => res.sendFile(path.join(__dirname, '..', 'demo-script.html')));
app.get('/guide', (req, res) => res.sendFile(path.join(__dirname, '..', 'guide.html')));
app.get('/broadcast', (req, res) => res.sendFile(path.join(__dirname, '..', 'broadcast.html')));
app.get('/shivam-widget', (req, res) => res.sendFile(path.join(__dirname, '..', 'shivam-widget.html')));

// ─── Broadcast API ────────────────────────────────────────────────────────────
app.post('/api/broadcast/send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.json({ success: false, error: 'Missing to or message' });
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const phone = to.startsWith('+') ? to : '+' + to.replace(/\D/g,'');
    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${phone}`,
      body: message
    });
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log(`🚀 PropBot running on port ${process.env.PORT || 3000}`));
