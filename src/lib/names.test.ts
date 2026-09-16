import { describe, expect, it } from 'vitest';

import { isLoginShape, isReserved } from './names';

describe('isReserved', () => {
  it.each(['api', 'login', 'logout', 'callback'])(
    'holds /%s, a route without a page of its own',
    (segment) => {
      expect(isReserved(segment)).toBe(true);
    },
  );

  it('matches whatever case the URL carried', () => {
    expect(isReserved('API')).toBe(true);
    expect(isReserved('Login')).toBe(true);
  });

  it('leaves a real login alone', () => {
    expect(isReserved('enonic')).toBe(false);
    expect(isReserved('edloidas')).toBe(false);
  });
});

describe('isLoginShape', () => {
  it('accepts what GitHub issues', () => {
    expect(isLoginShape('enonic')).toBe(true);
    expect(isLoginShape('a')).toBe(true);
    expect(isLoginShape('a-b-c')).toBe(true);
    expect(isLoginShape('Enonic')).toBe(true);
    expect(isLoginShape('user123')).toBe(true);
  });

  it('rejects the probes that would otherwise cost a lookup', () => {
    expect(isLoginShape('favicon.ico')).toBe(false);
    expect(isLoginShape('robots.txt')).toBe(false);
    expect(isLoginShape('.well-known')).toBe(false);
    expect(isLoginShape('')).toBe(false);
  });

  // The waitlist handler's own regex accepts both of these; GitHub never issues them.
  it('rejects hyphens GitHub does not allow', () => {
    expect(isLoginShape('-foo')).toBe(false);
    expect(isLoginShape('foo-')).toBe(false);
    expect(isLoginShape('foo--bar')).toBe(false);
  });

  it('stops at 39 characters', () => {
    expect(isLoginShape('a'.repeat(39))).toBe(true);
    expect(isLoginShape('a'.repeat(40))).toBe(false);
  });

  // Hyphens count toward GitHub's limit, and a pattern bounding repetitions
  // rather than characters would let a hyphenated name run to 77.
  it('counts hyphens toward the limit', () => {
    expect(isLoginShape(`a${'-a'.repeat(19)}`)).toBe(true);
    expect(isLoginShape(`a${'-a'.repeat(38)}`)).toBe(false);
  });
});
