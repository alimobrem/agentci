/** UUID spellings are case-insensitive; evidence payloads remain byte-for-byte intact. */
export function equalUuid(actual:unknown,expected:unknown):boolean {
  const pattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  return typeof actual==='string'&&typeof expected==='string'&&pattern.test(actual)&&pattern.test(expected)&&actual.toLowerCase()===expected.toLowerCase();
}
