const { google } = require('googleapis');
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

async function getSheets() {
  const auth = await getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function saveVisitBooking({ phone, name, property, location, price, slot, budget, bhk, timestamp }) {
  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Site Visits!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timestamp, phone, name, property, location, price, slot, budget, bhk, 'Confirmed']] }
    });
  } catch(e) { console.error('Sheets saveVisit error:', e.message); }
}

async function saveLead({ phone, name, budget, bhk, location, timeline, purpose, leadScore, leadTemp, timestamp, notes }) {
  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'All Leads!A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timestamp, phone, name, budget, bhk, location, timeline || '', purpose || '', leadScore || 0, leadTemp || 'cold', notes || '']] }
    });
  } catch(e) { console.error('Sheets saveLead error:', e.message); }
}

async function getLeads() {
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'All Leads!A:N' });
    const rows = res.data.values || [];
    return rows.slice(1).map((r, i) => ({
      rowIndex: i + 2,
      timestamp: r[0], phone: r[1], name: r[2], budget: r[3],
      bhk: r[4], location: r[5], timeline: r[6], purpose: r[7],
      leadScore: r[8], leadTemp: r[9], notes: r[10],
      followUpDay1:  r[11] || '',
      followUpDay3:  r[12] || '',
      followUpDay7:  r[13] || ''
    }));
  } catch(e) { console.error('Sheets getLeads error:', e.message); return []; }
}

async function updatePropBotFollowUp(rowIndex, day, status) {
  try {
    const sheets = await getSheets();
    const colMap = { 1: 'L', 3: 'M', 7: 'N' };
    const col = colMap[day] || 'L';
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `All Leads!${col}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status]] }
    });
  } catch(e) { console.error('Sheets updatePropBotFollowUp error:', e.message); }
}

async function getVisits() {
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Site Visits!A:J' });
    const rows = res.data.values || [];
    return rows.slice(1).map(r => ({
      timestamp: r[0], phone: r[1], name: r[2], property: r[3],
      location: r[4], price: r[5], slot: r[6], budget: r[7], bhk: r[8], status: r[9]
    }));
  } catch(e) { console.error('Sheets getVisits error:', e.message); return []; }
}

async function saveChemInquiry({ phone, name, customerType, product, quantity, city, score, timestamp, followUpStatus }) {
  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Chem Inquiries!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timestamp, phone, name, customerType, product, quantity, city, score, followUpStatus || 'pending']] }
    });
  } catch(e) { console.error('Sheets saveChemInquiry error:', e.message); }
}

async function getChemInquiries() {
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Chem Inquiries!A:I' });
    const rows = res.data.values || [];
    return rows.slice(1).map((r, i) => ({
      rowIndex: i + 2,
      timestamp: r[0], phone: r[1], name: r[2], customerType: r[3],
      product: r[4], quantity: r[5], city: r[6], score: r[7],
      followUpStatus: r[8] || 'pending'
    }));
  } catch(e) { console.error('Sheets getChemInquiries error:', e.message); return []; }
}

async function updateChemFollowUp({ phone, rowIndex, status }) {
  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Chem Inquiries!I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status]] }
    });
  } catch(e) { console.error('Sheets updateChemFollowUp error:', e.message); }
}

// ─── Universal Lead Functions (LeadPilot) ─────────────────────────────────────
async function saveUniversalLead(client, session) {
  try {
    const sheets = await getSheets();
    // Dynamic columns based on client flow
    const flowValues = client.flow.map(f => session[f.key] || '');
    const row = [
      session.timestamp, session.phone, ...flowValues,
      session.score || 0, 'pending', '', '', ''  // followUpStatus, day3, day7, day30
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${client.sheetRange}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
  } catch(e) { console.error(`Sheets saveUniversalLead (${client.id}) error:`, e.message); }
}

async function getUniversalLeads(client) {
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${client.sheetRange}!A:Z`
    });
    const rows = res.data.values || [];
    const flowKeys = client.flow.map(f => f.key);
    return rows.slice(1).map((r, i) => {
      const obj = { rowIndex: i + 2, timestamp: r[0], phone: r[1] };
      flowKeys.forEach((k, fi) => { obj[k] = r[2 + fi] || ''; });
      const base = 2 + flowKeys.length;
      obj.score          = r[base]     || 0;
      obj.followUpStatus = r[base + 1] || 'pending';
      obj.followUpDay3   = r[base + 2] || '';
      obj.followUpDay7   = r[base + 3] || '';
      obj.followUpDay30  = r[base + 4] || '';
      return obj;
    });
  } catch(e) { console.error(`Sheets getUniversalLeads (${client.id}) error:`, e.message); return []; }
}

async function updateFollowUpDay(client, rowIndex, day, status) {
  try {
    const sheets = await getSheets();
    const flowKeys = client.flow.map(f => f.key);
    const base = 2 + flowKeys.length; // timestamp + phone + flow fields
    const colOffset = { 3: 2, 7: 3, 30: 4 };
    const col = base + (colOffset[day] || 2);
    const colLetter = String.fromCharCode(65 + col);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${client.sheetRange}!${colLetter}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status]] }
    });
  } catch(e) { console.error(`Sheets updateFollowUpDay error:`, e.message); }
}

// ─── PropBot SaaS — Agent & Lead Functions ────────────────────────────────────

async function saveAgent({ agentCode, name, phone, businessName, city, plan, properties }) {
  try {
    const sheets = await getSheets();
    const timestamp = new Date().toISOString();
    const propsJson = JSON.stringify(properties || []);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'PropBot Agents!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timestamp, agentCode, name, phone, businessName, city, plan, 0, 'active', propsJson]] }
    });
  } catch(e) { console.error('Sheets saveAgent error:', e.message); }
}

async function getAgents() {
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'PropBot Agents!A:J' });
    const rows = res.data.values || [];
    return rows.slice(1).map((r, i) => ({
      rowIndex: i + 2,
      timestamp: r[0], agentCode: r[1], name: r[2], phone: r[3],
      businessName: r[4], city: r[5], plan: r[6],
      leadCount: parseInt(r[7]) || 0, status: r[8] || 'active',
      properties: (() => { try { return JSON.parse(r[9] || '[]'); } catch { return []; } })()
    }));
  } catch(e) { console.error('Sheets getAgents error:', e.message); return []; }
}

async function updateAgentField(agentCode, field, value) {
  try {
    const agents = await getAgents();
    const agent = agents.find(a => a.agentCode === agentCode);
    if (!agent) return;
    const sheets = await getSheets();
    const colMap = { timestamp:'A', agentCode:'B', name:'C', phone:'D', businessName:'E', city:'F', plan:'G', leadCount:'H', status:'I', properties:'J' };
    const col = colMap[field] || 'I';
    const val = field === 'properties' ? JSON.stringify(value) : value;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `PropBot Agents!${col}${agent.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[val]] }
    });
  } catch(e) { console.error('Sheets updateAgentField error:', e.message); }
}

async function saveAgentLead(agentCode, { phone, name, bhk, budget, location, timeline, purpose, score, temp, notes }) {
  try {
    const sheets = await getSheets();
    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${agentCode} Leads!A:M`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timestamp, phone, name, bhk, budget, location, timeline || '', purpose || '', score || 0, temp || 'cold', notes || '', '', '', '']] }
    });
    // Increment agent lead count
    const agents = await getAgents();
    const agent = agents.find(a => a.agentCode === agentCode);
    if (agent) await updateAgentField(agentCode, 'leadCount', agent.leadCount + 1);
  } catch(e) { console.error(`Sheets saveAgentLead (${agentCode}) error:`, e.message); }
}

async function getAgentLeads(agentCode) {
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${agentCode} Leads!A:N` });
    const rows = res.data.values || [];
    return rows.slice(1).map((r, i) => ({
      rowIndex: i + 2,
      timestamp: r[0], phone: r[1], name: r[2], bhk: r[3],
      budget: r[4], location: r[5], timeline: r[6], purpose: r[7],
      score: r[8], temp: r[9], notes: r[10],
      followUp1: r[11] || '', followUp3: r[12] || '', followUp7: r[13] || ''
    }));
  } catch(e) { console.error(`Sheets getAgentLeads (${agentCode}) error:`, e.message); return []; }
}

async function updateAgentLeadFollowUp(agentCode, rowIndex, day, status) {
  try {
    const sheets = await getSheets();
    const colMap = { 1: 'L', 3: 'M', 7: 'N' };
    const col = colMap[day] || 'L';
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${agentCode} Leads!${col}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status]] }
    });
  } catch(e) { console.error(`Sheets updateAgentLeadFollowUp error:`, e.message); }
}

// ─── PropBot SaaS — Sheet Setup ───────────────────────────────────────────────
async function setupPropBotAgentsSheet() {
  const sheets = await getSheets();
  // Get existing sheet names
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets.map(s => s.properties.title);

  const requests = [];

  if (!existing.includes('PropBot Agents')) {
    requests.push({ addSheet: { properties: { title: 'PropBot Agents' } } });
  }

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  }

  // Write headers to PropBot Agents tab
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'PropBot Agents!A1:J1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['Timestamp', 'Agent Code', 'Name', 'Phone', 'Business Name', 'City', 'Plan', 'Lead Count', 'Status', 'Properties (JSON)']] }
  });

  return { created: requests.length > 0, existing: existing.includes('PropBot Agents') };
}

module.exports = {
  saveVisitBooking, saveLead, getLeads, getVisits,
  saveChemInquiry, getChemInquiries, updateChemFollowUp,
  saveUniversalLead, getUniversalLeads, updateFollowUpDay,
  updatePropBotFollowUp,
  saveAgent, getAgents, updateAgentField, saveAgentLead, getAgentLeads, updateAgentLeadFollowUp,
  setupPropBotAgentsSheet
};
