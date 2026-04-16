// ─── ChemBot — AI WhatsApp Bot for Shivam Chemical ──────────────────────────
const express = require('express');
const path    = require('path');
const router  = express.Router();
const { MessagingResponse } = require('twilio').twiml;

const sessions = {};
function getSession(phone) {
  if (!sessions[phone]) sessions[phone] = { step: 'start', phone };
  return sessions[phone];
}

// ─── Products ─────────────────────────────────────────────────────────────────
const products = {
  industrial: ['Floor Cleaner (Industrial)', 'Toilet Cleaner', 'Glass Cleaner', 'Multi-Surface Cleaner', 'Disinfectant Spray'],
  home:       ['Home Floor Cleaner', 'Bathroom Cleaner', 'Kitchen Degreaser', 'Fabric Softener', 'Dish Wash Liquid'],
  personal:   ['Hand Wash', 'Sanitizer', 'Shampoo (Private Label)', 'Body Wash'],
  lab:        ['Lab Grade Chemicals', 'Reagents', 'Solvents', 'Acids & Bases']
};

const customerTypeLabel = {
  office:     'Office / Corporate',
  restaurant: 'Restaurant / Hotel',
  hospital:   'Hospital / Healthcare',
  factory:    'Factory / Industrial',
  home:       'Home / Personal Use',
  other:      'Other'
};

// ─── Lead Score ───────────────────────────────────────────────────────────────
function calcScore(s) {
  const qtyPts  = { bulk: 3, medium: 2, small: 1 };
  const typePts = { hospital: 3, factory: 3, restaurant: 2, office: 2, home: 1, other: 0 };
  return Math.min((qtyPts[s.quantity] || 0) + (typePts[s.customerType] || 0), 5);
}

// ─── Alert Owner ──────────────────────────────────────────────────────────────
async function alertOwner(session) {
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to:   `whatsapp:+919518709573`,
      body: `🧪 *NAYA INQUIRY — Shivam Chemical*\n\n👤 Naam: ${session.name}\n📱 Phone: ${session.phone.replace('whatsapp:','')}\n🏢 Customer Type: ${customerTypeLabel[session.customerType]}\n📦 Product: ${session.product}\n🔢 Quantity: ${session.quantity}\n📍 City: ${session.city || 'N/A'}\n⭐ Score: ${session.score}/5\n\nJaldi contact karo! 🚀`
    });
  } catch(e) { console.log('Alert error:', e.message); }
}

// ─── Message Handler ──────────────────────────────────────────────────────────
async function handleMessage(phone, body, session) {
  const num  = parseInt(body.trim());
  const text = body.toLowerCase().trim();

  switch(session.step) {

    case 'start':
      session.step = 'ask_name';
      return `🧪 *Shivam Chemical — AI Assistant*\n══════════════════════\n\nNamaste! Main aapko sahi chemical product dhundhne mein madad karunga!\n\n✅ 500+ quality products\n✅ Bulk orders available\n✅ Pan India delivery\n✅ Private labeling\n\nShuruaat karte hain! Aapka naam kya hai? 😊`;

    case 'ask_name':
      if (body.length < 2) return 'Kripya apna naam likhein 🙏';
      session.name = body;
      session.step = 'ask_customer_type';
      return `Shukriya *${session.name} ji*! 🙏\n\nAap kiske liye product chahiye?\n\n🏢 Office / Corporate\n🍽️ Restaurant / Hotel\n🏥 Hospital / Healthcare\n🏭 Factory / Industrial\n🏠 Home / Personal Use\n\n*Seedha type karein — jaise "Restaurant" ya "Hospital"* 😊`;

    case 'ask_customer_type': {
      const t = text;
      let type = 'other';
      if (t.includes('office') || t.includes('corporate') || t.includes('company')) type = 'office';
      else if (t.includes('restaurant') || t.includes('hotel') || t.includes('cafe') || t.includes('dhaba')) type = 'restaurant';
      else if (t.includes('hospital') || t.includes('clinic') || t.includes('health') || t.includes('medical')) type = 'hospital';
      else if (t.includes('factory') || t.includes('industrial') || t.includes('warehouse') || t.includes('plant')) type = 'factory';
      else if (t.includes('home') || t.includes('personal') || t.includes('ghar') || t.includes('house')) type = 'home';
      else if (num >= 1 && num <= 6) {
        const numMap = {1:'office',2:'restaurant',3:'hospital',4:'factory',5:'home',6:'other'};
        type = numMap[num];
      }
      session.customerType = type;
      session.step = 'ask_specific_product';
      return `Samajh gaya — *${customerTypeLabel[type]}* ke liye! 👍\n\nKaunsa product chahiye?\n\nSeedha product ka naam likhein:\n\n🧹 Floor Cleaner\n🚽 Toilet / Bathroom Cleaner\n🧴 Handwash / Sanitizer\n🍳 Kitchen Degreaser\n🪟 Glass Cleaner\n🧪 Lab Chemicals\n📦 Koi bhi aur product\n\n*Bas product ka naam type karein* 😊`;
    }

    case 'ask_specific_product': {
      session.product = body;
      session.step = 'ask_quantity';
      return `*${session.product}* — bilkul! 👍\n\nKitna quantity chahiye?\n\n🔹 Thoda (Trial — 5-10 units)\n🔸 Medium (50-100 units)\n🔴 Bulk (500+ units)\n\n*"Thoda", "Medium" ya "Bulk" type karein* 📦`;
    }

    case 'ask_quantity': {
      let qty = 'small';
      if (text.includes('bulk') || text.includes('bada') || text.includes('zyada') || text.includes('500') || num >= 500) qty = 'bulk';
      else if (text.includes('medium') || text.includes('beech') || text.includes('50') || text.includes('100')) qty = 'medium';
      else if (text.includes('small') || text.includes('thoda') || text.includes('trial') || text.includes('kam')) qty = 'small';
      else if (num >= 1 && num <= 3) { const m={1:'small',2:'medium',3:'bulk'}; qty=m[num]; }
      session.quantity = qty;
      session.step = 'ask_city';
      return `Theek hai! Delivery kahan chahiye?\n\n*Apna city/state type karein* 📍\n\n_(Example: Mumbai, Pune, Delhi)_`;
    }

    case 'ask_city':
      session.city = body;
      session.step = 'done';
      session.score = calcScore(session);
      await alertOwner(session);
      return `✅ *Inquiry Received!*\n══════════════════\n\n👤 Naam: ${session.name}\n📦 Product: ${session.product}\n🔢 Quantity: ${session.quantity}\n📍 City: ${session.city}\n\nHumari team aapko *24 ghante mein* contact karegi!\n\n📱 Abhi contact karna hai?\n*+91 9518709573* pe call karein\n\n*Shivam Chemical — Quality Guaranteed* 🧪`;

    case 'done':
      session.step = 'start';
      return `Kya main aur madad kar sakta hoon?\n\n1️⃣ Naya inquiry karo\n2️⃣ Price list maango\n3️⃣ Agent se baat karo\n\n*1, 2, ya 3 type karein* 😊`;

    default:
      session.step = 'start';
      return handleMessage(phone, body, session);
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  const twiml  = new MessagingResponse();
  const phone  = req.body.From || '';
  const body   = (req.body.Body || '').trim();
  console.log(`🧪 CHEMBOT MSG FROM: ${phone} | BODY: ${body}`);
  const session = getSession(phone);
  const reply   = await handleMessage(phone, body, session);
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

router.get('/api/sessions', (req, res) => {
  const summary = Object.values(sessions).map(s => ({
    phone: s.phone?.replace(/\+91(\d{5})(\d{5})/, '+91 $1*****'),
    name: s.name, step: s.step, product: s.product, score: s.score
  }));
  res.json({ active: summary.length, sessions: summary });
});

module.exports = { router, sessions };
