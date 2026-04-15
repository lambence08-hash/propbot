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
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'All Leads!A:K' });
    const rows = res.data.values || [];
    return rows.slice(1).map(r => ({
      timestamp: r[0], phone: r[1], name: r[2], budget: r[3],
      bhk: r[4], location: r[5], timeline: r[6], purpose: r[7],
      leadScore: r[8], leadTemp: r[9], notes: r[10]
    }));
  } catch(e) { console.error('Sheets getLeads error:', e.message); return []; }
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

module.exports = { saveVisitBooking, saveLead, getLeads, getVisits };
