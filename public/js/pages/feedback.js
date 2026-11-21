// General feedback about the site.
import { app, $ } from '../core.js';
import { feedbackWidget } from '../feedback-ui.js';

export default function feedback() {
  app().innerHTML = `<div class="enter narrow" style="margin:48px auto"><header class="page-h" style="padding-top:0"><div><h1>Feedback</h1><p>Something broken, a job that looks wrong, or an idea? Tell us.</p></div></header><div id="fbw"></div></div>`;
  feedbackWidget($('#fbw'), { page: 'site' });
}
