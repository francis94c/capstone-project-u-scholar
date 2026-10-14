const { test } = require('node:test');
const assert = require('node:assert/strict');
const { corsOptions } = require('../dist/cors');
function allows(env, origin) {
  let result;
  corsOptions(env).origin(origin, (error, allowed) => {
    assert.equal(error, null);
    result = allowed;
  });
  return result;
}
test('production uses only the configured exact origin allowlist', () => {
  const env = {
    NODE_ENV: 'production',
    CORS_ORIGINS: ' https://scholar.example/ , https://learn.example ',
  };
  assert.equal(allows(env, 'https://scholar.example'), true);
  assert.equal(allows(env, 'https://learn.example'), true);
  for (const origin of [
    'http://localhost:54321',
    'https://scholar.example.evil',
    'null',
  ])
    assert.equal(allows(env, origin), false);
  assert.equal(allows(env, undefined), true);
});
test('development accepts loopback origins but rejects lookalikes', () => {
  for (const origin of [
    'http://localhost:54321',
    'http://127.0.0.1:8097',
    'http://[::1]:8000',
  ])
    assert.equal(allows({}, origin), true);
  for (const origin of [
    'http://localhost.evil:8080',
    'http://localhost:8080/path',
    'https://evil.example',
    'null',
  ])
    assert.equal(allows({}, origin), false);
});
