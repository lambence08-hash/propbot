const express = require('express');
const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── AI Enhance Resume Content ────────────────────────────────────────────────
async function enhanceResume(data) {
  try {
    const prompt = `You are a professional resume writer. Enhance this student's resume data and return ONLY valid JSON.

Input data:
${JSON.stringify(data, null, 2)}

Return enhanced JSON in this exact format:
{
  "name": "full name",
  "phone": "phone number",
  "email": "email",
  "location": "city, state",
  "linkedin": "linkedin url or empty string",
  "objective": "2-3 sentence professional objective statement tailored to their goal",
  "education": [{"degree": "...", "institution": "...", "year": "...", "score": "..."}],
  "skills": {"technical": ["skill1","skill2"], "soft": ["skill1","skill2"]},
  "projects": [{"name": "...", "description": "2-3 line impactful description", "tech": "..."}],
  "achievements": ["achievement 1", "achievement 2"],
  "experience": [{"role": "...", "company": "...", "duration": "...", "points": ["point1","point2"]}],
  "languages": ["Hindi", "English"]
}

Rules:
- Make objective powerful and role-specific
- Enhance project descriptions with action verbs
- Keep all original data but make it more professional
- If experience is empty return empty array
- Return ONLY JSON, no explanation`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = msg.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : data;
  } catch(e) {
    console.error('AI enhance error:', e.message);
    return data;
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────
const templates = {

  modern: (d) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #2d3748; background: white; }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px 40px; }
  .header h1 { font-size: 28px; font-weight: 700; letter-spacing: 1px; }
  .header .title { font-size: 14px; opacity: 0.85; margin-top: 4px; }
  .contact-bar { display: flex; gap: 20px; margin-top: 12px; font-size: 12px; flex-wrap: wrap; }
  .contact-bar span { opacity: 0.9; }
  .body { display: grid; grid-template-columns: 1fr 2fr; gap: 0; }
  .sidebar { background: #f7f8fc; padding: 24px; border-right: 1px solid #e2e8f0; }
  .main { padding: 24px 32px; }
  .section { margin-bottom: 22px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 4px; margin-bottom: 12px; }
  .skill-tag { display: inline-block; background: #667eea; color: white; padding: 3px 10px; border-radius: 12px; font-size: 11px; margin: 3px 2px; }
  .skill-tag.soft { background: #764ba2; }
  .edu-item, .exp-item, .proj-item { margin-bottom: 14px; }
  .edu-item .degree { font-weight: 600; font-size: 13px; }
  .edu-item .inst { color: #4a5568; font-size: 12px; }
  .edu-item .year { color: #667eea; font-size: 11px; font-weight: 600; }
  .exp-item .role { font-weight: 600; color: #2d3748; }
  .exp-item .company { color: #667eea; font-size: 12px; }
  .exp-item ul { margin-left: 16px; margin-top: 4px; }
  .exp-item ul li { color: #4a5568; font-size: 12px; margin-bottom: 2px; }
  .proj-item .pname { font-weight: 600; color: #2d3748; }
  .proj-item .ptech { color: #667eea; font-size: 11px; font-weight: 600; }
  .proj-item .pdesc { color: #4a5568; font-size: 12px; margin-top: 3px; }
  .objective { color: #4a5568; line-height: 1.6; font-size: 13px; }
  .achieve-item { color: #4a5568; font-size: 12px; margin-bottom: 4px; padding-left: 12px; position: relative; }
  .achieve-item::before { content: '★'; color: #667eea; position: absolute; left: 0; font-size: 10px; }
  .lang-item { font-size: 12px; color: #4a5568; margin-bottom: 4px; }
</style></head><body>
<div class="header">
  <h1>${d.name}</h1>
  <div class="title">${d.objective?.split('.')[0] || 'Student'}</div>
  <div class="contact-bar">
    ${d.phone ? `<span>📞 ${d.phone}</span>` : ''}
    ${d.email ? `<span>✉ ${d.email}</span>` : ''}
    ${d.location ? `<span>📍 ${d.location}</span>` : ''}
    ${d.linkedin ? `<span>🔗 ${d.linkedin}</span>` : ''}
  </div>
</div>
<div class="body">
  <div class="sidebar">
    ${d.skills?.technical?.length ? `<div class="section">
      <div class="section-title">Technical Skills</div>
      ${d.skills.technical.map(s => `<span class="skill-tag">${s}</span>`).join('')}
    </div>` : ''}
    ${d.skills?.soft?.length ? `<div class="section">
      <div class="section-title">Soft Skills</div>
      ${d.skills.soft.map(s => `<span class="skill-tag soft">${s}</span>`).join('')}
    </div>` : ''}
    ${d.education?.length ? `<div class="section">
      <div class="section-title">Education</div>
      ${d.education.map(e => `<div class="edu-item">
        <div class="degree">${e.degree}</div>
        <div class="inst">${e.institution}</div>
        <div class="year">${e.year}${e.score ? ' | ' + e.score : ''}</div>
      </div>`).join('')}
    </div>` : ''}
    ${d.languages?.length ? `<div class="section">
      <div class="section-title">Languages</div>
      ${d.languages.map(l => `<div class="lang-item">• ${l}</div>`).join('')}
    </div>` : ''}
  </div>
  <div class="main">
    ${d.objective ? `<div class="section">
      <div class="section-title">Objective</div>
      <div class="objective">${d.objective}</div>
    </div>` : ''}
    ${d.experience?.length ? `<div class="section">
      <div class="section-title">Experience</div>
      ${d.experience.map(e => `<div class="exp-item">
        <div class="role">${e.role} <span style="font-weight:400;color:#718096">— ${e.duration}</span></div>
        <div class="company">${e.company}</div>
        <ul>${e.points?.map(p => `<li>${p}</li>`).join('') || ''}</ul>
      </div>`).join('')}
    </div>` : ''}
    ${d.projects?.length ? `<div class="section">
      <div class="section-title">Projects</div>
      ${d.projects.map(p => `<div class="proj-item">
        <div class="pname">${p.name} ${p.tech ? `<span class="ptech">| ${p.tech}</span>` : ''}</div>
        <div class="pdesc">${p.description}</div>
      </div>`).join('')}
    </div>` : ''}
    ${d.achievements?.length ? `<div class="section">
      <div class="section-title">Achievements</div>
      ${d.achievements.map(a => `<div class="achieve-item">${a}</div>`).join('')}
    </div>` : ''}
  </div>
</div>
</body></html>`,

  classic: (d) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 13px; color: #1a1a1a; background: white; padding: 40px; }
  .header { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 20px; }
  .header h1 { font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
  .contact-bar { display: flex; justify-content: center; gap: 24px; margin-top: 8px; font-size: 12px; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1a1a1a; padding-bottom: 3px; margin-bottom: 10px; }
  .edu-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .edu-row .left .degree { font-weight: 700; }
  .edu-row .left .inst { font-style: italic; }
  .edu-row .right { text-align: right; font-size: 12px; }
  .exp-item { margin-bottom: 12px; }
  .exp-row { display: flex; justify-content: space-between; }
  .exp-row .role { font-weight: 700; }
  .exp-row .company { font-style: italic; }
  .exp-item ul { margin-left: 20px; margin-top: 4px; }
  .exp-item ul li { margin-bottom: 2px; }
  .proj-item { margin-bottom: 10px; }
  .proj-item .pname { font-weight: 700; display: inline; }
  .proj-item .pdesc { display: inline; }
  .skills-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill-item { border: 1px solid #1a1a1a; padding: 2px 10px; font-size: 11px; }
  .objective { font-style: italic; line-height: 1.6; }
  .achieve-list { margin-left: 20px; }
  .achieve-list li { margin-bottom: 4px; }
</style></head><body>
<div class="header">
  <h1>${d.name}</h1>
  <div class="contact-bar">
    ${d.phone ? `<span>${d.phone}</span>` : ''}
    ${d.email ? `<span>${d.email}</span>` : ''}
    ${d.location ? `<span>${d.location}</span>` : ''}
    ${d.linkedin ? `<span>${d.linkedin}</span>` : ''}
  </div>
</div>
${d.objective ? `<div class="section">
  <div class="section-title">Objective</div>
  <div class="objective">${d.objective}</div>
</div>` : ''}
${d.education?.length ? `<div class="section">
  <div class="section-title">Education</div>
  ${d.education.map(e => `<div class="edu-row">
    <div class="left"><div class="degree">${e.degree}</div><div class="inst">${e.institution}</div></div>
    <div class="right">${e.year}${e.score ? '<br>' + e.score : ''}</div>
  </div>`).join('')}
</div>` : ''}
${d.experience?.length ? `<div class="section">
  <div class="section-title">Experience</div>
  ${d.experience.map(e => `<div class="exp-item">
    <div class="exp-row"><span class="role">${e.role}</span><span>${e.duration}</span></div>
    <div class="company">${e.company}</div>
    <ul>${e.points?.map(p => `<li>${p}</li>`).join('') || ''}</ul>
  </div>`).join('')}
</div>` : ''}
${d.projects?.length ? `<div class="section">
  <div class="section-title">Projects</div>
  ${d.projects.map(p => `<div class="proj-item">
    <span class="pname">${p.name}${p.tech ? ' (' + p.tech + ')' : ''}: </span>
    <span class="pdesc">${p.description}</span>
  </div>`).join('')}
</div>` : ''}
${(d.skills?.technical?.length || d.skills?.soft?.length) ? `<div class="section">
  <div class="section-title">Skills</div>
  <div class="skills-list">
    ${[...(d.skills?.technical || []), ...(d.skills?.soft || [])].map(s => `<span class="skill-item">${s}</span>`).join('')}
  </div>
</div>` : ''}
${d.achievements?.length ? `<div class="section">
  <div class="section-title">Achievements</div>
  <ul class="achieve-list">${d.achievements.map(a => `<li>${a}</li>`).join('')}</ul>
</div>` : ''}
</body></html>`,

  creative: (d) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Arial', sans-serif; font-size: 12.5px; color: #333; background: white; }
  .wrapper { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
  .left { background: #1a1a2e; color: white; padding: 30px 24px; }
  .right { padding: 30px 32px; background: white; }
  .avatar { width: 80px; height: 80px; background: linear-gradient(135deg, #e94560, #0f3460); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: white; }
  .left h1 { font-size: 20px; font-weight: 700; text-align: center; color: white; }
  .left .role { font-size: 11px; color: #e94560; text-align: center; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
  .divider { height: 2px; background: #e94560; margin: 16px 0; }
  .left-section { margin-bottom: 20px; }
  .left-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #e94560; margin-bottom: 10px; }
  .contact-item { font-size: 11px; color: #ccc; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
  .skill-bar-item { margin-bottom: 8px; }
  .skill-bar-item .name { font-size: 11px; color: #ccc; margin-bottom: 3px; }
  .skill-bar { height: 4px; background: #333; border-radius: 2px; }
  .skill-bar-fill { height: 4px; background: #e94560; border-radius: 2px; }
  .soft-skill { font-size: 11px; color: #ccc; margin-bottom: 4px; padding-left: 12px; position: relative; }
  .soft-skill::before { content: '▸'; color: #e94560; position: absolute; left: 0; }
  .lang-item { font-size: 11px; color: #ccc; margin-bottom: 4px; }
  .right-section { margin-bottom: 22px; }
  .right-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #e94560; border-left: 3px solid #e94560; padding-left: 10px; margin-bottom: 12px; }
  .objective { color: #555; line-height: 1.6; font-size: 12.5px; }
  .edu-item { display: flex; justify-content: space-between; margin-bottom: 10px; align-items: flex-start; }
  .edu-item .degree { font-weight: 700; font-size: 13px; }
  .edu-item .inst { color: #777; font-size: 11px; }
  .edu-item .year { background: #e94560; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; white-space: nowrap; }
  .exp-item { margin-bottom: 14px; border-left: 2px solid #eee; padding-left: 12px; }
  .exp-item .role { font-weight: 700; font-size: 13px; }
  .exp-item .company { color: #e94560; font-size: 11px; }
  .exp-item .duration { color: #999; font-size: 11px; }
  .exp-item ul { margin-left: 14px; margin-top: 4px; }
  .exp-item ul li { color: #555; font-size: 12px; margin-bottom: 2px; }
  .proj-card { background: #f8f9fa; border-left: 3px solid #e94560; padding: 10px 12px; margin-bottom: 10px; border-radius: 0 6px 6px 0; }
  .proj-card .pname { font-weight: 700; font-size: 13px; }
  .proj-card .ptech { color: #e94560; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .proj-card .pdesc { color: #555; font-size: 11.5px; margin-top: 4px; line-height: 1.5; }
  .achieve-item { display: flex; gap: 8px; margin-bottom: 6px; }
  .achieve-item .star { color: #e94560; font-size: 14px; }
  .achieve-item .text { color: #555; font-size: 12px; }
</style></head><body>
<div class="wrapper">
  <div class="left">
    <div class="avatar">${d.name?.charAt(0) || 'S'}</div>
    <h1>${d.name}</h1>
    <div class="role">${d.objective?.split(' ').slice(0,4).join(' ') || 'Student'}</div>
    <div class="divider"></div>
    <div class="left-section">
      <div class="left-title">Contact</div>
      ${d.phone ? `<div class="contact-item">📞 ${d.phone}</div>` : ''}
      ${d.email ? `<div class="contact-item">✉ ${d.email}</div>` : ''}
      ${d.location ? `<div class="contact-item">📍 ${d.location}</div>` : ''}
      ${d.linkedin ? `<div class="contact-item">🔗 ${d.linkedin}</div>` : ''}
    </div>
    ${d.skills?.technical?.length ? `<div class="left-section">
      <div class="left-title">Technical Skills</div>
      ${d.skills.technical.map((s, i) => `<div class="skill-bar-item">
        <div class="name">${s}</div>
        <div class="skill-bar"><div class="skill-bar-fill" style="width:${90 - i*8}%"></div></div>
      </div>`).join('')}
    </div>` : ''}
    ${d.skills?.soft?.length ? `<div class="left-section">
      <div class="left-title">Soft Skills</div>
      ${d.skills.soft.map(s => `<div class="soft-skill">${s}</div>`).join('')}
    </div>` : ''}
    ${d.languages?.length ? `<div class="left-section">
      <div class="left-title">Languages</div>
      ${d.languages.map(l => `<div class="lang-item">• ${l}</div>`).join('')}
    </div>` : ''}
  </div>
  <div class="right">
    ${d.objective ? `<div class="right-section">
      <div class="right-title">About Me</div>
      <div class="objective">${d.objective}</div>
    </div>` : ''}
    ${d.education?.length ? `<div class="right-section">
      <div class="right-title">Education</div>
      ${d.education.map(e => `<div class="edu-item">
        <div><div class="degree">${e.degree}</div><div class="inst">${e.institution}${e.score ? ' | ' + e.score : ''}</div></div>
        <div class="year">${e.year}</div>
      </div>`).join('')}
    </div>` : ''}
    ${d.experience?.length ? `<div class="right-section">
      <div class="right-title">Experience</div>
      ${d.experience.map(e => `<div class="exp-item">
        <div class="role">${e.role}</div>
        <div class="company">${e.company} <span class="duration">| ${e.duration}</span></div>
        <ul>${e.points?.map(p => `<li>${p}</li>`).join('') || ''}</ul>
      </div>`).join('')}
    </div>` : ''}
    ${d.projects?.length ? `<div class="right-section">
      <div class="right-title">Projects</div>
      ${d.projects.map(p => `<div class="proj-card">
        <div class="pname">${p.name} ${p.tech ? `<span class="ptech">${p.tech}</span>` : ''}</div>
        <div class="pdesc">${p.description}</div>
      </div>`).join('')}
    </div>` : ''}
    ${d.achievements?.length ? `<div class="right-section">
      <div class="right-title">Achievements</div>
      ${d.achievements.map(a => `<div class="achieve-item"><span class="star">★</span><span class="text">${a}</span></div>`).join('')}
    </div>` : ''}
  </div>
</div>
</body></html>`,

  minimal: (d) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, sans-serif; font-size: 12.5px; color: #222; background: white; padding: 48px 52px; }
  h1 { font-size: 30px; font-weight: 300; letter-spacing: 3px; text-transform: uppercase; color: #111; }
  .tagline { font-size: 12px; color: #999; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
  .contact-bar { display: flex; gap: 20px; margin-top: 10px; font-size: 11.5px; color: #666; flex-wrap: wrap; }
  hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #999; margin-bottom: 12px; font-weight: 600; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .edu-item { margin-bottom: 12px; }
  .edu-item .degree { font-weight: 600; font-size: 13px; }
  .edu-item .meta { color: #888; font-size: 11.5px; margin-top: 2px; }
  .exp-item { margin-bottom: 14px; }
  .exp-item .header { display: flex; justify-content: space-between; }
  .exp-item .role { font-weight: 600; font-size: 13px; }
  .exp-item .duration { color: #999; font-size: 11.5px; }
  .exp-item .company { color: #555; font-size: 12px; margin-top: 2px; }
  .exp-item ul { margin: 6px 0 0 16px; }
  .exp-item ul li { color: #555; margin-bottom: 2px; line-height: 1.5; }
  .proj-item { margin-bottom: 12px; }
  .proj-item .pname { font-weight: 600; font-size: 13px; }
  .proj-item .ptech { color: #999; font-size: 11px; margin-left: 6px; }
  .proj-item .pdesc { color: #555; font-size: 12px; margin-top: 3px; line-height: 1.5; }
  .skill-pill { display: inline-block; border: 1px solid #ddd; padding: 3px 12px; border-radius: 2px; font-size: 11px; margin: 3px 3px; color: #444; }
  .objective { color: #555; line-height: 1.7; font-size: 12.5px; }
  .achieve-item { color: #555; font-size: 12px; margin-bottom: 5px; padding-left: 14px; position: relative; }
  .achieve-item::before { content: '—'; position: absolute; left: 0; color: #bbb; }
</style></head><body>
<h1>${d.name}</h1>
<div class="tagline">${d.location || ''}</div>
<div class="contact-bar">
  ${d.phone ? `<span>${d.phone}</span>` : ''}
  ${d.email ? `<span>${d.email}</span>` : ''}
  ${d.linkedin ? `<span>${d.linkedin}</span>` : ''}
</div>
<hr>
${d.objective ? `<div class="section">
  <div class="section-title">Profile</div>
  <div class="objective">${d.objective}</div>
</div>` : ''}
<div class="two-col">
  ${d.education?.length ? `<div class="section">
    <div class="section-title">Education</div>
    ${d.education.map(e => `<div class="edu-item">
      <div class="degree">${e.degree}</div>
      <div class="meta">${e.institution} · ${e.year}${e.score ? ' · ' + e.score : ''}</div>
    </div>`).join('')}
  </div>` : ''}
  ${(d.skills?.technical?.length || d.skills?.soft?.length) ? `<div class="section">
    <div class="section-title">Skills</div>
    ${[...(d.skills?.technical || []), ...(d.skills?.soft || [])].map(s => `<span class="skill-pill">${s}</span>`).join('')}
  </div>` : ''}
</div>
${d.experience?.length ? `<div class="section">
  <div class="section-title">Experience</div>
  ${d.experience.map(e => `<div class="exp-item">
    <div class="header"><span class="role">${e.role}</span><span class="duration">${e.duration}</span></div>
    <div class="company">${e.company}</div>
    <ul>${e.points?.map(p => `<li>${p}</li>`).join('') || ''}</ul>
  </div>`).join('')}
</div>` : ''}
${d.projects?.length ? `<div class="section">
  <div class="section-title">Projects</div>
  ${d.projects.map(p => `<div class="proj-item">
    <span class="pname">${p.name}</span>${p.tech ? `<span class="ptech">${p.tech}</span>` : ''}
    <div class="pdesc">${p.description}</div>
  </div>`).join('')}
</div>` : ''}
${d.achievements?.length ? `<div class="section">
  <div class="section-title">Achievements</div>
  ${d.achievements.map(a => `<div class="achieve-item">${a}</div>`).join('')}
</div>` : ''}
</body></html>`,

  ats: (d) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: white; padding: 36px 40px; }
  h1 { font-size: 22px; font-weight: 700; color: #000; }
  .contact-bar { font-size: 11.5px; margin-top: 6px; color: #000; }
  .contact-bar span { margin-right: 16px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; background: #000; color: white; padding: 3px 8px; margin-bottom: 8px; letter-spacing: 0.5px; }
  .edu-item { margin-bottom: 8px; display: flex; justify-content: space-between; }
  .edu-item .degree { font-weight: 700; }
  .edu-item .inst { font-size: 11.5px; }
  .exp-item { margin-bottom: 10px; }
  .exp-row { display: flex; justify-content: space-between; }
  .exp-row .role { font-weight: 700; }
  .exp-item .company { font-size: 11.5px; }
  .exp-item ul { margin-left: 16px; margin-top: 4px; }
  .exp-item ul li { margin-bottom: 2px; font-size: 11.5px; }
  .proj-item { margin-bottom: 8px; }
  .proj-item .pname { font-weight: 700; display: inline; }
  .proj-item .pdesc { display: inline; font-size: 11.5px; }
  .skills-text { font-size: 11.5px; line-height: 1.6; }
  .objective { font-size: 11.5px; line-height: 1.6; }
  .achieve-list { margin-left: 16px; }
  .achieve-list li { font-size: 11.5px; margin-bottom: 3px; }
</style></head><body>
<h1>${d.name}</h1>
<div class="contact-bar">
  ${d.phone ? `<span>${d.phone}</span>` : ''}
  ${d.email ? `<span>${d.email}</span>` : ''}
  ${d.location ? `<span>${d.location}</span>` : ''}
  ${d.linkedin ? `<span>${d.linkedin}</span>` : ''}
</div>
${d.objective ? `<div class="section">
  <div class="section-title">Professional Summary</div>
  <div class="objective">${d.objective}</div>
</div>` : ''}
${d.education?.length ? `<div class="section">
  <div class="section-title">Education</div>
  ${d.education.map(e => `<div class="edu-item">
    <div><div class="degree">${e.degree}</div><div class="inst">${e.institution}${e.score ? ' | ' + e.score : ''}</div></div>
    <div>${e.year}</div>
  </div>`).join('')}
</div>` : ''}
${d.experience?.length ? `<div class="section">
  <div class="section-title">Work Experience</div>
  ${d.experience.map(e => `<div class="exp-item">
    <div class="exp-row"><span class="role">${e.role}</span><span>${e.duration}</span></div>
    <div class="company">${e.company}</div>
    <ul>${e.points?.map(p => `<li>${p}</li>`).join('') || ''}</ul>
  </div>`).join('')}
</div>` : ''}
${d.projects?.length ? `<div class="section">
  <div class="section-title">Projects</div>
  ${d.projects.map(p => `<div class="proj-item">
    <span class="pname">${p.name}${p.tech ? ' (' + p.tech + ')' : ''}: </span>
    <span class="pdesc">${p.description}</span>
  </div>`).join('')}
</div>` : ''}
${(d.skills?.technical?.length || d.skills?.soft?.length) ? `<div class="section">
  <div class="section-title">Skills</div>
  <div class="skills-text">${[...(d.skills?.technical || []), ...(d.skills?.soft || [])].join(' • ')}</div>
</div>` : ''}
${d.achievements?.length ? `<div class="section">
  <div class="section-title">Achievements & Activities</div>
  <ul class="achieve-list">${d.achievements.map(a => `<li>${a}</li>`).join('')}</ul>
</div>` : ''}
</body></html>`
};

// ─── Generate PDF ─────────────────────────────────────────────────────────────
async function generatePDF(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    return pdf;
  } finally {
    await browser.close();
  }
}

// ─── API: Generate Resume ─────────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  try {
    const { data, template = 'modern' } = req.body;
    if (!data || !data.name) return res.status(400).json({ error: 'Name required' });

    const enhanced = await enhanceResume(data);
    const templateFn = templates[template] || templates.modern;
    const html = templateFn(enhanced);
    const pdf = await generatePDF(html);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${data.name.replace(/\s+/g,'-')}-resume.pdf"`,
      'Content-Length': pdf.length
    });
    res.send(pdf);
  } catch(e) {
    console.error('Resume generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Preview HTML ────────────────────────────────────────────────────────
router.post('/preview', async (req, res) => {
  try {
    const { data, template = 'modern' } = req.body;
    if (!data || !data.name) return res.status(400).json({ error: 'Name required' });

    const enhanced = await enhanceResume(data);
    const templateFn = templates[template] || templates.modern;
    const html = templateFn(enhanced);
    res.json({ html, enhanced });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Templates list ──────────────────────────────────────────────────────
router.get('/templates', (req, res) => {
  res.json({
    templates: [
      { id: 'modern',   name: 'Modern',   desc: 'Purple gradient, two-column, colorful skill tags', color: '#667eea' },
      { id: 'classic',  name: 'Classic',  desc: 'Traditional black & white, serif font, formal', color: '#1a1a1a' },
      { id: 'creative', name: 'Creative', desc: 'Dark sidebar, red accents, skill bars, standout', color: '#e94560' },
      { id: 'minimal',  name: 'Minimal',  desc: 'Clean helvetica, lots of whitespace, elegant', color: '#888' },
      { id: 'ats',      name: 'ATS Safe', desc: 'Plain format, ATS optimized, no graphics', color: '#333' }
    ]
  });
});

module.exports = router;
