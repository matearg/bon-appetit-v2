import { describe, expect, it } from 'vitest';
import { emailSchema, listInputSchema, recipeInputSchema, signupBodySchema } from './schemas.js';

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  A@X.com ')).toBe('a@x.com');
  });

  it('rejects emails longer than 254 chars', () => {
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`;
    const email = `${'a'.repeat(64)}@${domain}`;
    expect(email.length).toBe(255);
    expect(emailSchema.safeParse(email).success).toBe(false);
  });
});

describe('signupBodySchema', () => {
  const valid = { email: 'a@x.com', password: 'a'.repeat(8), inviteCode: 'code' };

  it('rejects a 7-char password', () => {
    expect(signupBodySchema.safeParse({ ...valid, password: 'a'.repeat(7) }).success).toBe(false);
  });

  it('rejects a missing inviteCode', () => {
    const { inviteCode: _omit, ...rest } = valid;
    expect(signupBodySchema.safeParse(rest).success).toBe(false);
  });

  it('accepts a 128-char password', () => {
    expect(signupBodySchema.safeParse({ ...valid, password: 'a'.repeat(128) }).success).toBe(true);
  });
});

describe('recipeInputSchema', () => {
  it('trims the title', () => {
    expect(recipeInputSchema.parse({ title: '  Soup ', ingredients: [], steps: [] }).title).toBe(
      'Soup',
    );
  });

  it('rejects a blank title', () => {
    expect(recipeInputSchema.safeParse({ title: '   ', ingredients: [], steps: [] }).success).toBe(
      false,
    );
  });

  it('rejects 101 ingredients', () => {
    const ingredients = Array.from({ length: 101 }, () => 'salt');
    expect(recipeInputSchema.safeParse({ title: 'T', ingredients, steps: [] }).success).toBe(false);
  });

  it('rejects a 2001-char step', () => {
    expect(
      recipeInputSchema.safeParse({ title: 'T', ingredients: [], steps: ['s'.repeat(2001)] })
        .success,
    ).toBe(false);
  });

  it('rejects a blank ingredient', () => {
    expect(
      recipeInputSchema.safeParse({ title: 'T', ingredients: ['  '], steps: [] }).success,
    ).toBe(false);
  });
});

describe('listInputSchema', () => {
  it('rejects a 61-char name', () => {
    expect(listInputSchema.safeParse({ name: 'n'.repeat(61) }).success).toBe(false);
  });
});
