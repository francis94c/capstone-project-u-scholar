const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Ai } = require('../dist/ai');
test('live integration validates questions and excludes invented URLs', async () => {
  process.env.DEMO_MODE = 'false';
  process.env.OPENAI_API_KEY = 'test-not-a-real-key';
  const original = global.fetch;
  const calls = [];
  const resources = Array.from({ length: 4 }, (_, i) => ({
    title: `Course ${i}`,
    skill: 'Types',
    provider: 'Example',
    url: `https://example.com/course/${i}`,
    level: 'foundation',
    reason: 'Build fundamentals',
  }));
  const replies = [
    {
      questions: Array.from({ length: 4 }, () => ({
        skill: 'Types',
        question: 'Which value is a string?',
        options: ['1', 'true', '"hi"', 'null'],
        correct: 2,
        explanation: 'Quoted text is a string.',
      })),
    },
    null,
    {
      resources: [
        ...resources,
        { ...resources[0], url: 'https://invented.example/fake' },
      ],
    },
  ];
  global.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body));
    const reply = replies.shift();
    return {
      ok: true,
      json: async () =>
        reply
          ? {
              output: [
                {
                  type: 'message',
                  content: [
                    { type: 'output_text', text: JSON.stringify(reply) },
                  ],
                },
              ],
            }
          : {
              output: [
                {
                  type: 'web_search_call',
                  action: { sources: resources.map((r) => ({ url: r.url })) },
                },
                {
                  type: 'message',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Sourced courses',
                      annotations: [],
                    },
                  ],
                },
              ],
            },
    };
  };
  try {
    const ai = new Ai();
    const a = await ai.assess('TypeScript');
    assert.equal(a.questions[0].correct, 2);
    const track = await ai.resources(a, [{ skill: 'Types', score: 0 }]);
    assert.equal(track.resources.length, 4);
    assert.equal(calls[1].tools[0].type, 'web_search');
    assert.equal(track.sources.length, 4);
  } finally {
    global.fetch = original;
    delete process.env.OPENAI_API_KEY;
  }
});
test('malformed provider output gives a safe retryable error', async () => {
  process.env.DEMO_MODE = 'false';
  const ai = new Ai();
  ai.response = async () => ({ text: '{"questions":[]}' });
  await assert.rejects(ai.assess('Python'), /Invalid assessment/);
});
