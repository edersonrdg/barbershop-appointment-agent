// LGPD: an error message may carry a client's phone or name, so only the
// error's name and code are logged.
export function errorIdentity(error: unknown): {
  name?: string;
  code?: string;
} {
  const { name, code } = error as { name?: string; code?: string };
  return { name, code };
}
