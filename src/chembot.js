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
  const num = parseInt(body.trim());

  switch(session.step) {

    case 'start':
      session.step = 'ask_name';
      return `🧪 *Shivam Chemical — AI Assistant*\n══════════════════════\n\nNamaste! Main aapko sahi chemical product dhundhne mein madad karunga!\n\n✅ 500+ quality products\n✅ Bulk orders available\n✅ Pan India delivery\n✅ Private labeling\n\nShuruaat karte hain! Aapka naam kya hai? 😊`;

    case 'ask_name':
      if (body.length < 2) return 'Kripya apna naam likhein 🙏';
      session.name = body;
      session.step = 'ask_customer_type';
      return `Shukriya *${session.name} ji*! 🙏\n\nAap kiske liye product chahiye?\n\n1️⃣ Office / Corporate\n2️⃣ Restaurant / Hotel\n3️⃣ Hospital / Healthcare\n4️⃣ Factory / Industrial\n5️⃣ Home / Personal Use\n6️⃣ Other\n\n*1 se 6 number type karein* 😊`;

    case 'ask_customer_type': {
      const map = {1:'office',2:'restaurant',3:'hospital',4:'factory',5:'home',6:'other'};
      if (!map[num]) return '1 se 6 ke beech number type karein 😊';
      session.customerType = map[num];
      session.step = 'ask_category';
      return `Achha! ${customerTypeLabel[map[num]]} ke liye chahiye.\n\nKaunsi category ka product chahiye?\n\n1️⃣ Industrial Cleaners\n2️⃣ Home Care Products\n3️⃣ Personal Care\n4️⃣ Lab Chemicals\n5️⃣ Sab categories dikhao\n\n*1 se 5 number type karein* 🧪`;
    }

    case 'ask_category': {
      const catMap = {1:'industrial',2:'home',3:'personal',4:'lab'};
      if (num === 5) {
        session.step = 'ask_specific_product';
        session.product = 'Multiple Categories';
        return `Theek hai! Aapko kaunsa specific product chahiye?\n\nExample: Floor Cleaner, Sanitizer, Toilet Cleaner\n\n*Product ka naam type karein* 📝`;
      }
      if (!catMap[num]) return '1 se 5 ke beech number type karein 😊';
      const cat = catMap[num];
      const list = products[cat];
      session.selectedCategory = cat;
      session.step = 'ask_specific_product';
      return `${cat.charAt(0).toUpperCase()+cat.slice(1)} Category:\n\n${list.map((p,i)=>`${i+1}️⃣ ${p}`).join('\n')}\n\nKaunsa product chahiye? *Number ya naam type karein* 📝`;
    }

    case 'ask_specific_product': {
      if (session.selectedCategory && parseInt(body) > 0) {
        const list = products[session.selectedCategory];
        session.product = list[parseInt(body)-1] || body;
      } else {
        session.product = body;
      }
      session.step = 'ask_quantity';
      return `*${session.product}* — achha choice! 👍\n\nKitna quantity chahiye?\n\n1️⃣ Small (Trial order — 5-10 units)\n2️⃣ Medium (50-100 units)\n3️⃣ Bulk (500+ units)\n\n*1 se 3 number type karein* 📦`;
    }

    case 'ask_quantity': {
      const map = {1:'small',2:'medium',3:'bulk'};
      if (!map[num]) return '1 se 3 ke beech number type karein 😊';
      session.quantity = map[num];
      session.step = 'ask_city';
      return `Theek hai! Delivery kahan chahiye?\n\n*Apna city/state type karein* 📍`;
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
