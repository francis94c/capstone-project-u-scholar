const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createApp } = require('../dist/main');
test('HTTP validation and complete guest-to-account learning workflow', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scholar-http-'));
  process.env.DATABASE_PATH = join(dir, 'http.sqlite');
  process.env.DEMO_MODE = 'true';
  process.env.NODE_ENV = 'test';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function call(method, path, body, token) {
    const response = await fetch(base + '/api/' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    assert.equal((await call('GET', 'health')).data.demo, true);
    for (const origin of [
      'http://localhost:54321',
      'http://127.0.0.1:8097',
      'http://[::1]:8080',
    ]) {
      const preflight = await fetch(base + '/api/tracks', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      assert.equal(preflight.status, 204);
      assert.equal(
        preflight.headers.get('access-control-allow-origin'),
        origin,
      );
      assert.match(
        preflight.headers.get('access-control-allow-headers'),
        /Authorization/,
      );
    }
    const denied = await fetch(base + '/api/health', {
      headers: { Origin: 'https://localhost.evil.example' },
    });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const unauthenticated = await fetch(base + '/api/tracks', {
      headers: { Origin: 'http://localhost:54321' },
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(
      unauthenticated.headers.get('access-control-allow-origin'),
      'http://localhost:54321',
    );
    const malformed = await fetch(base + '/api/assessments', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:54321',
        'Content-Type': 'application/json',
      },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.equal(
      malformed.headers.get('access-control-allow-origin'),
      'http://localhost:54321',
    );
    assert.equal(
      (await call('POST', 'assessments', { topic: 'x' })).status,
      400,
    );
    assert.equal((await call('GET', 'tracks')).status, 401);
    const a = (await call('POST', 'assessments', { topic: 'Python' })).data;
    assert.equal(
      (
        await call('POST', `assessments/${a.id}/answers`, {
          answers: [0, 1, 2, 4],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('POST', `assessments/${a.id}/answers`, {
          answers: [0, 1, 2, 3],
        })
      ).status,
      201,
    );
    const auth = (
      await call('POST', 'auth/register', {
        name: 'HTTP Learner',
        email: 'http@example.com',
        password: 'safe-password-123',
      })
    ).data;
    const token = auth.token;
    assert.ok(token);
    const track = (await call('POST', 'tracks', { assessmentId: a.id }, token))
      .data;
    assert.equal(track.resources.length, 4);
    const path = `tracks/${track.id}/resources/`;
    assert.equal(
      (await call('POST', path + track.resources[1].id + '/open', null, token))
        .status,
      409,
    );
    assert.equal(
      (await call('POST', path + track.resources[0].id + '/open', null, token))
        .data.clicks,
      1,
    );
    assert.equal(
      (
        await call(
          'PUT',
          path + track.resources[0].id + '/notes',
          { notes: 'HTTP note' },
          token,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          'POST',
          path + track.resources[0].id + '/complete',
          null,
          token,
        )
      ).status,
      201,
    );
    assert.equal((await call('GET', 'me', null, token)).data.xp, 100);
    assert.equal(
      (
        await call(
          'PUT',
          'me/reminder',
          { enabled: false, timeUtc: '25:00', days: [1] },
          token,
        )
      ).status,
      400,
    );
    assert.equal((await call('POST', 'auth/logout', null, token)).status, 201);
    assert.equal((await call('GET', 'me', null, token)).status, 401);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
