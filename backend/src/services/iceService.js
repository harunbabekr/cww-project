// خوادم STUN/TURN. STUN وحده لا يكفي خلف بعض الشبكات (4G / NAT صارم) فتحتاج TURN.
export const turnConfigured = () => !!(process.env.TURN_URLS || (process.env.METERED_APP && process.env.METERED_API_KEY));

export async function getIceServers() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

  if (process.env.METERED_APP && process.env.METERED_API_KEY) {
    try {
      const res = await fetch(`https://${process.env.METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}`);
      if (res.ok) return [...servers, ...(await res.json())];
    } catch { /* نكمل بما لدينا */ }
  }
  if (process.env.TURN_URLS) {
    servers.push({
      urls: process.env.TURN_URLS.split(',').map((s) => s.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}
