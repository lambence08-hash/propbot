// ─── LeadPilot — Auto Follow-Up Scheduler ────────────────────────────────────
// Checks every hour. Sends WhatsApp follow-up on Day 3, 7, 30 automatically.

const { getUniversalLeads, updateFollowUpDay } = require('./sheets');

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

// ─── Start Scheduler ──────────────────────────────────────────────────────────
function startScheduler() {
  console.log('[scheduler] LeadPilot Follow-Up Scheduler started');

  // Run immediately on start (for testing)
  setTimeout(runFollowUpCheck, 10000);

  // Run every hour
  setInterval(runFollowUpCheck, 60 * 60 * 1000);
}

module.exports = { startScheduler, runFollowUpCheck };
