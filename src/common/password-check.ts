import * as argon2 from 'argon2';
// Public dummy hash ensures unknown accounts still perform a password verification.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$0cJNerF6p4f6ZtxwPu+IZA$1SnLmsto/u4bK1IvjKasS+Veh0OfAt67Nc06sQoYNRc';
export async function checkPassword(
  hash: string | null | undefined,
  password: string,
): Promise<boolean> {
  const valid = await argon2
    .verify(hash || DUMMY_HASH, password)
    .catch(() => false);
  return Boolean(hash) && valid;
}
