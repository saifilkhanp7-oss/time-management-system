// Sends an SMS through Twilio's REST API when credentials are configured.
// Without credentials (local development) the message is printed to the console.

export async function sendSms(to, body) {
  const {
    TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token,
    TWILIO_FROM: from, TWILIO_MESSAGING_SERVICE_SID: serviceSid,
  } = process.env;

  if (!sid || !token || !(from || serviceSid)) {
    console.log(`\n[DEV OTP] SMS to ${to}: ${body}\n`);
    // Show the code on screen in local development, or when OTP_DEMO_MODE=true (for a public demo without SMS).
    return { dev: process.env.NODE_ENV !== 'production' || process.env.OTP_DEMO_MODE === 'true' };
  }

  const params = new URLSearchParams({ To: to, Body: body });
  if (serviceSid) params.set('MessagingServiceSid', serviceSid);
  else params.set('From', from);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Twilio error ${res.status}`);
  }
  return { dev: false };
}
