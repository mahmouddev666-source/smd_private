import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fetchEmployees, fetchFormFiles, fetchFormSubmissions} from '../../src/services/apiClient';

/**
 * R5: the backend caps every paginated list at `limit <= 200`. The shared
 * `fetchAllPages` helper must therefore let each caller pick its page size;
 * the forms endpoints use 200 while the other lists keep 500.
 */

interface PageBody {
  items: unknown[];
  total: number;
  limit: number;
  offset: number;
}

function jsonResponse(body: unknown): Response {
  return {
    status: 200,
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

function page(items: unknown[], total: number, limit: number, offset: number): PageBody {
  return {items, total, limit, offset};
}

function parse(url: string): URL {
  return new URL(url, 'http://local.test');
}

describe('fetchAllPages pagination contract (R5)', () => {
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
    // `request()` uses window.setTimeout; node has no window.
    vi.stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function installFetch(handler: (url: URL) => PageBody): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(url);
        return jsonResponse(handler(parse(url)));
      }),
    );
  }

  it('asks /forms/files for pages of 200 and steps the offset', async () => {
    installFetch((url) => {
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      const count = offset === 0 ? limit : 50;
      return page(Array.from({length: count}, () => ({id: 'x', original_name: 'a.pdf', mime: 'application/pdf', kind: 'pdf', size_bytes: 1, page_count: 1, created_at: '2026-01-01T00:00:00Z'})), 250, limit, offset);
    });

    await fetchFormFiles();

    expect(calls.map((url) => parse(url).searchParams.get('limit'))).toEqual(['200', '200']);
    expect(calls.map((url) => parse(url).searchParams.get('offset'))).toEqual(['0', '200']);
  });

  it('asks /forms/submissions for pages of 200', async () => {
    installFetch((url) => {
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      return page(offset === 0 ? Array.from({length: limit}, () => ({id: 's', template_id: 't', employee_id: null, values: {}, status: 'NEUTRAL', created_by: null, created_at: '2026-01-01T00:00:00Z'})) : [], 250, limit, offset);
    });

    await fetchFormSubmissions({templateId: 't1'});

    expect(calls).toHaveLength(2);
    expect(parse(calls[0]).searchParams.get('limit')).toBe('200');
    expect(parse(calls[0]).searchParams.get('template_id')).toBe('t1');
    expect(parse(calls[1]).searchParams.get('offset')).toBe('200');
  });

  it('keeps the default page size of 500 for other lists', async () => {
    installFetch((url) => {
      const limit = Number(url.searchParams.get('limit'));
      return page([], 0, limit, 0);
    });

    await fetchEmployees();

    expect(parse(calls[0]).searchParams.get('limit')).toBe('500');
  });
});
