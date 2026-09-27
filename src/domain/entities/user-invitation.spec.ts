import { UserInvitation } from './user-invitation';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const SEVEN_DAYS_MS = 604_800_000;

function issue(): UserInvitation {
  return UserInvitation.issue({
    id: 'invitation-1',
    barbershopId: 'barbershop-1',
    email: 'joao@exemplo.com',
    name: 'João Pereira',
    tokenHash: 'hash',
    now: NOW,
  });
}

describe('UserInvitation', () => {
  it('CA-02.1: expires 7 days after it is issued and is acceptable only before that, while pending (C2)', () => {
    const invitation = issue();

    expect(invitation.expiresAt.getTime()).toBe(NOW.getTime() + SEVEN_DAYS_MS);
    expect(invitation.acceptedAt).toBeNull();
    expect(
      invitation.isAcceptable(new Date(invitation.expiresAt.getTime() - 1)),
    ).toBe(true);
    expect(invitation.isAcceptable(invitation.expiresAt)).toBe(false);
    expect(
      invitation.isAcceptable(new Date(invitation.expiresAt.getTime() + 1)),
    ).toBe(false);

    const accepted = UserInvitation.restore({
      id: invitation.id,
      barbershopId: invitation.barbershopId,
      email: invitation.email,
      name: invitation.name,
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt,
      acceptedAt: NOW,
      createdAt: invitation.createdAt,
    });
    expect(accepted.isAcceptable(NOW)).toBe(false);
  });
});
