const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const endpoint = 'https://script.google.com/macros/s/AKfycbzHFsvw0PPPvT6_35b91dR-qLuWnlJTMuEe9H8veBgTr2AGNynAqb_vyUHLAgVDf6M6/exec';
const versionSource = fs.readFileSync(path.resolve(__dirname, '../../apps-script/Code.gs'), 'utf8');
const expectedRelease = process.env.KPI_QA_EXPECTED_RELEASE || /const KPI_RELEASE_VERSION_\s*=\s*'([^']+)'/.exec(versionSource)?.[1];
if (!expectedRelease) throw new Error('Candidate release version is required');
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error('Provide a new evidence path; previous attempts must be preserved');
const allowed = new Set(['script.google.com', 'script.googleusercontent.com']);
const report = { endpoint, expected_release: expectedRelease, started_at: new Date().toISOString(), scope: 'Six serial anonymous ping requests; no writes, accounts, upload, browser, concurrent load or availability certification', results: [] };
async function probe(method, round) {
  const result = { method, round, started_at: new Date().toISOString(), hops: [], ok: false };
  const started = Date.now();
  let url = endpoint + (method === 'GET' ? '?action=ping' : '');
  let options = method === 'POST' ? { method, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'ping' }) } : { method };
  try {
    for (let hop = 0; hop < 5; hop++) {
      const start = Date.now();
      const response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(35000) });
      const body = await response.text();
      const location = response.headers.get('location');
      const entry = { host: new URL(url).hostname, status: response.status, content_type: response.headers.get('content-type'), ms: Date.now() - start, chars: body.length };
      result.hops.push(entry);
      if (location) {
        const next = new URL(location, url);
        if (next.protocol !== 'https:' || !allowed.has(next.hostname)) throw new Error('Unexpected redirect host');
        if (response.status === 303 || ([301, 302].includes(response.status) && options.method === 'POST')) options = { method: 'GET' };
        url = next.href;
        continue;
      }
      let data;
      try { data = JSON.parse(body.replace(/^\uFEFF/, '')); } catch {}
      result.ok = response.ok && data?.ok === true && data.release === expectedRelease;
      entry.release = data?.release || '';
      if (!result.ok) {
        entry.body_sha256 = crypto.createHash('sha256').update(body).digest('hex');
        entry.title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.slice(0, 160) || '';
      }
      break;
    }
  } catch (error) { result.error = error.code || error.message; }
  result.elapsed_ms = Date.now() - started;
  report.results.push(result);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(result));
}
(async () => {
  for (let round = 1; round <= 3; round++) {
    await probe('GET', round);
    await probe('POST', round);
  }
  report.finished_at = new Date().toISOString();
  report.ok = report.results.every(result => result.ok);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
})();
