import { PhoneNumber } from '../../../../domain/value-objects/phone-number';

const PERSONAL_JID_PATTERN = /^(55\d{10,11})@s\.whatsapp\.net$/;
const EIGHT_DIGIT_MOBILE_PATTERN = /^(55\d{2})([6-9]\d{7})$/;

// RN-08: the client is identified by the E.164 phone behind the JID. WhatsApp
// keeps older Brazilian mobiles without the ninth digit (the Evolution API
// strips it in createJid), so it is put back to match the phone typed in the
// panel. Landlines (8 digits starting with 2 to 5) stay as they are.
export function phoneFromJid(jid: string): string | null {
  const match = PERSONAL_JID_PATTERN.exec(jid);
  if (!match) return null;
  const digits = match[1].replace(EIGHT_DIGIT_MOBILE_PATTERN, '$19$2');
  return PhoneNumber.isValid(digits) ? PhoneNumber.create(digits).value : null;
}
