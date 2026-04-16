// ─── DocBot — AI WhatsApp Assistant for Doctors/Clinics ─────────────────────
const express = require('express');
const router  = express.Router();
const path    = require('path');
const { MessagingResponse } = require('twilio').twiml;

const sessions = {};
function getSession(phone) {
  if (!sessions[phone]) sessions[phone] = { step: 'start', phone };
  return sessions[phone];
}

// ─── Patient Scoring ────────────────────────────────────────────────────────
function calcScore(s) {
  const urgencyPts = { emergency: 10, today: 7, this_week: 4, routine: 2 };
  const symptomPts = { chest_breathing: 3, fever_cold: 2, stomach: 1, head: 1, skin: 1, other: 0 };
  let score = urgencyPts[s.urgency] || 0;
  score += symptomPts[s.symptoms] || 0;
  return Math.min(score, 10);
}
function getPriority(score) {
  if (score >= 8) return 'urgent';
  if (score >= 5) return 'priority';
  return 'routine';
}
const priorityLabel = { urgent: '🔴 URGENT', priority: '🟡 PRIORITY', routine: '🟢 ROUTINE' };

// ─── Doctor Alert ────────────────────────────────────────────────────────────
async function alertDoctor(session) {
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const doctorNum = process.env.DOCTOR_PHONE || process.env.AGENT_PHONE || '+919518709573';
    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to:   `whatsapp:${doctorNum}`,
      body: `🏥 *NAYA PATIENT APPOINTMENT*\n\n👤 Naam: ${session.name}\n📱 Phone: ${session.phone.replace('whatsapp:','')}\n🤒 Problem: ${symptomLabel[session.symptoms] || session.symptoms}\n⚡ Urgency: ${urgencyLabel[session.urgency]}\n📅 Slot: ${session.slot}\n📊 Priority: ${priorityLabel[session.priority]}\n\nJaldi contact karein! 🚑`
    });
  } catch(e) { console.log('Doctor alert error:', e.message); }
}

const symptomLabel = {
  fever_cold: 'Bukhaar / Sardi / Khaansi',
  chest_breathing: 'Seene mein dard / Sans ki takleef',
  stomach: 'Pet dard / Ulti / Digestion',
  head: 'Sir dard / Migraine',
  skin: 'Chamdi ki samasya',
  other: 'Koi aur problem'
};
const urgencyLabel = {
  emergency: 'Emergency — Abhi chahiye',
  today: 'Aaj ka appointment',
  this_week: 'Is hafte mein',
  routine: 'Routine checkup'
};

// ─── Slot Generator ──────────────────────────────────────────────────────────
function generateSlots() {
  const slots = [];
  const days  = ['Kal', 'Parson', '3 din baad'];
  const times = ['9:00 AM', '11:00 AM', '5:00 PM', '7:00 PM'];
  days.forEach(day => {
    times.slice(0,2).forEach(t => slots.push(`${day} — ${t}`));
  });
  return slots.slice(0,6);
}

// ─── Message Handler ─────────────────────────────────────────────────────────
async function handleMessage(phone, body, session) {
  const text = body.toLowerCase().trim();
  const num  = parseInt(body.trim());

  switch(session.step) {

    case 'start':
      session.step = 'ask_name';
      return `🏥 *DocBot — AI Health Assistant*\n══════════════════════\n\nNamaste! Main aapko doctor se appointment dilane mein madad karunga — *24/7, Hindi & English mein!*\n\n✅ Fast appointment booking\n✅ Doctor ko instant alert\n✅ Reminder 1 din pehle\n\nShuruat karte hain! Aapka naam kya hai? 😊`;

    case 'ask_name':
      if (body.length < 2) return 'Kripya apna poora naam likhein 🙏';
      session.name = body;
      session.step = 'ask_symptoms';
      return `Shukriya *${session.name} ji*! 🙏\n\nAapki kya takleef hai? Neeche se select karein:\n\n1️⃣ Bukhaar / Sardi / Khaansi\n2️⃣ Seene mein dard / Sans ki takleef\n3️⃣ Pet dard / Ulti / Digestion\n4️⃣ Sir dard / Migraine\n5️⃣ Chamdi ki samasya\n6️⃣ Koi aur problem\n\n*1 se 6 number type karein* 😊`;

    case 'ask_symptoms': {
      const map = { 1:'fever_cold', 2:'chest_breathing', 3:'stomach', 4:'head', 5:'skin', 6:'other' };
      if (!map[num]) return '1 se 6 ke beech number bhejein 😊';
      session.symptoms = map[num];
      session.step = 'ask_urgency';
      return `Samajh gaya — *${symptomLabel[session.symptoms]}* 🏥\n\nKab tak appointment chahiye?\n\n1️⃣ 🚨 Emergency — Abhi chahiye\n2️⃣ ⚡ Aaj ka appointment chahiye\n3️⃣ 📅 Is hafte mein koi bhi din\n4️⃣ ✅ Routine checkup — koi bhi time\n\n*1 se 4 number type karein* 😊`;
    }

    case 'ask_urgency': {
      const map = { 1:'emergency', 2:'today', 3:'this_week', 4:'routine' };
      if (!map[num]) return '1 se 4 ke beech number type karein 😊';
      session.urgency = map[num];
      if (session.urgency === 'emergency') {
        session.step = 'ask_confirm_emergency';
        return `🚨 *EMERGENCY CASE DETECTED!*\n\nDariye mat — doctor ko abhi alert kar raha hoon!\n\nKya aap seedha doctor se baat karna chahenge?\n\n1️⃣ Haan — Call karein mujhe\n2️⃣ Nahi — Appointment book karein`;
      }
      session.step = 'ask_slot';
      const slots = generateSlots();
      session.slots = slots;
      return `Theek hai! Kaunsa time slot chahiye?\n\n${slots.map((s,i)=>`${i+1}️⃣ ${s}`).join('\n')}\n\n*1 se 6 number type karein* 📅`;
    }

    case 'ask_confirm_emergency': {
      if (num === 1) {
        session.step = 'done';
        session.leadScore = 10;
        session.priority = 'urgent';
        await alertDoctor(session);
        return `🚨 *Doctor ko alert kar diya!*\n\nWoh aapko *abhi* call karenge.\n\n📱 Agar 10 minute mein call na aaye toh:\n*+91 9518709573* pe call karein\n\nApna khayal rakhein! 🙏`;
      }
      session.step = 'ask_slot';
      const slots = generateSlots();
      session.slots = slots;
      return `Theek hai! Kaunsa time slot chahiye?\n\n${slots.map((s,i)=>`${i+1}️⃣ ${s}`).join('\n')}\n\n*1 se 6 number type karein* 📅`;
    }

    case 'ask_slot': {
      const slots = session.slots || generateSlots();
      if (!num || num < 1 || num > slots.length) return `1 se ${slots.length} ke beech number type karein 😊`;
      session.slot = slots[num-1];
      session.step = 'done';
      const score    = calcScore(session);
      session.leadScore = score;
      session.priority  = getPriority(score);
      await alertDoctor(session);
      return `✅ *Appointment Confirmed!*\n══════════════════\n\n👤 Naam: ${session.name}\n🤒 Problem: ${symptomLabel[session.symptoms]}\n📅 Slot: ${session.slot}\n⚡ Priority: ${priorityLabel[session.priority]}\n\nDr. Sharma aapka intezaar karenge! 🏥\n\n📌 *Yaad rahe:*\n• 15 min pehle aa jaayein\n• Purani reports saath laayein\n• 1 din pehle reminder milega\n\n*Koi sawaal ho toh type karein* 😊`;
    }

    case 'done':
      session.step = 'start';
      return `Kya main aapki aur madad kar sakta hoon?\n\n1️⃣ Naya appointment book karein\n2️⃣ Appointment cancel/reschedule karein\n3️⃣ Doctor se baat karein\n\n*1, 2, ya 3 type karein* 😊`;

    default:
      session.step = 'start';
      return handleMessage(phone, body, session);
  }
}

// ─── Webhook ─────────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  const twiml  = new MessagingResponse();
  const phone  = req.body.From || '';
  const body   = (req.body.Body || '').trim();
  console.log(`🏥 DOCBOT MSG FROM: ${phone} | BODY: ${body}`);
  const session = getSession(phone);
  const reply   = await handleMessage(phone, body, session);
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

// ─── Sessions API ─────────────────────────────────────────────────────────────
router.get('/api/sessions', (req, res) => {
  const summary = Object.values(sessions).map(s => ({
    phone: s.phone?.replace(/\+91(\d{5})(\d{5})/, '+91 $1*****'),
    name: s.name, step: s.step, priority: s.priority, score: s.leadScore
  }));
  res.json({ active: summary.length, sessions: summary });
});

// ─── Mock Data ────────────────────────────────────────────────────────────────
router.get('/api/appointments', (req, res) => {
  res.json({ success: true, appointments: getMockAppointments() });
});

function getMockAppointments() {
  return [
    { name:'Rahul Sharma',   phone:'+919876540001', symptoms:'Bukhaar/Sardi',        urgency:'today',     slot:'Kal — 9:00 AM',      priority:'priority', score:9 },
    { name:'Priya Mehta',    phone:'+919876540002', symptoms:'Sir dard/Migraine',     urgency:'this_week', slot:'Parson — 11:00 AM',   priority:'routine',  score:5 },
    { name:'Suresh Kumar',   phone:'+919876540003', symptoms:'Seene mein dard',       urgency:'emergency', slot:'Aaj — Emergency',     priority:'urgent',   score:10},
    { name:'Anita Singh',    phone:'+919876540004', symptoms:'Pet dard/Digestion',    urgency:'this_week', slot:'3 din baad — 5:00 PM',priority:'routine',  score:4 },
    { name:'Vikram Patel',   phone:'+919876540005', symptoms:'Chamdi ki samasya',     urgency:'routine',   slot:'Parson — 7:00 PM',    priority:'routine',  score:3 },
    { name:'Kavya Reddy',    phone:'+919876540006', symptoms:'Bukhaar/Sardi',         urgency:'today',     slot:'Kal — 11:00 AM',      priority:'priority', score:7 },
  ];
}

// ─── Static Pages ─────────────────────────────────────────────────────────────
const path = require('path');
router.get('/landing', (req, res) => res.sendFile(path.join(__dirname, '..', 'docbot.html')));
router.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'docbot-dashboard.html')));

module.exports = { router, sessions };
