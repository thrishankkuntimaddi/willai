// The career profile: one shape used by the analyse steps, the profile page and the adviser.
import { S, signedIn } from './core.js';

export const STATUSES = [
  { id: 'working', label: 'Working', hint: 'In a job now' },
  { id: 'fresher', label: 'Fresher', hint: 'First job search' },
  { id: 'student', label: 'Student', hint: 'Still studying' },
  { id: 'gap', label: 'Career break', hint: 'Back after a break' },
  { id: 'between', label: 'Between jobs', hint: 'Recently left a job' },
  { id: 'freelancer', label: 'Freelancer', hint: 'Working for clients' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.id, s.label]));
export const MODES = [{ id: 'remote', label: 'Remote' }, { id: 'hybrid', label: 'Hybrid' }, { id: 'onsite', label: 'Office' }];
export const PLAN_LENGTHS = [30, 60, 90, 180];
export const LEVELS = { 1: 'Learning', 2: 'Can use', 3: 'Strong' };
export const GAP_REASONS = ['Family or caregiving', 'Health', 'Higher studies', 'Relocation', 'Layoff', 'Exam preparation', 'Personal reasons', 'Other'];
export const hasRole = c => ['working', 'between', 'freelancer'].includes(c.status) || (c.status === 'gap' && !!c.role);

export const blank = () => ({
  status: 'working', role: '', company: '', years: '', dailyWork: '', gapMonths: '', gapReason: '', gradYear: '',
  skills: [], technologies: [], projects: [], education: [],
  target: '', workModes: [], locations: [], country: 'India', relocate: false, expectedSalary: '', noticePeriod: '',
  planDays: 90, weeklyHours: 8, budget: 'free', constraints: '',
});

const KEY = 'willai.career';
export function loadCareer() {
  const local = JSON.parse(localStorage.getItem(KEY) || 'null');
  const remote = S.profile?.career;
  const base = blank();
  // account copy wins when signed in; the device copy fills gaps (e.g. answers typed before signing in)
  return { ...base, ...(local || {}), ...(signedIn() && remote ? remote : {}), ...(S.profile?.prefs?.defaultPlanDays && !remote?.planDays ? { planDays: S.profile.prefs.defaultPlanDays } : {}) };
}
export async function saveCareer(c) {
  localStorage.setItem(KEY, JSON.stringify(c));
  if (signedIn() && S.fb) { await S.fb.saveCareer(c); S.profile = { ...S.profile, career: c }; }
}

export function completeness(c) {
  const checks = [
    ['Your current situation', !!c.status],
    [hasRole(c) ? 'Your role' : 'Graduation year', hasRole(c) ? !!c.role : !!c.gradYear],
    ['Years of experience', c.status === 'student' || c.status === 'fresher' || c.years !== ''],
    ['At least 5 skills', c.skills.length >= 5],
    ['Tools and technologies', c.technologies.length > 0],
    ['A project', c.projects.length > 0],
    ['Education', c.education.length > 0],
    ['Target role', !!c.target],
    ['Preferred work mode', c.workModes.length > 0],
    ['Location', c.locations.length > 0 || !!c.country],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { pct: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([l]) => l) };
}

// what the analysis page says at the top
export function describeShort(c) {
  const who = hasRole(c) ? `${c.role}${c.years !== '' ? `, ${c.years} yrs` : ''}` : STATUS_LABEL[c.status];
  return `${who}${c.target ? ` → ${c.target}` : ''}`;
}
