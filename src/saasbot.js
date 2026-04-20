// ─── PropBot SaaS — Multi-Agent WhatsApp Bot ─────────────────────────────────
// Each real estate agent registers via WhatsApp, gets a unique code (PROP001).
// Buyers text that code → bot runs for that agent's properties.

const { saveAgent, getAgents, updateAgentField, saveAgentLead, getAgentLeads } = require('./sheets');

// ─── In-memory caches ─────────────────────────────────────────────────────────
let agentCache = [];         // { agentCode, name, phone, city, plan, properties, ... }
let agentSessions = {};      // phone → { step, ... }  (agent registration flow)
let buyerSessions  = {};     // phone → { step, agentCode, ... }  (buyer lead flow)

// Reload agents from Sheets every 5 minutes
async function refreshAgentCache() {
  try {
    agentCache = await getAgents();
    console.log(`[saasbot] Agent cache refreshed — ${agentCache.length} agents`);
  } catch(e) { console.log('[saasbot] Cache refresh error:', e.message); }
}
refreshAgentCache();
setInterval(refreshAgentCache, 5 * 60 * 1000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nextAgentCode() {
  const nums = agentCache.map(a => parseInt(a.agentCode?.replace('PROP', '')) || 0);
  const max  = nums.length ? Math.max(...nums) : 0;
  return `PROP${String(max + 1).padStart(3, '0')}`;
}

function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

function calcScore(s) {
  let score = 0;
  const budgetPts  = { under_50L: 0, '50L_1Cr': 1, '1Cr_2Cr': 2, above_2Cr: 3 };
  const timePts    = { immediate: 3, '1_3months': 2, '3_6months': 1, just_looking: 0 };
  score += budgetPts[s.budget] || 0;
  score += timePts[s.timeline] || 0;
  if (s.purpose === 'self_use') score += 2;
  if (s.bookedVisit) score += 3;
  return Math.min(score, 10);
}

function getTemp(score) {
  if (score >= 7) return 'hot';
  if (score >= 4) return 'warm';
  return 'cold';
}

function generateSlots() {
  const slots = [];
  const now = new Date();
  for (let d = 1; d <= 5; d++) {
    const dt = new Date(now);
    dt.setDate(now.getDate() + d);
    if (dt.getDay() === 0) continue;
    const dn = dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    slots.push(`${dn} — 10:30 AM`);
    slots.push(`${dn} — 4:00 PM`);
    if (slots.length >= 6) break;
  }
  return slots.slice(0, 6);
}

async function sendWA(twilio, to, body) {
  try {
    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to:   to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      body
    });
  } catch(e) { console.log('[saasbot] WA send error:', e.message); }
}

// ─── AGENT REGISTRATION FLOW ──────────────────────────────────────────────────
async function handleAgentRegistration(phone, text, twilio) {
  let s = agentSessions[phone];

  if (!s) {
    agentSessions[phone] = { step: 'ask_name', phone };
    s = agentSessions[phone];
    return `🏠 *PropBot SaaS — Agent Registration*\n${'═'.repeat(26)}\n\nNamaste! PropBot aapko apna *AI-powered WhatsApp property bot* 24/7 dega — bilkul FREE!\n\n✅ Automatic lead capture\n✅ Site visit booking\n✅ Auto follow-up (Day 1, 3, 7)\n✅ Daily lead digest\n\nChalu karte hain! Aapka naam kya hai? 😊`;
  }

  if (s.step === 'ask_name') {
    if (text.length < 2) return 'Apna naam batayein:';
    s.name = text;
    s.step = 'ask_business';
    return `Shukriya *${s.name}* ji! 🙏\n\nAapki agency/business ka naam kya hai?\n(e.g. "Sharma Properties", "RK Realty")`;
  }

  if (s.step === 'ask_business') {
    s.businessName = text;
    s.step = 'ask_city';
    return `Aap mainly kahan properties sell karte hain?\n\nCity ka naam bhejein (e.g. "Nagpur", "Pune", "Mumbai"):`;
  }

  if (s.step === 'ask_city') {
    s.city = text;
    s.step = 'ask_prop1';
    s.properties = [];
    return `${s.city} — great! 🏙️\n\nAb aapki properties add karte hain.\n\n*Property 1 ka naam* bhejein:\n(e.g. "Green Valley Apartments")\n\nYa "SKIP" bhejein agar abhi nahi add karna:`;
  }

  if (s.step === 'ask_prop1') {
    if (text === 'skip') {
      s.step = 'choose_plan';
      return planMessage();
    }
    s.currentProp = { name: text };
    s.step = 'ask_prop1_price';
    return `*${text}* — price/range kya hai?\n(e.g. "75 Lakh", "1.2 Crore – 1.8 Crore")`;
  }

  if (s.step === 'ask_prop1_price') {
    s.currentProp.price = text;
    s.step = 'ask_prop1_location';
    return `Location/area? (e.g. "Wardha Road, Nagpur")`;
  }

  if (s.step === 'ask_prop1_location') {
    s.currentProp.location = text;
    s.step = 'ask_prop1_bhk';
    return `BHK type? (e.g. "2 BHK, 3 BHK" ya "Commercial")`;
  }

  if (s.step === 'ask_prop1_bhk') {
    s.currentProp.bhk = text;
    s.properties.push(s.currentProp);
    s.currentProp = null;
    s.step = text.length > 0 ? 'ask_more_props' : 'choose_plan';
    return `✅ *${s.properties[s.properties.length-1].name}* add ho gayi!\n\nKya aur property add karni hai?\n1️⃣ Haan, ek aur add karo\n2️⃣ Nahi, ab plan choose karo`;
  }

  if (s.step === 'ask_more_props') {
    if (text === '1' && s.properties.length < 10) {
      s.step = 'ask_prop1';
      return `*Property ${s.properties.length + 1} ka naam:*\n(Ya "SKIP" bhejein):`;
    }
    s.step = 'choose_plan';
    return planMessage();
  }

  if (s.step === 'choose_plan') {
    if (!['1', '2'].includes(text)) return planMessage();
    s.plan = text === '2' ? 'pro' : 'starter';

    // Generate agent code
    await refreshAgentCache();
    const agentCode = nextAgentCode();
    s.agentCode = agentCode;

    // Save to sheets
    await saveAgent({
      agentCode, name: s.name, phone,
      businessName: s.businessName, city: s.city,
      plan: s.plan, properties: s.properties
    });

    // Refresh cache
    await refreshAgentCache();
    delete agentSessions[phone];

    const waLink = `https://wa.me/${process.env.TWILIO_WHATSAPP_NUMBER?.replace('+','')}?text=${agentCode}`;
    const proPricing = s.plan === 'pro' ? '\n\n💳 *Pro Plan* — ₹999/month. Payment link: (coming soon)' : '';

    return `🎉 *Badhaai ho ${s.name} ji!*\n${'═'.repeat(26)}\n\nAapka PropBot ready hai!\n\n🆔 *Agent Code:* \`${agentCode}\`\n🏢 *Business:* ${s.businessName}\n📍 *City:* ${s.city}\n📦 *Plan:* ${s.plan === 'pro' ? 'Pro (₹999/mo)' : 'Starter (Free)'}\n🏠 *Properties:* ${s.properties.length} added\n${'─'.repeat(26)}\n\n*Buyers ko yeh bhejein:*\n👇\n"${s.city} mein property dhundh rahe ho? Hamare WhatsApp bot se FREE property search karo:\n${waLink}"\n\n*Ya directly yeh link share karo:*\n${waLink}\n${'─'.repeat(26)}\n\n*Agent Commands:*\nLEADS → aaj ke leads dekho\nSTATS → monthly report\nADDPROP → nayi property add karo\nHELP → sab commands\n${proPricing}\n\nPropBot aapki team ka hissa ban gaya! 🚀`;
  }

  return 'Kuch galat hua. "AGENT" bhejein dobara shuru karne ke liye.';
}

function planMessage() {
  return `Plan choose karein:\n\n1️⃣ *Starter — FREE*\n   • 50 leads/month\n   • Auto follow-up (Day 1, 3, 7)\n   • Daily digest\n\n2️⃣ *Pro — ₹999/month*\n   • Unlimited leads\n   • Priority support\n   • Custom bot messages\n   • Analytics dashboard\n\n1 ya 2 bhejein:`;
}

// ─── AGENT MANAGEMENT COMMANDS ────────────────────────────────────────────────
async function handleAgentCommand(agent, cmd, twilio) {
  const code = agent.agentCode;

  // LEADS — today's leads
  if (cmd === 'leads') {
    const leads = await getAgentLeads(code);
    const today = new Date().toISOString().slice(0, 10);
    const todayLeads = leads.filter(l => l.timestamp?.slice(0, 10) === today);
    if (!todayLeads.length) return `📊 *Aaj ke leads — ${code}*\n\nAbhi koi lead nahi aaya. Apna link share karo! 🔗`;
    let msg = `📊 *Aaj ke leads — ${todayLeads.length} total*\n${'─'.repeat(22)}\n\n`;
    todayLeads.forEach((l, i) => {
      const temp = l.temp === 'hot' ? '🔥' : l.temp === 'warm' ? '🌡️' : '❄️';
      msg += `${i+1}. ${temp} *${l.name}*\n📱 ${l.phone?.replace('whatsapp:','')}\n🏠 ${l.bhk} | 💰 ${l.budget} | 📍 ${l.location}\n\n`;
    });
    return msg;
  }

  // STATS — monthly report
  if (cmd === 'stats') {
    const leads = await getAgentLeads(code);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthly = leads.filter(l => l.timestamp?.startsWith(thisMonth));
    const hot  = monthly.filter(l => l.temp === 'hot').length;
    const warm = monthly.filter(l => l.temp === 'warm').length;
    const visits = monthly.filter(l => l.notes?.includes('Visit booked')).length;
    return `📈 *Monthly Stats — ${agent.businessName}*\n${'═'.repeat(26)}\n\n📅 This Month:\n• Total Leads: *${monthly.length}*\n• 🔥 Hot: ${hot} | 🌡️ Warm: ${warm} | ❄️ Cold: ${monthly.length - hot - warm}\n• 📅 Visits Booked: ${visits}\n• 🏆 Total All-time: ${leads.length}\n\nPlan: ${agent.plan === 'pro' ? 'Pro ✅' : 'Starter (UPGRADE → Pro ke liye "UPGRADE" bhejein)'}`;
  }

  // ADDPROP — add a new property
  if (cmd === 'addprop') {
    agentSessions[agent.phone] = { step: 'addprop_name', isAgent: true, agentCode: code, agent };
    return `🏠 *Nayi Property Add Karein*\n\nProperty ka naam kya hai?\n(e.g. "Sunrise Heights")`;
  }

  // UPGRADE
  if (cmd === 'upgrade') {
    return `⬆️ *Upgrade to Pro — ₹999/month*\n\nPro features:\n✅ Unlimited leads\n✅ Priority support\n✅ Custom bot messages\n✅ Full analytics\n\nPayment link: (coming soon)\nYa call karein: ${process.env.AGENT_PHONE || 'our team'}\n\nHum manually activate kar denge! 🙏`;
  }

  // HELP
  if (cmd === 'help') {
    return `🤖 *PropBot Agent Commands*\n${'─'.repeat(22)}\n\nLEADS → aaj ke leads\nSTATS → monthly report\nADDPROP → nayi property add karo\nUPGRADE → Pro plan mein upgrade karo\nMYLINK → apna bot link dekho\nHELP → yeh menu\n\nAgent Code: *${code}*`;
  }

  // MYLINK
  if (cmd === 'mylink') {
    const waLink = `https://wa.me/${process.env.TWILIO_WHATSAPP_NUMBER?.replace('+','')}?text=${code}`;
    return `🔗 *Aapka PropBot Link*\n\n${waLink}\n\nYeh link buyers ko bhejein — bot automatically aapke liye lead capture karega! 🚀`;
  }

  return null; // not an agent command
}

// ─── BUYER FLOW ───────────────────────────────────────────────────────────────
async function handleBuyerMessage(phone, text, num, twilio) {
  let s = buyerSessions[phone];
  if (!s) return null;

  const agent = agentCache.find(a => a.agentCode === s.agentCode);
  if (!agent) {
    delete buyerSessions[phone];
    return null;
  }

  // Reset
  if (['reset', 'menu', '0'].includes(text)) {
    delete buyerSessions[phone];
    return null;
  }

  // ── ask_name ──
  if (s.step === 'ask_name') {
    if (text.length < 2) return 'Apna naam batayein:';
    s.name = text.split(' ')[0];
    s.step = 'ask_bhk';
    return `Shukriya *${s.name} ji*! 🙏\n\nKaunsa property type chahiye?\n\n1️⃣  1 BHK\n2️⃣  2 BHK\n3️⃣  3 BHK\n4️⃣  4 BHK / Villa\n5️⃣  Commercial / Office`;
  }

  // ── ask_bhk ──
  if (s.step === 'ask_bhk') {
    const m = { '1':'1 BHK','2':'2 BHK','3':'3 BHK','4':'4 BHK','5':'Commercial' };
    if (!m[num]) return '1 se 5 ke beech number bhejein 😊';
    s.bhk = m[num];
    s.step = 'ask_budget';
    return `*${s.bhk}* — aapka budget?\n\n1️⃣  50 Lakh se kam\n2️⃣  50 Lakh – 1 Crore\n3️⃣  1 Crore – 2 Crore\n4️⃣  2 Crore se zyada`;
  }

  // ── ask_budget ──
  if (s.step === 'ask_budget') {
    const m = { '1':'under_50L','2':'50L_1Cr','3':'1Cr_2Cr','4':'above_2Cr' };
    if (!m[num]) return '1 se 4 ke beech number bhejein 😊';
    s.budget = m[num];
    s.step = 'ask_timeline';
    return `Kab tak lena chahte hain?\n\n1️⃣  Turant (1-30 days)\n2️⃣  1–3 mahine mein\n3️⃣  3–6 mahine mein\n4️⃣  Abhi sirf dekh rahe hain`;
  }

  // ── ask_timeline ──
  if (s.step === 'ask_timeline') {
    const m = { '1':'immediate','2':'1_3months','3':'3_6months','4':'just_looking' };
    if (!m[num]) return '1 se 4 ke beech number bhejein 😊';
    s.timeline = m[num];
    s.step = 'ask_purpose';
    return `Property kisliye chahiye?\n\n1️⃣  Khud rehne ke liye\n2️⃣  Investment ke liye\n3️⃣  Dono`;
  }

  // ── ask_purpose → show properties ──
  if (s.step === 'ask_purpose') {
    const m = { '1':'self_use','2':'investment','3':'both' };
    if (!m[num]) return '1, 2 ya 3 bhejein 😊';
    s.purpose = m[num];
    s.step = 'show_props';
    s.leadScore = calcScore(s);
    s.leadTemp  = getTemp(s.leadScore);

    const props = agent.properties || [];
    if (!props.length) {
      // No properties yet — save lead and notify agent
      await saveAgentLead(agent.agentCode, {
        phone, name: s.name, bhk: s.bhk, budget: s.budget,
        location: agent.city, timeline: s.timeline, purpose: s.purpose,
        score: s.leadScore, temp: s.leadTemp, notes: 'Lead captured — no properties listed yet'
      });
      await notifyAgentOfLead(agent, s, twilio);
      s.step = 'done';
      return `🙏 *${s.name} ji*, hum aapko *${agent.city}* mein best properties find karne mein help karenge!\n\n${agent.name} (${agent.businessName}) aapko jald call karenge.\n📞 Direct contact ke liye reply karo.`;
    }

    s.props = props;
    let msg = `🎯 *${props.length} properties mili — ${agent.businessName}*\n${'─'.repeat(22)}\n\n`;
    props.forEach((p, i) => {
      msg += `*${i+1}. ${p.name}*\n📍 ${p.location}\n💰 ${p.price} | 🏠 ${p.bhk}\n\n`;
    });
    msg += `Kaunsi property mein interest hai? (1–${props.length}):`;
    return msg;
  }

  // ── show_props → pick property ──
  if (s.step === 'show_props') {
    const idx = parseInt(num) - 1;
    if (isNaN(idx) || idx < 0 || idx >= s.props.length) return `1 se ${s.props.length} ke beech number bhejein 😊`;
    s.selectedProp = s.props[idx];
    s.step = 'ask_action';
    const p = s.selectedProp;
    return `✅ *${p.name}*\n${'─'.repeat(22)}\n📍 ${p.location}\n💰 ${p.price}\n🏠 ${p.bhk}\n${'─'.repeat(22)}\n\nKya karna chahenge?\n\n1️⃣  Site visit book karein 📅\n2️⃣  Aur properties dekhni hain 🔍\n3️⃣  Agent se baat karni hai 📞`;
  }

  // ── ask_action ──
  if (s.step === 'ask_action') {
    if (num === '1') {
      s.step = 'ask_slot';
      const slots = generateSlots();
      s.slots = slots;
      let msg = `📅 *Site Visit — ${s.selectedProp.name}*\n${'─'.repeat(22)}\n\n`;
      slots.forEach((sl, i) => { msg += `${i+1}️⃣  ${sl}\n`; });
      return msg + '\nSlot number bhejein:';
    }
    if (num === '2') {
      s.step = 'show_props';
      let msg = `🔍 *Saari properties:*\n\n`;
      s.props.forEach((p, i) => { msg += `*${i+1}. ${p.name}*\n📍 ${p.location} | 💰 ${p.price}\n\n`; });
      return msg + `Number bhejein (1–${s.props.length}):`;
    }
    if (num === '3') {
      await saveAgentLead(agent.agentCode, {
        phone, name: s.name, bhk: s.bhk, budget: s.budget,
        location: agent.city, timeline: s.timeline, purpose: s.purpose,
        score: s.leadScore, temp: s.leadTemp,
        notes: `Agent se baat mangyi — ${s.selectedProp?.name}`
      });
      await notifyAgentOfLead(agent, s, twilio);
      s.step = 'done';
      return `📞 *Agent Connect*\n${'─'.repeat(22)}\n*${agent.name}* — ${agent.businessName}\nAapko 15 minutes mein call karenge!\n\nShukriya ${s.name} ji! 🙏`;
    }
    return '1, 2 ya 3 bhejein 😊';
  }

  // ── ask_slot ──
  if (s.step === 'ask_slot') {
    const idx = parseInt(num) - 1;
    if (isNaN(idx) || !s.slots || idx < 0 || idx >= s.slots.length) return `1 se ${s.slots?.length || 6} ke beech number bhejein 😊`;
    s.visitSlot = s.slots[idx];
    s.step = 'confirm_name';
    return `✅ *${s.visitSlot}* lock! 🎉\n\nConfirmation ke liye aapka *poora naam* batayein:`;
  }

  // ── confirm_name → book visit ──
  if (s.step === 'confirm_name') {
    s.fullName = text;
    s.bookedVisit = true;
    s.leadScore = calcScore(s);
    s.leadTemp  = getTemp(s.leadScore);
    const p = s.selectedProp;

    await saveAgentLead(agent.agentCode, {
      phone, name: s.fullName, bhk: s.bhk, budget: s.budget,
      location: p?.location || agent.city, timeline: s.timeline, purpose: s.purpose,
      score: s.leadScore, temp: s.leadTemp,
      notes: `Visit booked: ${p?.name} @ ${s.visitSlot}`
    });
    await notifyAgentOfLead(agent, s, twilio);
    s.step = 'done';

    const visitId = 'PV' + Date.now().toString().slice(-6);
    return `🎉 *Site Visit Confirmed!*\n${'═'.repeat(22)}\n👤 *${s.fullName}*\n🏠 ${p?.name}\n📍 ${p?.location}\n📅 ${s.visitSlot}\n👔 Agent: ${agent.name}\n🆔 Booking ID: *${visitId}*\n${'═'.repeat(22)}\n\n⏰ 1 ghante pehle reminder milega!\n\nShukriya! Koi sawaal ho to yahan reply karein. 🙏`;
  }

  return `Madad ke liye *0* ya *menu* bhejein 😊`;
}

async function notifyAgentOfLead(agent, s, twilio) {
  try {
    const temp = s.leadTemp === 'hot' ? '🔥 HOT' : s.leadTemp === 'warm' ? '🌡️ WARM' : '❄️ COLD';
    const visitInfo = s.bookedVisit ? `\n📅 Visit: ${s.visitSlot} — ${s.selectedProp?.name}` : '';
    await sendWA(twilio, agent.phone, `🔔 *NEW ${temp} LEAD — ${agent.businessName}*\n${'─'.repeat(22)}\n👤 ${s.name || s.fullName}\n📱 ${s.phone?.replace('whatsapp:','')}\n🏠 ${s.bhk} | 💰 ${s.budget}\n⏰ Timeline: ${s.timeline}${visitInfo}\n📊 Score: ${s.leadScore}/10\n\nLEADS type karo sab leads dekhne ke liye 📋`);
  } catch(e) { console.log('[saasbot] Agent notify error:', e.message); }
}

// ─── AGENT PROP ADDITION FLOW ─────────────────────────────────────────────────
async function handleAgentPropAddition(phone, text, twilio) {
  const s = agentSessions[phone];
  if (!s?.isAgent) return null;

  const agent = s.agent || agentCache.find(a => a.agentCode === s.agentCode);
  if (!agent) return null;

  if (s.step === 'addprop_name') {
    s.newProp = { name: text };
    s.step = 'addprop_price';
    return `*${text}* — price/range kya hai?\n(e.g. "75 Lakh", "1.2 Crore")`;
  }
  if (s.step === 'addprop_price') {
    s.newProp.price = text;
    s.step = 'addprop_location';
    return `Location/area?\n(e.g. "Wardha Road, Nagpur")`;
  }
  if (s.step === 'addprop_location') {
    s.newProp.location = text;
    s.step = 'addprop_bhk';
    return `BHK type?\n(e.g. "2 BHK, 3 BHK")`;
  }
  if (s.step === 'addprop_bhk') {
    s.newProp.bhk = text;
    const updatedProps = [...(agent.properties || []), s.newProp];
    await updateAgentField(agent.agentCode, 'properties', updatedProps);
    await refreshAgentCache();
    delete agentSessions[phone];
    return `✅ *${s.newProp.name}* add ho gayi!\n\nAb aapke paas *${updatedProps.length}* properties hain.\n\nAur property add karni hai? "ADDPROP" bhejein.`;
  }

  return null;
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
// Returns reply string or null (if message doesn't belong to saasbot)
async function handleSaasMessage(phone, body, twilio) {
  const text = body.toLowerCase().trim();
  const num  = body.trim();

  // 1. Agent mid-flow (property addition)
  if (agentSessions[phone]?.isAgent) {
    return handleAgentPropAddition(phone, body.trim(), twilio);
  }

  // 2. Agent registration in progress
  if (agentSessions[phone]) {
    return handleAgentRegistration(phone, body.trim(), twilio);
  }

  // 3. Trigger new agent registration
  if (['join', 'agent', 'register', 'join propbot', 'propbot agent'].includes(text)) {
    return handleAgentRegistration(phone, body.trim(), twilio);
  }

  // 4. Existing agent commands (check if this phone is a registered agent)
  const registeredAgent = agentCache.find(a => a.phone === phone || a.phone === phone.replace('whatsapp:',''));
  if (registeredAgent) {
    const cmd = text.replace('whatsapp:', '').trim();
    const cmdReply = await handleAgentCommand(registeredAgent, cmd, twilio);
    if (cmdReply) return cmdReply;
  }

  // 5. Buyer in active session
  if (buyerSessions[phone]) {
    return handleBuyerMessage(phone, text, num, twilio);
  }

  // 5b. Offer reply from retargeted buyer (no active session)
  if (['visit', 'book', 'haan', 'loan'].includes(text)) {
    // Find which agent this buyer belongs to (check all agents' leads)
    const agents = agentCache;
    for (const agent of agents) {
      try {
        const leads = await getAgentLeads(agent.agentCode);
        const lead = leads.find(l => l.phone === phone || l.phone === phone.replace('whatsapp:',''));
        if (lead) {
          // Restart buyer session for this agent
          buyerSessions[phone] = {
            step: 'show_props',
            phone,
            agentCode: agent.agentCode,
            name: lead.name,
            bhk: lead.bhk,
            budget: lead.budget,
            timeline: lead.timeline,
            purpose: lead.purpose,
            props: agent.properties || []
          };
          const offerMsg = text === 'loan'
            ? `🏦 *FREE Home Loan Consultation*\n\nPerfect ${lead.name} ji!\n\n*${agent.name}* aapko 30 min mein call karenge aur:\n✅ Best bank rate batayenge\n✅ EMI calculate karenge\n✅ Loan eligibility check karenge\n\nSaath mein — site visit bhi book karein?\n\n1️⃣ Haan, visit bhi book karo\n2️⃣ Pehle sirf loan consultation`
            : `🎉 *Bilkul sahi decision ${lead.name} ji!*\n\nAapki property dekhte hain — ${agent.businessName}\n`;

          if (text === 'loan') return offerMsg;

          // Show properties again
          const props = agent.properties || [];
          if (!props.length) return `${agent.name} aapko turant call karenge! 📞`;
          let msg = `🏠 *${agent.businessName} — Properties*\n${'─'.repeat(22)}\n\n`;
          props.forEach((p, i) => { msg += `*${i+1}. ${p.name}*\n📍 ${p.location}\n💰 ${p.price} | 🏠 ${p.bhk}\n\n`; });
          msg += `Number bhejein (1–${props.length}):`;
          return msg;
        }
      } catch(e) { /* skip */ }
    }
  }

  // 6. Buyer starts new session with agent code (e.g., "PROP001")
  const codeMatch = body.trim().toUpperCase().match(/^(PROP\d+)/);
  if (codeMatch) {
    const code  = codeMatch[1];
    const agent = agentCache.find(a => a.agentCode === code);
    if (agent) {
      buyerSessions[phone] = { step: 'ask_name', phone, agentCode: code };
      return `🏠 *${agent.businessName}*\n${'═'.repeat(22)}\n\nNamaste! Main aapko *${agent.city}* mein perfect property dhundhne mein madad karunga — *24/7, bilkul FREE!*\n\n✅ ${agent.properties?.length || 'Multiple'} verified properties\n✅ Free site visit booking\n✅ Expert agent support\n\nChalu karte hain! Aapka naam kya hai? 😊`;
    }
  }

  // 7. Not a saasbot message
  return null;
}

// ─── RETARGETING (called by scheduler) ───────────────────────────────────────
async function runSaasRetargeting(twilio) {
  const agents = await getAgents();
  const MSGS = {
    // Day 1 — Free home loan consultation offer
    1: (l, a) => `🎁 *Special Offer — ${a.businessName}*\n${'─'.repeat(24)}\n\nNamaste *${l.name} ji*!\n\nSirf aapke liye — *FREE Home Loan Consultation* offer kar rahe hain! 🏦\n\n✅ Best interest rate find karenge\n✅ EMI calculate karenge aapke budget ke hisaab se\n✅ 10 min mein loan eligibility pata chalegi\n\n*${l.bhk}* ke liye aapka budget *${budgetLabel(l.budget)}* hai — aapko *${loanEstimate(l.budget)} ka loan* easily mil sakta hai!\n\n👇 Abhi book karo FREE consultation:\nReply *"LOAN"* ya call: ${a.name}`,

    // Day 3 — Limited time discount offer
    3: (l, a) => `⚡ *Limited Offer — Sirf 48 Ghante!*\n${'─'.repeat(24)}\n\nNamaste *${l.name} ji*! 🏠\n\n*${a.businessName}* ki taraf se special offer:\n\n🔥 *Site Visit karo — FREE Gift paao!*\n🎁 Amazon voucher worth ₹500 guaranteed\n📋 Floor plan + price sheet FREE\n🏦 Home loan assistance FREE\n\n*${l.bhk}* (Budget: ${budgetLabel(l.budget)}) — humare paas *perfect match* available hai ${a.city} mein!\n\n⏰ Offer sirf *2 din* ke liye valid hai.\n\n👇 Abhi visit book karo:\nReply *"VISIT"* aur slot confirm ho jayega!`,

    // Day 7 — FOMO + price hike alert
    7: (l, a) => `🚨 *Price Alert — ${a.city}*\n${'─'.repeat(24)}\n\n*${l.name} ji*, ek zaruri baat!\n\n📈 *${a.city} mein property rates is mahine badh rahe hain.*\n\nJo *${l.bhk}* aap dekh rahe the — uski price *next month se higher* ho sakti hai.\n\n━━━━━━━━━━━━━━━━━━━\n💰 Aapka budget: ${budgetLabel(l.budget)}\n🏠 Type: ${l.bhk}\n📍 Location: ${a.city}\n🎯 Ab bhi aapke budget mein available hai!\n━━━━━━━━━━━━━━━━━━━\n\n*Aaj visit karo → aaj ki rate mein book karo.*\n\nReply *"BOOK"* → hum turant slot confirm karenge.\n\nYa call karein: *${a.name}* — ${a.phone?.replace('whatsapp:','')}`
  };

  // Helper labels for offers
  function budgetLabel(b) {
    const m = { under_50L:'₹50L se kam', '50L_1Cr':'₹50L–1Cr', '1Cr_2Cr':'₹1Cr–2Cr', above_2Cr:'₹2Cr+' };
    return m[b] || b;
  }
  function loanEstimate(b) {
    const m = { under_50L:'₹35–40 Lakh', '50L_1Cr':'₹65–80 Lakh', '1Cr_2Cr':'₹1.2–1.5 Crore', above_2Cr:'₹1.8 Crore+' };
    return m[b] || '₹50 Lakh+';
  }

  for (const agent of agents) {
    if (agent.status !== 'active') continue;
    try {
      const leads = await getAgentLeads(agent.agentCode);
      for (const lead of leads) {
        if (!lead.timestamp) continue;
        if (lead.notes?.includes('Visit booked')) continue;
        const days = daysSince(lead.timestamp);
        for (const day of [1, 3, 7]) {
          const key = `followUp${day}`;
          if (lead[key] === 'sent') continue;
          if (days < day || days > day + 1) continue;
          try {
            await sendWA(twilio, lead.phone, MSGS[day](lead, agent));
            const { updateAgentLeadFollowUp } = require('./sheets');
            await updateAgentLeadFollowUp(agent.agentCode, lead.rowIndex, day, 'sent');
            console.log(`[saasbot] Retarget Day ${day} → ${lead.name} (${agent.agentCode})`);
          } catch(e) {
            console.log(`[saasbot] Retarget send error:`, e.message);
          }
          break;
        }
      }
    } catch(e) { console.log(`[saasbot] Retarget error (${agent.agentCode}):`, e.message); }
  }
}

module.exports = { handleSaasMessage, runSaasRetargeting, refreshAgentCache };
