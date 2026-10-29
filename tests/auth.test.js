import { describe, expect, it } from 'vitest';
import { codeRole } from '../src/auth.js';

describe('codeRole (basic mode, checked on the phone)', () => {
  const codes = { code: 'hoops', viewerCode: 'watch' };
  it('gives team for the team code and fan for the fan code', () => {
    expect(codeRole('hoops', codes)).toBe('team');
    expect(codeRole('watch', codes)).toBe('fan');
  });
  it('rejects anything else, including when codes are unknown', () => {
    expect(codeRole('HOOPS', codes)).toBeNull();
    expect(codeRole('', codes)).toBeNull();
    expect(codeRole('hoops', null)).toBeNull();
  });
  it('treats a blank fan code as no fans', () => {
    expect(codeRole('', { code: 'hoops', viewerCode: '' })).toBeNull();
    expect(codeRole('watch', { code: 'hoops' })).toBeNull();
  });
});
