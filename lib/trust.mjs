// Scam and low-quality posting detection. Rule based and explainable: every point taken off comes with a reason a person can read.
// Score 0-100. >=70 good, 60-69 normal, 40-59 check carefully, <40 hidden by default.

const BASE = { ats: 92, aggregator: 78, willai: 62 };
const ATS_HOSTS = /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|recruitee\.com|myworkdayjobs\.com|icims\.com|jobvite\.com|bamboohr\.com|personio\.(de|com)|teamtailor\.com|breezy\.hr|taleo\.net|successfactors\.com|careers\.|jobs\.)/i;
const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|cutt\.ly|rb\.gy|shorturl\.at|is\.gd|ow\.ly|tiny\.cc|rebrand\.ly)\//i;
const FREE_MAIL = /[a-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|live|rediffmail|ymail|aol|proton|protonmail|icloud|gmx|mail)\.(com|co\.in|in|me)\b/i;

export const RULES = [
  { id: 'fee', points: 45, reason: 'Asks you to pay a fee or deposit. Real employers never charge applicants',
    test: t => /(registration|training|processing|security|joining|kit|onboarding|application|interview|placement|verification|document)\s*(fees?|charges?|deposit|amount)|pay (a |the |an )?(small |one[- ]time |refundable )?(fee|deposit|amount)|refundable deposit|send (the )?money|purchase (a |your )?(starter )?kit/i.test(t) },
  { id: 'chat', points: 25, reason: 'Asks you to apply or talk only over WhatsApp or Telegram',
    test: t => /(whats\s?app|telegram|t\.me\/|wa\.me\/)/i.test(t) && /(contact|message|text|reach|apply|send|dm|ping)/i.test(t) },
  { id: 'too_good', points: 30, reason: 'Promises easy or guaranteed money, a common scam pattern',
    test: t => /earn\s*(up to\s*)?(rs\.?|₹|\$|inr|usd)?\s?[\d,]+k?\s*(per|\/|a|every)\s*(day|week|hour)|work from home and earn|easy money|guaranteed (income|earnings|job|placement|selection)|no interview|instant (joining|offer|payment)|daily (payout|payment)|like and (earn|get paid)|(typing|data entry|captcha|copy paste) (job|work).{0,60}(earn|payment|payout)/i.test(t) },
  { id: 'free_mail', points: 18, reason: 'Applications go to a personal email address, not a company one',
    test: t => FREE_MAIL.test(t) },
  { id: 'short_link', points: 18, reason: 'Uses a link shortener that hides where you are sent',
    test: (t, p) => SHORTENERS.test(t) || SHORTENERS.test(p.url || '') },
  { id: 'personal_data', points: 25, reason: 'Asks for bank, ID or card details before hiring',
    test: t => /(bank account|aadhaar|aadhar|pan card|passport|otp|credit card|debit card)\s*(details|number|copy|scan)?.{0,40}(before|to (apply|register|confirm)|immediately|send)/i.test(t) },
  { id: 'vague', points: 10, reason: 'Very little detail about the work itself',
    test: (t, p) => p.hasText && t.replace(/\s+/g, ' ').trim().length < 220 },
  { id: 'shouting', points: 8, reason: 'Written in a high-pressure style (urgent, limited seats, all caps)',
    test: t => /(urgent(ly)? (hiring|requirement)|limited (seats|slots|vacancies)|hurry|apply (now|today) before|immediate joiners? only.*!!)/i.test(t) && (t.match(/!/g) || []).length >= 3 },
  { id: 'pay_outlier', points: 15, reason: 'Pay is far above what similar roles offer',
    test: (t, p) => p.salary_max && ((p.salary_currency === 'INR' && p.salary_max > (['intern', 'entry', 'junior'].includes(p.seniority) ? 4e6 : 2.5e7))
      || (p.salary_currency === 'USD' && p.salary_max > (['intern', 'entry', 'junior'].includes(p.seniority) ? 3e5 : 9e5))) },
  { id: 'link_mismatch', points: 10, reason: 'Apply link goes to a different website than the company\'s',
    test: (t, p) => p.source_kind === 'willai' && /^https:\/\//i.test(p.url || '') && !linkMatchesCompany(p.url, p.company) },
];

export function linkMatchesCompany(url, company) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  if (ATS_HOSTS.test(host)) return true;
  const words = String(company).toLowerCase().replace(/\b(inc|ltd|llc|pvt|private|limited|technologies|technology|labs|solutions|corp|co)\b\.?/g, '').match(/[a-z0-9]{3,}/g) || [];
  return words.some(w => host.includes(w));
}

// p: normalised posting row (see normalize.mjs). extra: { reports, duplicateCompanies, verifiedEmployer }
export function assess(p, extra = {}) {
  const t = `${p.title}\n${p.text || ''}`;
  let score = BASE[p.source_kind] ?? 75;
  if (p.source_kind === 'willai' && extra.verifiedEmployer) score += 13;
  const flags = [];
  for (const r of RULES) {
    try { if (r.test(t, { ...p, hasText: !!(p.text && p.text.length) })) { score -= r.points; flags.push(r.id); } } catch {}
  }
  if (extra.duplicateCompanies > 1 && p.source_kind !== 'ats') { score -= 20; flags.push('duplicate'); }
  if (extra.reports > 0) { score -= Math.min(45, extra.reports * 15); flags.push('reported'); }
  return { trust_score: Math.max(0, Math.min(100, score)), trust_flags: flags };
}

export const FLAG_REASON = Object.fromEntries([...RULES.map(r => [r.id, r.reason]),
  ['duplicate', 'The same text is posted under different company names'], ['reported', 'People reported this posting']]);

export function badge(score, kind) {
  if (score >= 70 && kind === 'ats') return { level: 'good', label: 'From the company\'s careers page' };
  if (score >= 60) return { level: 'ok', label: 'Looks normal' };
  if (score >= 40) return { level: 'warn', label: 'Check carefully' };
  return { level: 'bad', label: 'Be careful' };
}
export const HIDE_BELOW = 40;
