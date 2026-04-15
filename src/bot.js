require('dotenv').config();
const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
const sheets = require('./sheets');
const properties = require('../config/properties');
const app = express();
app.use(express.urlencoded({ extended: false }));
const sessions = {};
function getSession(p) { if (!sessions[p]) sessions[p] = { step:'start' }; return sessions[p]; }
app.post('/webhook', async (req, res) => {
  const twiml = new MessagingResponse();
  const phone = req.body.From || '';
  const body = (req.body.Body || '').trim();
  const session = getSession(phone);
  const reply = await handleMessage(phone, body, session);
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});
async function handleMessage(phone, body, session) {
  const text = body.toLowerCase().trim();
  if (['reset','menu','0'].includes(text)) { sessions[phone] = {step:'start'}; return welcome(); }
  if (session.step === 'start') { session.step = 'ask_name'; return welcome(); }
  if (session.step === 'ask_name') { session.name = body.split(' ')[0]; session.step = 'ask_budget'; return `Shukriya *${session.name} ji*! 🙏\n\nBudget kya hai?\n1️⃣ 50L se kam\n2️⃣ 50L–1Cr\n3️⃣ 1Cr–2Cr\n4️⃣ 2Cr+`; }
  if (session.step === 'ask_budget') {
    const m = {'1':'under_50L','2':'50L_1Cr','3':'1Cr_2Cr','4':'above_2Cr'};
    if (!m[text]) return '1 se 4 ke beech number bhejein 😊';
    session.budget = m[text]; session.step = 'ask_location';
    return 'Kahan chahiye property?\n1️⃣ Noida\n2️⃣ Gurugram\n3️⃣ Delhi\n4️⃣ Faridabad\n5️⃣ Koi bhi';
  }
  if (session.step === 'ask_location') {
    const m = {'1':'Noida','2':'Gurugram','3':'Delhi','4':'Faridabad','5':'Any'};
    if (!m[text]) return '1 se 5 ke beech number bhejein 😊';
    session.location = m[text]; session.step = 'ask_bhk';
    return 'Kitne BHK chahiye?\n1️⃣ 1 BHK\n2️⃣ 2 BHK\n3️⃣ 3 BHK\n4️⃣ 4 BHK / Villa\n5️⃣ Commercial';
  }
  if (session.step === 'ask_bhk') {
    const m = {'1':'1BHK','2':'2BHK','3':'3BHK','4':'4BHK+','5':'Commercial'};
    if (!m[text]) return '1 se 5 ke beech number bhejein 😊';
    session.bhk = m[text]; session.step = 'show_properties';
    const f = properties.filter(p => (session.location==='Any'||p.location.includes(session.location)) && p.bhk===m[text] && p.budget_category===session.budget);
    if (!f.length) { session.step='done'; return `😔 *${session.name} ji* abhi koi property nahi mili. Nayi aane pe inform karenge! ✅`; }
    session.filteredProperties = f;
    let msg = `🎯 *${f.length} properties mili hain:*\n━━━━━━━━━━━━━━━━\n\n`;
    f.forEach((p,i) => { msg += `*${i+1}. ${p.name}*\n📍 ${p.location}\n💰 ${p.price}\n📐 ${p.area}\n✨ ${p.amenities}\n\n`; });
    return msg + 'Kaunsi chahiye? Number bhejein:';
  }
  if (session.step === 'show_properties') {
    const idx = parseInt(text)-1;
    const f = session.filteredProperties||[];
    if (isNaN(idx)||idx<0||idx>=f.length) return `1 se ${f.length} ke beech number bhejein`;
    session.selectedProperty = f[idx]; session.step = 'ask_visit';
    const p = f[idx];
    return `✅ *${p.name}*\n\n📍 ${p.location}\n💰 ${p.price}\n📐 ${p.area}\n🏗 ${p.status}\n\nSite visit book karein?\n1️⃣ Haan, book karo\n2️⃣ Aur properties dekhni hain\n3️⃣ Agent se baat karni hai`;
  }
  if (session.step === 'ask_visit') {
    if (text==='1') {
      session.step = 'ask_slot';
      const now = new Date();
      const slots = [];
      for(let d=1;d<=3;d++) { const dt=new Date(now); dt.setDate(now.getDate()+d); const dn=dt.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'}); slots.push(`${dn} — 10:00 AM`); slots.push(`${dn} — 4:00 PM`); }
      session.slots = slots.slice(0,6);
      let msg = '📅 *Slot choose karein:*\n\n';
      session.slots.forEach((s,i) => { msg += `${i+1}️⃣ ${s}\n`; });
      return msg;
    }
    if (text==='3') { session.step='done'; return '📞 Agent aapko call karenge!\nDirect: *+91-98765-43210*'; }
    return '1, 2 ya 3 bhejein 😊';
  }
  if (session.step === 'ask_slot') {
    const idx = parseInt(text)-1;
    if (isNaN(idx)||idx<0||idx>5) return '1 se 6 ke beech number bhejein';
    session.visitSlot = session.slots[idx]; session.step = 'ask_name_confirm';
    return `✅ ${session.visitSlot} — perfect!\n\nAapka *poora naam* batayein confirm ke liye:`;
  }
  if (session.step === 'ask_name_confirm') {
    session.fullName = body; session.step = 'done';
    const p = session.selectedProperty;
    try { await sheets.saveVisitBooking({ phone, name:session.fullName, property:p.name, location:p.location, price:p.price, slot:session.visitSlot, budget:session.budget, bhk:session.bhk, timestamp:new Date().toISOString() }); } catch(e) {}
    return `🎉 *Site Visit Confirmed!*\n━━━━━━━━━━━━━━━━\n👤 ${session.fullName}\n🏠 ${p.name}\n📅 ${session.visitSlot}\n👔 Agent: Rahul Sharma\n📞 +91-98765-43210\n━━━━━━━━━━━━━━━━\n✅ 1 ghante pehle reminder milega!\n\nShukriya! 🙏`;
  }
  return 'Madad ke liye *menu* type karein 😊';
}
function welcome() { return '🏠 *PropBot — Property Assistant*\n\nNamaste! Sahi property dhundhne mein madad karunga.\n\nAapka naam kya hai?'; }
app.get('/', (req, res) => res.json({ status:'PropBot running ✅' }));
app.listen(process.env.PORT||3000, () => console.log('🚀 PropBot running!'));
