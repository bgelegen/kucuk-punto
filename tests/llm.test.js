import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLLM, httpError, withRetry } from '../src/core/llm.js';

const cfg = { kind: 'openai', baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k', structured: 'json_object' };
const ok = { choices: [{ message: { content: '{"ok":true}' } }], model: 'm' };
const fakeFetch = (seq) => { let i = 0; const calls = []; const f = async (url, init) => { calls.push(init); const [status, body] = seq[Math.min(i++, seq.length - 1)]; return { ok: status < 400, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body), headers: { get: () => null } }; }; f.calls = calls; return f; };
const noSleep = { sleep: async () => {} };

test('provider errors keep the status and the provider message, never the key', () => {
  const e = httpError(503, JSON.stringify({ error: { message: 'The model is overloaded. Please try again later.' } }));
  assert.equal(e.code, 'UPSTREAM');
  assert.match(e.message, /503: The model is overloaded/);
  assert.equal(httpError(400, JSON.stringify([{ error: { message: 'API key not valid. Please pass a valid API key.' } }])).code, 'AUTH');
  assert.equal(httpError(429, '{"error":{"message":"Quota exceeded ... GenerateRequestsPerDayPerProjectPerModel-FreeTier"}}').code, 'QUOTA');
  assert.equal(httpError(429, '{"error":{"message":"Please retry in 41.3s."}}').retryAfterMs, 41300);
});

test('temporary errors (503, per-minute 429) are retried, then succeed', async () => {
  const f = fakeFetch([[503, { error: { message: 'overloaded' } }], [429, { error: { message: 'Please retry in 2s.' } }], [200, ok]]);
  const llm = makeLLM(cfg, f, { retry: { retries: 3, ...noSleep } });
  const r = await llm({ system: 's', turns: [{ role: 'user', content: 'u' }] });
  assert.equal(r.text, '{"ok":true}');
  assert.equal(f.calls.length, 3);
});

test('daily quota, bad key and too-long waits are not retried', async () => {
  for (const [status, body, code] of [[429, { error: { message: 'limit PerDay' } }, 'QUOTA'], [401, {}, 'AUTH'], [429, { error: { message: 'Please retry in 600s.' } }, 'RATE']]) {
    const f = fakeFetch([[status, body], [200, ok]]);
    const llm = makeLLM(cfg, f, { retry: { retries: 3, maxWaitMs: 60000, ...noSleep } });
    await assert.rejects(llm({ system: 's', turns: [] }), e => e.code === code);
    assert.equal(f.calls.length, 1, code);
  }
});

test('withRetry gives up after the configured number of retries', async () => {
  let n = 0;
  const call = withRetry(async () => { n++; throw Object.assign(new Error('x'), { code: 'UPSTREAM' }); }, { retries: 2, ...noSleep });
  await assert.rejects(call({}));
  assert.equal(n, 3);
});
