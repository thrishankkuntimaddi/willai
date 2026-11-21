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
