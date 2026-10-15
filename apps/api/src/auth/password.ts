import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to argon2id.
export const hashPassword = (pw: string): Promise<string> => hash(pw);

export const verifyPassword = (passwordHash: string, pw: string): Promise<boolean> =>
  verify(passwordHash, pw);
