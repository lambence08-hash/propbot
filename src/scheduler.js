// ─── LeadPilot — Auto Follow-Up Scheduler ────────────────────────────────────
// Checks every hour. Sends WhatsApp follow-up on Day 3, 7, 30 automatically.

const { getUniversalLeads, updateFollowUpDay, getLeads, updatePropBotFollowUp } = require('./sheets');
const { runSaasRetargeting } = require('./saasbot');

let universalbotModule = null; // lazy load to avoid circular deps

function getUBot() {
  if (!universalbotModule) universalbotModule = require('./universalbot');
  return universalbotModule;
}

function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

// ─── Send Owner WhatsApp Digest (always works) ────────────────────────────────
async function sendOwnerDigest(client, dueLeads) {
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    if (!dueLeads.length) return;

    const list = dueLeads.map((l, i) =>
      `${i+1}. *${l.name}* — ${l[client.flow?.[2]?.key] || 'product'} — ${l.city || ''}\n📱 ${l.phone?.replace('whatsapp:','')}`
    ).join('\n\n');

    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to:   `whatsapp:${client.ownerPhone}`,
      body: `⏰ *Follow-Up Reminder — ${client.name}*\n\n${dueLeads.length} customers ko aaj call karo!\n\n${list}\n\n📊 Dashboard: https://propbot-production-c3e6.up.railway.app/lp/${client.id}/dashboard\n\n_LeadPilot by YK_`
    });
    console.log(`[scheduler] Owner digest sent for ${client.id}: ${dueLeads.length} leads`);
  } catch(e) {
    console.log(`[scheduler] Owner digest error (${client.id}):`, e.message);
  }
}

// ─── Try sending direct to customer ──────────────────────────────────────────
async function tryCustomerFollowUp(client, lead, day) {
  const { sendFollowUp } = getUBot();
  const sent = await sendFollowUp(client, lead, day);
  if (sent) {
    await updateFollowUpDay(client, lead.rowIndex, day, 'sent');
    console.log(`[scheduler] Day ${day} follow-up sent to ${lead.name} (${lead.phone})`);
  }
  return sent;
}

// ─── Main Check Function ──────────────────────────────────────────────────────
async function runFollowUpCheck() {
  const { clients } = getUBot();
  console.log(`[scheduler] Running follow-up check — ${new Date().toLocaleString('en-IN')}`);

  for (const client of Object.values(clients)) {
    try {
      const leads = await getUniversalLeads(client);
      const dueForOwnerDigest = [];

      for (const lead of leads) {
        if (!lead.timestamp) continue;
        const days = daysSince(lead.timestamp);
        const followUpDays = client.followUpDays || [3, 7, 30];

        for (const targetDay of followUpDays) {
          // Check if this day's follow-up is due and not yet sent
          const statusKey = `followUpDay${targetDay}`;
          if (lead[statusKey] === 'sent') continue;
          if (days < targetDay) continue;
          if (days > targetDay + 1) continue; // Only send on the exact day (±1)

          console.log(`[scheduler] ${lead.name} — Day ${targetDay} follow-up due`);

          // Try sending to customer
          const sent = await tryCustomerFollowUp(client, lead, targetDay);

          // Always add to owner digest (so owner can manually call if auto-send fails)
          dueForOwnerDigest.push(lead);
          break; // Only one follow-up per lead per check
        }
      }

      // Send owner digest if anyone needs follow-up
      if (dueForOwnerDigest.length > 0) {
        await sendOwnerDigest(client, dueForOwnerDigest);
      }

    } catch(e) {
      console.log(`[scheduler] Error processing ${client.id}:`, e.message);
    }
  }
}

// ─── PropBot Follow-Up Messages ──────────────────────────────────────────────
const PROPBOT_MESSAGES = {
  1: (lead) => `Hi ${lead.name}! 👋\n\nYesterday aapne *${lead.bhk} BHK* property ki enquiry ki thi *${lead.location}* mein.\n\nKya aapko koi property pasand aayi? Ya koi sawaal hai?\n\nHum aapki help karne ke liye available hain! 🏠\n\nReply karo ya call karo: ${process.env.AGENT_PHONE || 'our team'}`,

  3: (lead) => `Hello ${lead.name}! 🏠\n\n3 din pehle aapne hum se baat ki thi *${lead.location}* mein *${lead.bhk} BHK* ke liye.\n\nHumne kuch nayi properties add ki hain jo aapke budget (${lead.budget}) mein fit hoti hain!\n\n✅ Ready to visit kisi property ko?\n\nSite visit book karne ke liye reply karo "VISIT" 📅`,

  7: (lead) => `Namaste ${lead.name}! 🙏\n\nAapne 1 hafta pehle ${lead.location} mein property dekhni thi.\n\nMarket mein prices badh rahe hain — ab sahi waqt hai decision lene ka! 📈\n\n💰 Budget: ${lead.budget}\n🏠 BHK: ${lead.bhk}\n📍 Location: ${lead.location}\n\nKya aap abhi bhi interested hain? Reply "HAAN" ya "NAHI" 😊`
};

async function runPropBotFollowUp() {
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const leads = await getLeads();
    const agentPhone = process.env.AGENT_PHONE || '+919999999999';
    const dueLeads = [];

    for (const lead of leads) {
      if (!lead.timestamp) continue;

      // Skip leads that already booked a visit
      if (lead.notes && lead.notes.toLowerCase().includes('visit booked')) continue;

      const days = daysSince(lead.timestamp);

      const followUpMap = [
        { day: 1, statusKey: 'followUpDay1' },
        { day: 3, statusKey: 'followUpDay3' },
        { day: 7, statusKey: 'followUpDay7' }
      ];

      for (const { day, statusKey } of followUpMap) {
        if (lead[statusKey] === 'sent') continue;
        if (days < day) continue;
        if (days > day + 1) continue; // ±1 day window

        console.log(`[scheduler] PropBot: ${lead.name} — Day ${day} follow-up due`);

        try {
          const msgFn = PROPBOT_MESSAGES[day];
          if (!msgFn) continue;

          await twilio.messages.create({
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to:   `whatsapp:${lead.phone}`,
            body: msgFn(lead)
          });

          await updatePropBotFollowUp(lead.rowIndex, day, 'sent');
          console.log(`[scheduler] PropBot: Day ${day} sent to ${lead.name} (${lead.phone})`);
          dueLeads.push({ ...lead, followUpDay: day });
        } catch(e) {
          console.log(`[scheduler] PropBot: Failed to send to ${lead.phone}:`, e.message);
          await updatePropBotFollowUp(lead.rowIndex, day, 'failed');
        }
        break; // one follow-up per lead per check
      }
    }

    // Send agent digest
    if (dueLeads.length > 0) {
      const list = dueLeads.map((l, i) =>
        `${i+1}. *${l.name}* — ${l.bhk} BHK, ${l.location} (Day ${l.followUpDay})\n📱 ${l.phone?.replace('whatsapp:', '')}`
      ).join('\n\n');

      await twilio.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to:   `whatsapp:${agentPhone}`,
        body: `⏰ *PropBot Follow-Up Summary*\n\n${dueLeads.length} leads ko aaj follow-up bheja gya:\n\n${list}\n\n_Ab inhe manually call karo! 📞_`
      });
    }
  } catch(e) {
    console.log('[scheduler] PropBot follow-up error:', e.message);
  }
}

// ─── Start Scheduler ──────────────────────────────────────────────────────────
function startScheduler() {
  console.log('[scheduler] LeadPilot Follow-Up Scheduler started');

  // Run immediately on start (for testing)
  setTimeout(runFollowUpCheck, 10000);
  setTimeout(runPropBotFollowUp, 15000);
  setTimeout(async () => {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await runSaasRetargeting(twilio);
  }, 20000);

  // Run every hour
  setInterval(runFollowUpCheck, 60 * 60 * 1000);
  setInterval(runPropBotFollowUp, 60 * 60 * 1000);
  setInterval(async () => {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await runSaasRetargeting(twilio);
  }, 60 * 60 * 1000);
}

module.exports = { startScheduler, runFollowUpCheck };
