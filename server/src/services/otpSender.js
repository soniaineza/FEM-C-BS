const { config } = require('../config');

/**
 * Delivers a verification code to a passenger.
 *
 * In production this MUST send the code through the configured SMS gateway.
 * It never falls back to returning the code in a response — devPayload() in
 * the routes only reveals codes when DEV_REVEAL_CODES=1.
 *
 * @param {{phone: string, email: string}} passenger
 * @param {{code: string, purpose: 'signup'|'reset'}} params
 */
async function sendOtp(passenger, { code, purpose }) {
  const purposeLabel = purpose === 'signup' ? 'verification' : 'password reset';
  const text = `${config.smsSenderName}: your ${config.otpLength}-digit ${purposeLabel} code is ${code}. It expires in ${Math.round(
    config.otpTtlSeconds / 60
  )} minutes. Do not share it with anyone.`;

  if (config.smsGatewayUrl) {
    try {
      // Generic JSON SMS gateway contract — adapt shape to your provider.
      const { default: fetch } = await import('node-fetch').catch(() => ({ default: global.fetch }));
      const gatewayFetch = typeof fetch === 'function' ? fetch : global.fetch;
      await gatewayFetch(config.smsGatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.smsGatewayApiKey}`,
        },
        body: JSON.stringify({
          to: passenger.phone,
          sender: config.smsSenderName,
          message: text,
        }),
      });
    } catch (err) {
      // Never crash the request on a delivery failure — but surface loudly so
      // operators notice a broken gateway.
      console.error('[otpSender] SMS delivery failed:', err.message);
    }
    return;
  }

  // Dev/demo: log the code server-side. It is still never exposed via API
  // unless DEV_REVEAL_CODES=1.
  console.log(`[otpSender] ${text}\n[otpSender] (delivered to ${passenger.phone})`);
}

module.exports = { sendOtp };