import { phoneFromJid } from './whatsapp-jid';

describe('phoneFromJid', () => {
  it.each([
    ['553188887777@s.whatsapp.net', '+5531988887777'],
    ['551162223333@s.whatsapp.net', '+5511962223333'],
    ['554177776666@s.whatsapp.net', '+5541977776666'],
    ['552199998888@s.whatsapp.net', '+5521999998888'],
    ['5511987654321@s.whatsapp.net', '+5511987654321'],
    ['551133334444@s.whatsapp.net', '+551133334444'],
    ['551152223333@s.whatsapp.net', '+551152223333'],
  ])('CA-14.1 (C2): converts %s into %s', (jid, phone) => {
    expect(phoneFromJid(jid)).toBe(phone);
  });

  it.each([
    '14155550123@s.whatsapp.net',
    '5511@s.whatsapp.net',
    '550187654321@s.whatsapp.net',
  ])('CA-14.1 (C2): does not convert %s', (jid) => {
    expect(phoneFromJid(jid)).toBeNull();
  });
});
