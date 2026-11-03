
import { describe, expect, it } from 'vitest';

import { normalizeDutchMobileNumber } from './klantcontact-profieldienst.ts';

describe('WP4 - Telefoonnummer validatie', () => {
  it.each([
    ['0612345678', '+31612345678'],
    ['+31612345678', '+31612345678'],
    ['0031612345678', '+31612345678'],
    ['06 1234 5678', '+31612345678'],
    ['06-1234-5678', '+31612345678'],
  ])('accepteert %s', (input, expected) => {
    expect(normalizeDutchMobileNumber(input)).toBe(expected);
  });

  it.each([
    '061234567',
    '0201234567',
    'abcdefghij',
    '',
    '+316123456789',
  ])('weigert %s', (input) => {
    expect(() => normalizeDutchMobileNumber(input)).toThrow(
      'Ongeldig Nederlands mobiel telefoonnummer'
    );
  });
});
