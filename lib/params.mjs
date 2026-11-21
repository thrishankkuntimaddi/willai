// Input cleaning and job-filter parsing shared by the HTTP layer and tests.
import { FAMILIES, SENIORITY } from './normalize.mjs';

export const cleanField = (v, n) => String(v ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

const KNOWN = {
  family: new Set(FAMILIES.map(f => f.id).concat('other')), seniority: new Set([...SENIORITY, 'unknown']),
  mode: new Set(['remote', 'hybrid', 'onsite', 'unknown']), type: new Set(['full_time', 'part_time', 'contract', 'internship']),
};
const list = (sp, k, max = 12) => (sp.get(k) || '').split(',').map(s => cleanField(s, 80)).filter(Boolean).filter(v => !KNOWN[k] || KNOWN[k].has(v)).slice(0, max);
export function filtersFrom(sp) {
  const mode = list(sp, 'mode');
  if (sp.get('remote') === '1' && !mode.length) mode.push('remote');              // v1 links
  return {
    q: cleanField(sp.get('q'), 80), family: list(sp, 'family'), seniority: list(sp, 'seniority'), mode, type: list(sp, 'type'), category: list(sp, 'category'),
    city: cleanField(sp.get('city'), 60), radius: Math.max(0, Math.min(500, +sp.get('radius') || 50)), countries: list(sp, 'country', 5),
    days: [1, 3, 7, 14, 30].includes(+sp.get('days')) ? +sp.get('days') : sp.get('recent') === '1' ? 7 : 0,
    salary: sp.get('salary') === '1', includeOld: sp.get('old') === '1', showFlagged: sp.get('flagged') === '1', ai: sp.get('ai') === '1', tech: sp.get('tech') === '1',
  };
}

/* ---------------- the career profile sent to /api/advise ---------------- */
const STATUSES = ['working', 'fresher', 'student', 'gap', 'freelancer', 'between'];
const MODES = ['remote', 'hybrid', 'onsite'];
const numIn = (v, lo, hi, d = null) => { const n = Math.round(Number(v)); return Number.isFinite(n) && String(v).trim() !== '' ? Math.max(lo, Math.min(hi, n)) : d; };
const arrOf = (v, n, map) => (Array.isArray(v) ? v : []).slice(0, n).map(map).filter(Boolean);
export function cleanProfile(b = {}) {
  const c = cleanField;
  const legacySkills = typeof b.skills === 'string';                         // v1 form: free text "what you do"
  const p = {
    status: STATUSES.includes(b.status) ? b.status : 'working',
    role: c(b.role, 80), company: c(b.company, 80), years: numIn(b.years, 0, 50),
    dailyWork: c(legacySkills ? b.skills : b.dailyWork, 800),
    gapMonths: numIn(b.gapMonths, 0, 240), gapReason: c(b.gapReason, 200), gradYear: numIn(b.gradYear, 1970, 2035),
    skills: legacySkills ? [] : arrOf(b.skills, 40, s => {
      const name = c(typeof s === 'string' ? s : s?.name, 60);
      return name && { name, level: [1, 2, 3].includes(+s?.level) ? +s.level : 2 };
    }),
    technologies: arrOf(b.technologies, 30, s => c(s, 60)),
    projects: arrOf(b.projects, 8, x => x && c(x.name, 100) && { name: c(x.name, 100), stack: c(x.stack, 160), summary: c(x.summary, 400) }),
    education: arrOf(b.education, 4, e => e && (c(e.degree, 80) || c(e.field, 80)) && { degree: c(e.degree, 80), field: c(e.field, 80), year: numIn(e.year, 1950, 2035) }),
    target: c(b.target, 80),
    workModes: arrOf(b.workModes, 3, m => (MODES.includes(m) ? m : null)),
    locations: arrOf(b.locations, 5, s => c(s, 60)),
    country: c(b.country, 60), relocate: !!b.relocate,
    planDays: numIn(b.planDays, 7, 365, 90), weeklyHours: numIn(b.weeklyHours, 1, 80, 8),
    budget: b.budget === 'some' ? 'some' : 'free', constraints: c(b.constraints, 300),
  };
  if (legacySkills && typeof b.education === 'string' && b.education.trim()) p.education = [{ degree: c(b.education, 80), field: '', year: null }];
  // v1 sent "India (Hyderabad)" as one field
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(p.country);
  if (m && !p.locations.length) { p.country = m[1]; p.locations = [m[2]]; }
  return p;
}
