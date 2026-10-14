const express = require('express');
const path = require('path');
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/api/reference-text', (req, res) => {
  const text = String(req.body?.reference_text || '').trim();
  if (text.length < 3 || text.length > 300) {
    return res.status(400).json({ error: 'Enter a non-secret application reference between 3 and 300 characters.' });
  }
  if (/\b(OTP|one[- ]time password|PIN|password|passcode|verification code|security code)\b/i.test(text) || /^\d{4,8}$/.test(text)) {
    return res.status(400).json({ error: 'Do not submit SMS codes, OTPs, PINs, passwords, or account security codes.' });
  }
  // Demo only: acknowledge non-secret reference text without storing or forwarding it.
  return res.json({ ok: true, message: 'Non-secret reference text received for this demo.' });
});
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Application timer demo listening on ${port}`));