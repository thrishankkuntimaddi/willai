// Scam and low-quality posting detection. Rule based and explainable: every point taken off comes with a reason a person can read.
// Score 0-100. >=70 good, 60-69 normal, 40-59 check carefully, <40 hidden by default.

const BASE = { ats: 92, aggregator: 78, willai: 62 };
// Applicant-tracking systems companies post through. Matched on the hostname or one of its subdomains, never as a substring,
// so "careers.anything.xyz" or "greenhouse.io.evil.com" do not count.
const ATS_DOMAINS = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'smartrecruiters.com', 'recruitee.com', 'myworkdayjobs.com', 'icims.com',
  'jobvite.com', 'bamboohr.com', 'personio.de', 'personio.com', 'teamtailor.com', 'breezy.hr', 'taleo.net', 'successfactors.com'];
const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|cutt\.ly|rb\.gy|shorturl\.at|is\.gd|ow\.ly|tiny\.cc|rebrand\.ly)\//i;
const FREE_MAIL = /[a-z0-9._%+-]+@(gmail|googlemail|yahoo|hotmail|outlook|live|msn|rediffmail|ymail|aol|proton|protonmail|icloud|gmx|mail|zoho|zohomail|yandex|tutanota|fastmail)\.(com|co\.in|in|me|de|ru|net)\b/i;

/* ---------------- domains ---------------- */
export const hostOf = url => { try { return new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; } };
export const onDomain = (host, domain) => !!host && !!domain && (host === domain || host.endsWith('.' + domain));
export const isAtsHost = host => ATS_DOMAINS.some(d => onDomain(host, d));
// The name a site goes by: the label before the public suffix ("stripe" in jobs.stripe.com, "acme" in acme.co.in).
export function siteName(host) {
  const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return '';
  const cc = parts.length >= 3 && parts.at(-1).length === 2 && /^(co|com|net|org|gov|edu|ac|ltd|plc)$/.test(parts.at(-2));
  return parts[parts.length - (cc ? 3 : 2)];
}
// Free and throwaway inboxes: anyone can open one, so they never prove who an employer is.
const FREE_NAMES = new Set(['gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook', 'live', 'msn', 'rediffmail', 'aol', 'proton', 'protonmail', 'pm', 'icloud', 'me', 'mac',
  'gmx', 'mail', 'zoho', 'zohomail', 'yandex', 'tutanota', 'tuta', 'fastmail', 'hey', 'qq', '163', '126', 'mailinator', 'guerrillamail', 'sharklasers', 'tempmail',
  'temp-mail', '10minutemail', 'yopmail', 'trashmail', 'getnada', 'dispostable', 'maildrop', 'mailnesia', 'throwawaymail', 'emailondeck', 'mohmal']);
export const isFreeMailDomain = domain => FREE_NAMES.has(siteName(domain));
const LEGAL_WORDS = /\b(inc|ltd|llc|llp|pvt|private|limited|technologies|technology|labs|solutions|corp|corporation|co|company|group|gmbh|ag|plc|sa|bv)\b\.?/g;
// Does a domain stand for this company? Its site name must BE the company's name ("stripe.com" for "Stripe, Inc.", "acme-corp.io" for
// "Acme Corp"), or its first word when that word is distinctive. Containing the name is not enough: "google-hiring.xyz" is not Google.
export function domainMatchesCompany(host, company) {
  const name = siteName(host).replace(/-/g, '');
  const raw = String(company || '').toLowerCase();
  const words = raw.replace(LEGAL_WORDS, ' ').match(/[a-z0-9]+/g) || [];
  if (!name || !words.length) return false;
  return name === words.join('') || name === (raw.match(/[a-z0-9]+/g) || []).join('') || (words[0].length >= 4 && name === words[0]);
}
const mailDomain = url => (/^mailto:/i.test(url || '') ? (String(url).slice(7).split('?')[0].split('@')[1] || '').toLowerCase().trim() : '');

export const RULES = [
  { id: 'fee', points: 45, reason: 'Asks you to pay a fee or deposit. Real employers never charge applicants',
    test: t => /(registration|training|processing|security|joining|kit|onboarding|application|interview|placement|verification|document)\s*(fees?|charges?|deposit|amount)|pay (a |the |an )?(small |one[- ]time |refundable )?(fee|deposit|amount)|refundable deposit|send (the )?money|purchase (a |your )?(starter )?kit/i.test(t) },
  { id: 'chat', points: 25, reason: 'Asks you to apply or talk only over WhatsApp or Telegram',
    test: t => /(whats\s?app|telegram|t\.me\/|wa\.me\/)/i.test(t) && /(contact|message|text|reach|apply|send|dm|ping)/i.test(t) },
  { id: 'too_good', points: 30, reason: 'Promises easy or guaranteed money, a common scam pattern',
    test: t => /earn\s*(up to\s*)?(rs\.?|₹|\$|inr|usd)?\s?[\d,]+k?\s*(per|\/|a|every)\s*(day|week|hour)|work from home and earn|easy money|guaranteed (income|earnings|job|placement|selection)|no interview|instant (joining|offer|payment)|daily (payout|payment)|like and (earn|get paid)|(typing|data entry|captcha|copy paste) (job|work).{0,60}(earn|payment|payout)/i.test(t) },
  { id: 'free_mail', points: 18, reason: 'Applications go to a personal email address, not a company one',
    test: (t, p) => FREE_MAIL.test(t) || (!!mailDomain(p.url) && isFreeMailDomain(mailDomain(p.url))) },
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
  // 25 points: an unverified WillAI posting whose apply link points somewhere else drops below the hide line (62 - 25 < 40)
  { id: 'link_mismatch', points: 25, reason: 'Apply link goes to a different website than the company\'s',
    test: (t, p) => p.source_kind === 'willai' && /^(https:\/\/|mailto:)/i.test(p.url || '') && !linkMatchesCompany(p.url, p.company) },
];

// The apply link is on the company's own site, or on an applicant-tracking system.
export function linkMatchesCompany(url, company) {
  const host = mailDomain(url) || hostOf(url);
  if (!host) return false;
  if (!/^mailto:/i.test(url) && isAtsHost(host)) return true;
  return domainMatchesCompany(host, company);
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
export const HIDE_REPORTS = 3;
// What the public sees: trusted enough, and not reported by several confirmed accounts. Company career boards come straight
// from the employer's own system, so reports lower their score but never hide them (that would let anyone bury a real job).
export const VISIBLE_SQL = `trust_score >= ${HIDE_BELOW} and (reports < ${HIDE_REPORTS} or source_kind = 'ats') and removed_at is null`;
