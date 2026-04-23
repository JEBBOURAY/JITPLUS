export function buildWhatsAppBroadcastMessage(options: {
  merchantName: string;
  clientName: string;
  body: string;
}): string {
  const { merchantName, clientName, body } = options;
  return `*Message de ${merchantName}*

Bonjour ${clientName},

${body}

_Vous recevez ce message car vous êtes client de ${merchantName} via JitPlus._`;
}
