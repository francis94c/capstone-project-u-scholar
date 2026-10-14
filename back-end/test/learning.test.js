const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('reflect-metadata');
const { LearningService } = require('../dist/service');
const { Ai } = require('../dist/ai');
test('assessment, account gate, ownership, sequential learning, notes and persistence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scholar-test-'));
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
  process.env.DEMO_MODE = 'true';
  delete process.env.RESEND_API_KEY;
  const s = new LearningService(new Ai());
  try {
    const a = await s.assess('TypeScript');
    assert.equal(a.questions.length, 4);
    assert.equal(a.questions[0].correct, undefined);
    assert.throws(() => s.answer(a.id, [0]), /Answer every/);
    s.answer(a.id, [0, 1, 2, 3]);
    assert.throws(() => s.answer(a.id, [3, 3, 3, 3]), /already submitted/);
    assert.throws(() => s.user(), /Unauthorized/);
    const auth = await s.auth(
      'LEARNER@example.com',
      'safe-password-123',
      'Learner',
    );
    const uid = auth.user.id;
    const user = s.user('Bearer ' + auth.token);
    assert.equal(user.email, 'learner@example.com');
    assert.notEqual(user.password, 'safe-password-123');
    await assert.rejects(
      s.auth('learner@example.com', 'safe-password-123', 'Duplicate'),
      /already registered/,
    );
    await assert.rejects(
      s.auth('learner@example.com', 'wrong-password-123'),
      /Invalid email/,
    );
    const track = await s.generate(uid, a.id);
    assert.equal(track.resources.length, 4);
    assert.equal(track.scores[0].score, 0);
    const r = track.resources;
    assert.throws(() => s.resource(uid, track.id, r[1].id, 'open'), /previous/);
    assert.throws(
      () => s.resource(uid, track.id, r[0].id, 'complete'),
      /Open the resource/,
    );
    const other = await s.auth(
      'other@example.com',
      'safe-password-123',
      'Other',
    );
    assert.throws(
      () => s.resource(other.user.id, track.id, r[0].id, 'open'),
      /Not Found/,
    );
    await assert.rejects(s.generate(other.user.id, a.id));
    s.resource(uid, track.id, r[0].id, 'open');
    s.resource(uid, track.id, r[0].id, 'notes', 'Practice generics');
    s.resource(uid, track.id, r[0].id, 'complete');
    s.resource(uid, track.id, r[0].id, 'complete');
    s.resource(uid, track.id, r[1].id, 'open');
    assert.equal(s.profile(user).xp, 100);
    assert.equal(s.profile(user).streak, 1);
    assert.equal(s.list(uid)[0].resources[0].notes, 'Practice generics');
    assert.throws(
      () => s.reminder(uid, { enabled: true, timeUtc: '18:00', days: [1] }),
      /RESEND/,
    );
    s.logout('Bearer ' + auth.token);
    assert.throws(() => s.user('Bearer ' + auth.token));
    s.store.db.close();
    const restored = new LearningService(new Ai());
    assert.equal(restored.list(uid)[0].resources[0].clicks, 1);
    assert.equal(
      restored.store.db.prepare('SELECT count(*) AS n FROM mail').get().n,
      2,
    );
    restored.store.db.close();
  } finally {
    try {
      s.store.db.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});
test('live mode does not silently fabricate assessments without a key', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.DEMO_MODE = 'false';
  await assert.rejects(new Ai().assess('Python'), /OPENAI_API_KEY/);
});

test('welcome mail retries and reminders send once per UTC day', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scholar-mail-'));
  process.env.DATABASE_PATH = join(dir, 'mail.sqlite');
  process.env.DEMO_MODE = 'true';
  delete process.env.RESEND_API_KEY;
  const service = new LearningService(new Ai());
  const original = global.fetch;
  try {
    const account = await service.auth(
      'mail@example.com',
      'safe-password-123',
      'Learner',
    );
    process.env.RESEND_API_KEY = 'test-not-real';
    process.env.EMAIL_FROM = 'test@example.com';
    let attempts = 0;
    const keys = [];
    global.fetch = async (url, options) => {
      attempts++;
      keys.push(options.headers['Idempotency-Key']);
      return { ok: attempts > 1 };
    };
    await service.deliver();
    assert.equal(
      service.store.db.prepare('SELECT attempts FROM mail').get().attempts,
      1,
    );
    await service.deliver();
    assert.equal(
      service.store.db.prepare('SELECT sent FROM mail').get().sent,
      1,
    );
    assert.equal(keys[0], keys[1]);
    service.reminder(account.user.id, {
      enabled: true,
      timeUtc: '00:00',
      days: [new Date().getUTCDay()],
    });
    await service.deliver();
    await service.deliver();
    assert.equal(attempts, 3);
    assert.equal(
      service.store.db.prepare('SELECT count(*) AS n FROM mail').get().n,
      2,
    );
  } finally {
    global.fetch = original;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    service.store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
