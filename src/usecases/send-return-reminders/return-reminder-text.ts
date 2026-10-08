// US-25: the copy of the return reminder (plan Assumptions). Every message the
// client did not ask for says how to stop it (PRD section 15).
export function returnReminderQuestionText(
  barbershopName: string,
  days: number,
): string {
  return `Obrigado pela visita à ${barbershopName}! Quer que eu te avise quando estiver na hora de voltar? Responda "sim" e eu te mando um lembrete daqui a ${days} dias. Se não quiser, é só ignorar.`;
}

export function returnReminderEnabledText(days: number): string {
  return `Combinado! Vou te lembrar de voltar ${days} dias depois do seu último atendimento. Para parar, é só responder "parar lembretes".`;
}

export const RETURN_REMINDER_DISABLED_TEXT =
  'Pronto, você não vai mais receber lembretes de retorno. Se mudar de ideia, é só responder "quero lembrete".';

export function returnReminderInviteText(
  clientName: string,
  days: number,
  barbershopName: string,
): string {
  const firstName = clientName.trim().split(/\s+/)[0];
  return `Oi, ${firstName}! Já faz ${days} dias do seu último atendimento na ${barbershopName}. Que tal agendar o próximo? É só me dizer o dia e o horário. Para não receber mais este lembrete, responda "parar lembretes".`;
}
