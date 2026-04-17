// ─── LeadPilot — Multi-Client Configuration ───────────────────────────────────
// Add a new client here — bot + dashboard auto-configure

module.exports = {

  'shivam-chemical': {
    id:          'shivam-chemical',
    name:        'Shivam Chemical',
    tagline:     'Quality Chemical Solutions',
    ownerPhone:  '+919322509198',
    ownerName:   'Shivam ji',
    color:       '#1a5276',
    emoji:       '🧪',
    sheetRange:  'Chem Inquiries',
    followUpDays: [3, 7, 30],

    greeting: `🧪 *Shivam Chemical — AI Assistant*\n══════════════════════\n\nNamaste! Main aapko sahi chemical product dhundhne mein madad karunga!\n\n✅ 500+ quality products\n✅ Bulk orders available\n✅ Pan India delivery\n\nAapka naam kya hai? 😊`,

    flow: [
      {
        key: 'name',
        ask: null, // Asked in greeting
        validate: (val) => val.length >= 2,
        invalidMsg: 'Kripya apna naam likhein 🙏',
        next: 'customerType'
      },
      {
        key: 'customerType',
        ask: (s) => `Shukriya *${s.name} ji*! 🙏\n\nAap kiske liye product chahiye?\n\n🏢 Office / Corporate\n🍽️ Restaurant / Hotel\n🏥 Hospital / Healthcare\n🏭 Factory / Industrial\n🏠 Home / Personal Use\n\n*Seedha type karein*`,
        parse: (text) => {
          if (text.includes('office') || text.includes('corporate')) return 'office';
          if (text.includes('restaurant') || text.includes('hotel') || text.includes('dhaba')) return 'restaurant';
          if (text.includes('hospital') || text.includes('clinic') || text.includes('medical')) return 'hospital';
          if (text.includes('factory') || text.includes('industrial') || text.includes('warehouse')) return 'factory';
          if (text.includes('home') || text.includes('ghar') || text.includes('personal')) return 'home';
          return 'other';
        },
        label: { office:'Office/Corporate', restaurant:'Restaurant/Hotel', hospital:'Hospital/Healthcare', factory:'Factory/Industrial', home:'Home/Personal', other:'Other' },
        next: 'product'
      },
      {
        key: 'product',
        ask: (s) => `Samajh gaya! Kaunsa product chahiye?\n\n🧹 Floor Cleaner\n🚽 Toilet / Bathroom Cleaner\n🧴 Handwash / Sanitizer\n🍳 Kitchen Degreaser\n🪟 Glass Cleaner\n🧪 Lab Chemicals\n\n*Product ka naam type karein* 😊`,
        parse: (text, body) => body,
        next: 'quantity'
      },
      {
        key: 'quantity',
        ask: (s) => `*${s.product}* — bilkul! 👍\n\nKitna quantity chahiye?\n\n🔹 Thoda (5-10 units)\n🔸 Medium (50-100 units)\n🔴 Bulk (500+ units)\n\n*Type karein* 📦`,
        parse: (text) => {
          if (text.includes('bulk') || text.includes('bada') || text.includes('500')) return 'bulk';
          if (text.includes('medium') || text.includes('50') || text.includes('100')) return 'medium';
          return 'small';
        },
        next: 'city'
      },
      {
        key: 'city',
        ask: () => `Delivery kahan chahiye?\n\n*Apna city type karein* 📍`,
        parse: (text, body) => body,
        next: 'done'
      }
    ],

    scoreCalc: (s) => {
      const q = { bulk:3, medium:2, small:1 };
      const t = { hospital:3, factory:3, restaurant:2, office:2, home:1, other:0 };
      return Math.min((q[s.quantity]||0) + (t[s.customerType]||0), 5);
    },

    completionMsg: (s) => `✅ *Inquiry Received!*\n══════════════════\n\n👤 Naam: ${s.name}\n📦 Product: ${s.product}\n🔢 Quantity: ${s.quantity}\n📍 City: ${s.city}\n\nHumari team *24 ghante mein* contact karegi!\n\n📱 Abhi call karein: *+91-93225 09198*\n\n🔗 Catalog: https://propbot-production-c3e6.up.railway.app/shivam-catalog\n\n*Shivam Chemical — Quality Guaranteed* 🧪`,

    followUpMessages: {
      3:  (s) => `Namaste *${s.name} ji*! 🙏\n\nShivam Chemical se main bol raha hun.\n\nAapne *${s.product}* ke liye inquiry ki thi — kya decide kiya?\n\nIs hafte order karo toh *special price* milegi! 🎁\n\n📞 *+91-93225 09198*`,
      7:  (s) => `Namaste *${s.name} ji*! 🧪\n\nAapne *${s.product}* ke liye baat ki thi.\n\n🔴 Bulk order pe abhi *15% OFF* chal raha hai!\n⏰ Yeh offer 3 din mein khatam hoga.\n\nAbhi order karein: *+91-93225 09198*`,
      30: (s) => `Namaste *${s.name} ji*! 🙏\n\nEk mahina ho gaya — stock khatam hone wala hoga!\n\n*${s.product}* ka reorder karna hai?\n\nHum same rate + free delivery denge! 📦\n\n📞 *+91-93225 09198*`
    }
  },

  // ─── Template for new clients (copy & fill) ─────────────────────────────────
  // 'new-client-id': {
  //   id: 'new-client-id',
  //   name: 'Business Name',
  //   ownerPhone: '+91XXXXXXXXXX',
  //   color: '#your-color',
  //   emoji: '🏢',
  //   sheetRange: 'Sheet Tab Name',
  //   followUpDays: [3, 7, 30],
  //   greeting: '...',
  //   flow: [...],
  //   scoreCalc: (s) => ...,
  //   completionMsg: (s) => `...`,
  //   followUpMessages: { 3: (s) => `...`, 7: (s) => `...`, 30: (s) => `...` }
  // }
};
