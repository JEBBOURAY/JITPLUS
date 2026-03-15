// ── SMS / WhatsApp Provider Interface ────────────────────────────────────────
// Abstract away the SMS/WhatsApp backend (Twilio, Vonage, MessageBird, etc.).

export interface ISmsProvider {
  /**
   * Send an OTP code via WhatsApp (or SMS fallback).
   * @returns true if the message was accepted by the provider, false otherwise.
   */
  sendWhatsAppOtp(to: string, code: string): Promise<boolean>;

  /**
   * Send a plain-text WhatsApp message (marketing / promo).
   * @returns true if the message was accepted by the provider, false otherwise.
   */
  sendWhatsAppMessage(to: string, body: string): Promise<boolean>;
}
