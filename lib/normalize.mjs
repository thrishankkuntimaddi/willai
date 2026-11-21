// Turns a raw posting from any source into a normalised row:
// role family, seniority, work mode, employment type, cities/countries, skills, salary, AI signal.
import fs from 'node:fs';

const DATA = new URL('../public/data/', import.meta.url);
const SKILLS = JSON.parse(fs.readFileSync(new URL('skills.json', DATA), 'utf8')).skills;
const GEO = JSON.parse(fs.readFileSync(new URL('cities.json', DATA), 'utf8'));

/* ---------------- text helpers ---------------- */
export const strip = h => String(h || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();
export const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// word boundary that also treats + # . as part of a token (c++, c#, node.js)
const bounded = alts => new RegExp(`(?<![a-z0-9+#])(?:${alts.sort((a, b) => b.length - a.length).map(esc).join('|')})(?![a-z0-9+#]|\\.[a-z])`, 'gi');

/* ---------------- role families (tech first) ---------------- */
export const FAMILIES = [
  { id: 'eng_mgmt', label: 'Engineering management', tech: true, rx: /engineering manager|manager,? (software )?engineering|head of (engineering|technology|platform|data|ai)|director,? (of )?(software )?engineering|vp,? engineering|vice president,? engineering|\bcto\b|chief technology/ },
  { id: 'ml_ai', label: 'AI & machine learning', tech: true, rx: /machine learning|\bml\b|\bai\b|\ba\.i\.|\bllms?\b|deep learning|computer vision|\bnlp\b|applied scientist|research scientist|research engineer|genai|generative|mlops|prompt engineer|ai engineer|perception|reinforcement learning/ },
  { id: 'data_eng', label: 'Data engineering', tech: true, rx: /data engineer|analytics engineer|\betl\b|data platform|big data|data infrastructure|data architect|data warehouse|database (engineer|administrator|developer)|\bdba\b/ },
  { id: 'data_sci', label: 'Data science & analytics', tech: true, rx: /data scien|analytics|data analyst|business intelligence|\bbi (developer|analyst|engineer)|decision scien|quantitative (analyst|researcher)|statistician|insights analyst|reporting analyst/ },
  { id: 'security', label: 'Security', tech: true, rx: /security|infosec|cyber|soc analyst|penetration|appsec|threat|\bgrc\b|identity and access|\biam\b|vulnerability/ },
  { id: 'devops', label: 'DevOps, SRE & cloud', tech: true, rx: /devops|devsecops|\bsre\b|site reliability|platform engineer|infrastructure|cloud (engineer|architect|operations)|release engineer|build engineer|network engineer|reliability engineer|production engineer|kubernetes|systems engineer/ },
  { id: 'mobile', label: 'Mobile', tech: true, rx: /android|\bios\b|mobile|flutter|react native|swift developer|kotlin developer/ },
  { id: 'fullstack', label: 'Full-stack', tech: true, rx: /full[\s-]?stack/ },
  { id: 'frontend', label: 'Frontend', tech: true, rx: /front[\s-]?end|\bui (engineer|developer)|web developer|javascript (engineer|developer)|react (engineer|developer)|angular|vue(\.js)? developer|web engineer/ },
  { id: 'backend', label: 'Backend', tech: true, rx: /back[\s-]?end|api (engineer|developer)|server[\s-]side|(java|python|golang|go|node(\.js)?|ruby|php|\.net|c#|scala|rust|elixir) (engineer|developer)|distributed systems/ },
  { id: 'qa', label: 'QA & testing', tech: true, rx: /\bqa\b|quality assurance|test engineer|\bsdet\b|automation (test|engineer)|tester|quality engineer|test analyst|acceptance testing|testing analyst/ },
  { id: 'embedded', label: 'Embedded & hardware', tech: true, rx: /embedded|firmware|hardware|\bfpga\b|\basic\b|vlsi|silicon|electrical engineer|robotics|\biot\b|pcb|rf engineer|design verification/ },
  { id: 'solutions', label: 'Solutions & customer engineering', tech: true, rx: /solutions? (engineer|architect|consultant)|sales engineer|customer engineer|forward deployed|technical account manager|implementation engineer|technical consultant|support engineer|developer advocate|developer relations|devrel/ },
  { id: 'product', label: 'Product & program management', tech: true, rx: /product (manager|management|owner|lead|operations)|director,? product|head of product|program manager|\btpm\b|technical program|project (manager|coordinator)|scrum master|delivery manager/ },
  { id: 'design', label: 'Design & UX', tech: true, rx: /designer|\bux\b|ui\/ux|user research|design (lead|director|manager)|\bartist\b|animator|illustrator|motion graphics/ },
  { id: 'it_support', label: 'IT support & admin', tech: true, rx: /it support|help ?desk|desktop support|system administrator|sysadmin|it administrator|it technician|service desk|it specialist|it operations|it analyst|it engineer|it manager|technical support/ },
  { id: 'software', label: 'Software engineering', tech: true, rx: /member of technical staff|software|developer|programmer|\bsde\b|\bswe\b|coding/ },
  { id: 'mech', label: 'Mechanical & manufacturing engineering', tech: false, rx: /mechanical|manufacturing|propulsion|structures|structural|civil|environmental|equipment|process engineer|thermal|materials|launch|avionics|\bnvh\b|aerospace|chemical|industrial engineer|production engineer|test engineer|reliability|tooling|cmm|welding engineer|facilities/ },
  { id: 'software', label: 'Software engineering', tech: true, rx: /engineer|architect/ },
  { id: 'trades', label: 'Skilled trades & field work', tech: false, rx: /technician|\btech\b|welder|mechanic|machinist|warehouse|material handler|driver|attendant|inspector|detailer|assembler|rigger|operator|electrician|installer|courier|associate,? (fulfillment|warehouse)/ },
  // non-tech (secondary focus)
  { id: 'sales', label: 'Sales & business development', tech: false, rx: /sales|account (executive|manager|management|director|supervisor|development)|business development|\bsdr\b|\bbdr\b|partnerships?|representative|alliances/ },
  { id: 'marketing', label: 'Marketing & content', tech: false, rx: /marketing|growth|\bseo\b|content|copywriter|brand|social media|communications|\bpr\b/ },
  { id: 'customer', label: 'Customer support & success', tech: false, rx: /customer (support|success|service|experience)|support (specialist|agent|associate)|call cent(er|re)|client services/ },
  { id: 'finance', label: 'Finance & accounting', tech: false, rx: /financ|accountant|accounting|\btax\b|audit|controller|payroll|treasury|fp&a|bookkeep|collections|credit|lending|underwrit|money laundering|\baml\b|\bkyc\b|risk/ },
  { id: 'people', label: 'HR & recruiting', tech: false, rx: /recruit|talent|\bhr\b|human resources|people (partner|operations)|hrbp/ },
  { id: 'operations', label: 'Operations & strategy', tech: false, rx: /operations|strateg|business analyst|consultant|supply chain|logistics|procurement|chief of staff|transformation|coordinator|\banalyst\b|specialist|administrat|assistant|affairs|fellow/ },
  { id: 'legal', label: 'Legal & compliance', tech: false, rx: /legal|counsel|lawyer|attorney|compliance|paralegal|privacy/ },
  { id: 'healthcare', label: 'Healthcare', tech: false, rx: /nurse|clinical|physician|doctor|pharmac|medical|therapist|health/ },
  { id: 'education', label: 'Education & training', tech: false, rx: /teacher|tutor|instructor|trainer|professor|lecturer|curriculum|education/ },
];
export const FAMILY_LABEL = Object.fromEntries(FAMILIES.map(f => [f.id, f.label]));
export const TECH_FAMILIES = [...new Set(FAMILIES.filter(f => f.tech).map(f => f.id))];
export function roleFamily(title, dept = '') {
  const t = ` ${String(title).toLowerCase()} `;
  for (const f of FAMILIES) if (f.rx.test(t) && !(f.id === 'mech' && /software|developer|data|cloud|platform|firmware|ml\b|machine learning/.test(t))) return f.id;
  const d = String(dept).toLowerCase();
  if (d) for (const f of FAMILIES) if (f.rx.test(d)) return f.id;
  return 'other';
}

/* ---------------- seniority ---------------- */
export const SENIORITY = ['intern', 'entry', 'junior', 'mid', 'senior', 'lead'];
export const SENIORITY_LABEL = { intern: 'Internship', entry: 'Fresher / entry level', junior: 'Junior', mid: 'Mid level', senior: 'Senior', lead: 'Lead, staff & above', unknown: 'Not stated' };
export function yearsAsked(text) {
  const m = String(text).toLowerCase().match(/(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?)(?:'s)?\s*(?:of\s*)?(?:[a-z/-]+\s*){0,4}?(?:experience|exp\b)/);
  return m ? +m[1] : null;
}
export function seniority(title, text = '') {
  const t = String(title).toLowerCase();
  if (/\bintern(ship)?\b|\btrainee\b|apprentice|co-?op\b|summer analyst/.test(t)) return 'intern';
  if (/new grad|graduate|fresher|entry[\s-]level|early career|campus|university|\b(sde|swe)[\s-]?(1|i)\b|associate (software )?(engineer|developer)/.test(t)) return 'entry';
  const tt = t.replace(/member of (the )?technical staff/g, '');
  if (/\b(staff|principal|lead|architect|head|director|vp|vice president|distinguished|chief|senior manager|sr\.? manager|general manager)\b/.test(tt)) return 'lead';
  if (/\bmanager\b/.test(tt)) return 'senior';
  if (/\b(senior|sr\.?)\b|\biii\b|\b(sde|swe)[\s-]?(3|iii)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?)\b|\b(engineer|developer|analyst) i\b|\blevel 1\b/.test(t)) return 'junior';
  if (/\b(engineer|developer|analyst) ii\b|\b(sde|swe)[\s-]?(2|ii)\b|\bmid[\s-]level\b/.test(t)) return 'mid';
  const y = yearsAsked(text);
  if (y == null) return 'unknown';
  return y <= 1 ? 'entry' : y <= 2 ? 'junior' : y <= 4 ? 'mid' : y <= 7 ? 'senior' : 'lead';
}

/* ---------------- work mode & employment type ---------------- */
export function workMode({ title = '', location = '', text = '', remote = false, hybrid = false, kind = '' }) {
  const head = `${title} ${location}`.toLowerCase(), body = String(text).toLowerCase().slice(0, 4000);
  if (hybrid || /hybrid/.test(head)) return 'hybrid';
  if (/remote|anywhere|work from home|\bwfh\b|distributed/.test(head)) return 'remote';
  if (/\bhybrid\b|\b[1-4] days? (a|per|each|every) week\b|in[- ]office \d|\d days? in (the )?office/.test(body)) return 'hybrid';
  if (remote) return 'remote';
  if (/fully remote|100% remote|remote[- ]first|this (is a|role is) remote|remote position|work remotely from/.test(body)) return 'remote';
  if (/on-?site|in[- ]office|office[- ]based|work from office|\bwfo\b|in person/.test(body + ' ' + head)) return 'onsite';
  return kind === 'ats' && location ? 'onsite' : 'unknown';
}
export function employmentType(title, hint = '', text = '') {
  const s = `${title} ${hint}`.toLowerCase();
  if (/intern/.test(s)) return 'internship';
  if (/contract|contractor|freelance|temporary|fixed[- ]term|\btemp\b|consultant \(contract\)/.test(s)) return 'contract';
  if (/part[- ]?time/.test(s)) return 'part_time';
  if (/\bcontract (role|position)\b|this is a contract/.test(String(text).toLowerCase().slice(0, 2000))) return 'contract';
  return 'full_time';
}

/* ---------------- location ---------------- */
const CITY_ALIASES = [];
for (const [name, country, lat, lon, ...aliases] of GEO.cities) for (const a of aliases) CITY_ALIASES.push([a, name, country]);
const CITY_RX = bounded(CITY_ALIASES.map(a => a[0]));
const CITY_BY_ALIAS = new Map(CITY_ALIASES.map(([a, n, c]) => [a, [n, c]]));
const LONG_COUNTRY = []; const CODE_COUNTRY = new Map();
for (const [name, aliases] of Object.entries(GEO.countries)) for (const a of aliases) (a.length <= 3 && !a.includes('.') ? CODE_COUNTRY.set(a.toUpperCase(), name) : LONG_COUNTRY.push([a, name]));
const COUNTRY_RX = bounded(LONG_COUNTRY.map(a => a[0]));
const COUNTRY_BY_ALIAS = new Map(LONG_COUNTRY);
const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const US_STATE_NAMES = /\b(california|texas|new york|washington state|massachusetts|illinois|colorado|georgia|florida|virginia|north carolina|oregon|utah|arizona|pennsylvania|new jersey|michigan|minnesota|ohio|tennessee|maryland)\b/i;
export const CITY_INFO = new Map(GEO.cities.map(([n, c, lat, lon]) => [n, { country: c, lat, lon }]));

export function parseLocation(loc) {
  const s = String(loc || ''), low = s.toLowerCase();
  const cities = new Set(), countries = new Set();
  for (const m of low.matchAll(CITY_RX)) { const [n, c] = CITY_BY_ALIAS.get(m[0].toLowerCase()) || []; if (n) { cities.add(n); countries.add(c); } }
  for (const m of low.matchAll(COUNTRY_RX)) { const c = COUNTRY_BY_ALIAS.get(m[0].toLowerCase()); if (c) countries.add(c); }
  for (const tok of s.split(/[,;|/()\-–]+/).map(x => x.trim())) {
    if (cities.size || !/^[A-Z]{2,3}$/.test(tok)) continue;   // a named city already fixes the country
    if (US_STATES.has(tok) && tok !== 'IN') countries.add('United States');
    else if (CODE_COUNTRY.has(tok)) countries.add(CODE_COUNTRY.get(tok));
  }
  if (!countries.size && US_STATE_NAMES.test(s)) countries.add('United States');
  return { cities: [...cities].slice(0, 12), countries: [...countries].slice(0, 12) };
}
const rad = d => (d * Math.PI) / 180;
export function km(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
export function citiesNear(name, radiusKm) {
  const c = CITY_INFO.get(name);
  if (!c) return [name];
  return [...CITY_INFO].filter(([, o]) => km(c, o) <= radiusKm).map(([n]) => n);
}

/* ---------------- skills ---------------- */
const SKILL_ALIASES = [];
for (const [name, aliases] of Object.entries(SKILLS)) for (const a of aliases) SKILL_ALIASES.push([a, name]);
const SKILL_RX = bounded(SKILL_ALIASES.map(a => a[0]));
const SKILL_BY_ALIAS = new Map(SKILL_ALIASES);
export const SKILL_NAMES = Object.keys(SKILLS);
export function extractSkills(text, max = 30) {
  const found = new Map();
  for (const m of String(text).toLowerCase().matchAll(SKILL_RX)) {
    const n = SKILL_BY_ALIAS.get(m[0].toLowerCase());
    if (n) found.set(n, (found.get(n) || 0) + 1);
  }
  return [...found].sort((a, b) => b[1] - a[1]).slice(0, max).map(([n]) => n);
}
// map a person's free-text skill to a canonical skill name when we know it
export function canonicalSkill(s) {
  const low = String(s).toLowerCase().trim();
  if (SKILL_BY_ALIAS.has(low)) return SKILL_BY_ALIAS.get(low);
  const hit = SKILL_NAMES.find(n => n.toLowerCase() === low);
  return hit || extractSkills(low, 1)[0] || String(s).trim();
}

/* ---------------- salary ---------------- */
export function parseSalary(text) {
  const s = String(text).slice(0, 6000);
  let m = s.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:-|–|to)\s*(\d{1,3}(?:\.\d+)?)\s*(lpa|lakhs?|l\.p\.a)/i);
  if (m) return { min: Math.round(+m[1] * 1e5), max: Math.round(+m[2] * 1e5), currency: 'INR' };
  m = s.match(/([$£€])\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?k)\s*(?:-|–|to)\s*[$£€]?\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?k)/i);
  if (m) {
    const v = x => (/k$/i.test(x.trim()) ? parseFloat(x) * 1000 : +x.replace(/,/g, ''));
    const min = v(m[2]), max = v(m[3]);
    if (min >= 10000 && max >= min && max < 2e6) return { min, max, currency: { $: 'USD', '£': 'GBP', '€': 'EUR' }[m[1]] };
  }
  return null;
}

/* ---------------- AI signal (kept from v1) ---------------- */
const AI_TERMS = /\b(artificial intelligence|machine learning|llms?|large language models?|genai|generative ai|gen ai|chatgpt|gpt-?\d?|claude|copilot|prompt engineering|prompting|ai agents?|agentic|ai tools?|ai-powered|ai-assisted|rag|nlp|deep learning|computer vision|mlops|pytorch|tensorflow|ai models?|ai products?|ai systems?)\b/gi;
export const aiSignal = s => new Set((String(s).match(AI_TERMS) || []).map(x => x.toLowerCase())).size;
export const AI_TITLE_RX = /(\bai\b|\ba\.i\.|machine learning|\bml\b|\bllm|genai|generative|agentic|\b(ai|llm|autonomous|frontier) agents?\b|agents? (platform|engineer|infrastructure)|prompt engineer|applied scientist|data scien|\bnlp\b|computer vision|mlops|alignment|interpretability|deep learning)/i;
export const normTitle = t => String(t).toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s*[|].*$/, '').replace(/\s*[,–—-]\s*/g, ', ').replace(/,\s*(remote|hybrid|us|usa|uk|emea|apac|india|europe|[a-z]+ ?[a-z]*, [a-z]{2})$/, '')
  .replace(/\b(senior|sr\.?|staff|principal|lead|junior|jr\.?|associate|intern(ship)?|head of|i{1,3}|iv|v|\d+)\b/g, '').replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim();

/* ---------------- the row ---------------- */
// raw: { source, sourceName, kind: ats|aggregator|willai, category, rawId, title, company, location, url, posted, dept, remote, hybrid, tags, text, salary, employment }
export function normalize(raw) {
  const title = strip(raw.title).slice(0, 300);
  const text = clip(strip(raw.text), 2000);
  const location = strip(raw.location).slice(0, 300);
  const company = String(raw.company || '').trim().replace(/^[a-z]/, c => c.toUpperCase()).slice(0, 200);
  const { cities, countries } = parseLocation(location);
  const mode = workMode({ title, location, text, remote: raw.remote, hybrid: raw.hybrid, kind: raw.kind });
  const sal = raw.salary || parseSalary(text);
  const posted = raw.posted ? new Date(raw.posted) : null;
  return {
    id: `${raw.source}:${raw.rawId}`.slice(0, 300), source: raw.source, source_name: raw.sourceName || raw.source, source_kind: raw.kind || 'aggregator',
    company, company_category: raw.category || null, title, norm_title: normTitle(title).slice(0, 200),
    role_family: roleFamily(title, raw.dept), seniority: seniority(title, text), employment_type: employmentType(title, raw.employment, text),
    work_mode: mode, cities, countries, location_raw: location, dept: strip(raw.dept).slice(0, 120) || null,
    salary_min: sal?.min ?? null, salary_max: sal?.max ?? null, salary_currency: sal?.currency ?? null,
    skills: extractSkills(`${title} ${text}`), tags: (raw.tags || []).map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 20),
    text, url: String(raw.url || '').slice(0, 1000),
    posted_at: posted && !isNaN(posted) && posted.getTime() < Date.now() + 864e5 ? posted.toISOString() : null,
    ai: aiSignal(text) >= 2 || AI_TITLE_RX.test(title), ai_title: AI_TITLE_RX.test(title),
  };
}
