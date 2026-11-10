// Express route: tabiiy o'zbek ovozi (Azure Speech). Mavjud /api/taxi routeringiz yoniga qo'shing.
// Kerak: Node 18+, muhit o'zgaruvchilari AZURE_SPEECH_KEY va AZURE_SPEECH_REGION (masalan "westeurope").
// Azure bepul tarifi oyiga ~500 000 belgi beradi. Ovoz: uz-UZ-SardorNeural (erkak) yoki uz-UZ-MadinaNeural (ayol).
const VOICE = 'uz-UZ-SardorNeural';
const cache = new Map();

module.exports = function addTts(router, requireAuth) {
  // requireAuth: sizdagi haydovchi tokenini tekshiradigan middleware (bo'lmasa (req,res,next)=>next() bering)
  router.post('/tts', requireAuth, async (req, res) => {
    try {
      const text = String((req.body && req.body.text) || '').trim().slice(0, 300);
      if (!text) return res.status(400).json({ error: 'text kerak' });
      let buf = cache.get(text);
      if (!buf) {
        const esc = text.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
        const ssml = `<speak version="1.0" xml:lang="uz-UZ"><voice name="${VOICE}"><prosody rate="-5%">${esc}</prosody></voice></speak>`;
        const r = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'savdouz-taxi'
          },
          body: ssml
        });
        if (!r.ok) return res.status(502).json({ error: 'TTS xato ' + r.status });
        buf = Buffer.from(await r.arrayBuffer());
        if (cache.size > 500) cache.clear();
        cache.set(text, buf);
      }
      res.set('Content-Type', 'audio/mpeg').send(buf);
    } catch (e) { res.status(500).json({ error: 'TTS xato' }); }
  });
};
// Ulash: require('./tts-route')(taxiRouter, authMiddleware);
