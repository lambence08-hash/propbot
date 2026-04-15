const { google } = require('googleapis');
function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
async function saveVisitBooking({ phone, name, property, location, price, slot, budget, bhk, timestamp }) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: 'Site Visits!A:J', valueInputOption: 'USER_ENTERED', requestBody: { values: [[timestamp, phone, name, property, location, price, slot, budget, bhk, 'Confirmed']] } });
    console.log('Visit saved to sheets!');
  } catch(e) { console.error('Sheets error:', e.message); }
}
module.exports = { saveVisitBooking };
