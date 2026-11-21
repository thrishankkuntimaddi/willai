// How WillAI works: data, scores, scam checks, and your data.
import { app } from '../core.js';

export default function about() {
  app().innerHTML = `<article class="prose enter">
  <h1>How WillAI works</h1>
  <h2>Live openings from official sources</h2>
  <p>Every six hours the server collects open roles from the public job APIs companies use for their own careers pages (Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Recruitee) across 248 companies, plus open boards like Himalayas, Remotive, RemoteOK, Jobicy, Arbeitnow and The Muse, and aggregators like Adzuna and Jooble. We never scrape sites that forbid it, which is why LinkedIn and Naukri are not included.</p>
  <p>Each posting is sorted into a role family, a level (internship to lead), a work mode (remote, hybrid or office) and a place, and its skills are picked out. Postings are never deleted: when a role disappears from a company’s board it is marked closed, and old postings are marked older, so the Jobs page shows what is open now unless you ask for more.</p>
  <h2>Your three numbers</h2>
  <ul><li><b>AI exposure.</b> The AI splits your week (or, for students and freshers, the work of the role you want) into tasks, with the share of time each takes and how much of it AI can do. Exposure is the time-weighted average. Every report shows the table.</li>
  <li><b>Readiness for your target.</b> We take the skills that live openings for your target ask for and weight each by how often it is asked for. Skills you have count fully, skills you are learning count half. The AI only judges skills you did not list, using your projects and experience, and those are marked.</li>
  <li><b>Openings near you.</b> Live roles for your target in your cities (within 50 km) and work modes, plus remote roles open to your country.</li></ul>
  <h2>Your plan</h2>
  <p>You choose the length (30 days to a year) and your weekly hours. The plan is split into weeks or months, each step has the hours it takes and something you can show for it, and resources link straight to well-known learning sites. Anything else becomes a search, so the AI cannot send you to a page that does not exist.</p>
  <h2>Scam checks</h2>
  <ul><li>Every posting gets a trust score with reasons you can read: asking for a fee or deposit, contact only over WhatsApp or Telegram, a personal email for applications, link shorteners, pay far above similar roles, “earn daily from home” promises, very little detail, the same text under different company names.</li>
  <li>Postings with serious warnings are hidden unless you choose to see them. Three reports from signed-in people hide a posting until it is reviewed.</li>
  <li>Employers post through our server, so their roles get the same checks. Employers with a confirmed work email on their company’s domain get a verified badge.</li>
  <li>Real employers never charge you to apply. Never share bank, ID or card details before an offer.</li></ul>
  <h2>Your data</h2>
  <ul><li>Without an account, your answers stay on your device. With an account, your profile, reports, plan progress and saved jobs are stored in your account and only you can read them.</li>
  <li>Sharing a report is opt-in and anonymous: the shared card has your role, rough experience, city, scores and plan headlines, never your name, email or notes.</li>
  <li>You can download everything or delete your account from Settings.</li></ul>
  <h2>Limits</h2>
  <ul><li>Exposure is how much of a task AI can do or speed up. Whether jobs are cut depends on cost, rules, trust and employers.</li>
  <li>Our sources are strongest for technology companies. Other trades still work, and the report says when evidence is thin.</li>
  <li>AI can be wrong. Treat the report as a starting point.</li></ul>
  </article>`;
}
