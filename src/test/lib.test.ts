import * as assert from 'assert';
import { humanElapsed, normalizeStatus, parseAgentFrontmatter } from '../lib';

describe('parseAgentFrontmatter', () => {
  it('extracts name and description', () => {
    const md = ['---', 'name: code-reviewer', 'description: Reviews code.', '---', '', 'Body'].join('\n');
    assert.deepStrictEqual(parseAgentFrontmatter(md), {
      name: 'code-reviewer',
      description: 'Reviews code.',
    });
  });

  it('strips surrounding quotes', () => {
    const md = ['---', 'name: "quoted"', "description: 'single'", '---'].join('\n');
    assert.deepStrictEqual(parseAgentFrontmatter(md), { name: 'quoted', description: 'single' });
  });

  it('returns empty object when there is no frontmatter', () => {
    assert.deepStrictEqual(parseAgentFrontmatter('# just markdown'), {});
  });

  it('tolerates CRLF line endings', () => {
    const md = '---\r\nname: win\r\ndescription: crlf\r\n---\r\n';
    assert.deepStrictEqual(parseAgentFrontmatter(md), { name: 'win', description: 'crlf' });
  });
});

describe('normalizeStatus', () => {
  it('returns empty arrays for junk input', () => {
    assert.deepStrictEqual(normalizeStatus(null), { running: [], recent: [] });
    assert.deepStrictEqual(normalizeStatus('nope'), { running: [], recent: [] });
    assert.deepStrictEqual(normalizeStatus({}), { running: [], recent: [] });
  });

  it('keeps well-formed running entries and drops malformed ones', () => {
    const input = {
      running: [
        { id: 'a', agent: 'x', startedAt: '2026-01-01T00:00:00Z' },
        { id: 'b' }, // missing fields -> dropped
      ],
      recent: [],
    };
    const out = normalizeStatus(input);
    assert.strictEqual(out.running.length, 1);
    assert.strictEqual(out.running[0].id, 'a');
  });

  it('requires endedAt for recent entries', () => {
    const input = {
      running: [],
      recent: [
        { id: 'a', agent: 'x', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:01:00Z', status: 'completed' },
        { id: 'b', agent: 'y', startedAt: '2026-01-01T00:00:00Z' }, // no endedAt -> dropped
      ],
    };
    assert.strictEqual(normalizeStatus(input).recent.length, 1);
  });
});

describe('humanElapsed', () => {
  it('formats seconds under a minute', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-01-01T00:00:05.000Z';
    assert.strictEqual(humanElapsed(from, to), '5s');
  });

  it('formats minutes and seconds', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-01-01T00:02:10.000Z';
    assert.strictEqual(humanElapsed(from, to), '2m10s');
  });

  it('never returns a negative value', () => {
    const from = '2026-01-01T00:01:00.000Z';
    const to = '2026-01-01T00:00:00.000Z';
    assert.strictEqual(humanElapsed(from, to), '0s');
  });

  it('returns empty string on unparseable input', () => {
    assert.strictEqual(humanElapsed('not-a-date', 'also-bad'), '');
  });
});
