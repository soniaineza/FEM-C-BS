// The deadline covers headers AND body parsing. Some fetch implementations
// resolve on headers and can otherwise leave a stalled body pending forever.
export async function fetchResponse(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('Request timed out');
      error.name = 'AbortError';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      let json: any = {};
      if (text) {
        try { json = JSON.parse(text); }
        catch { if (res.ok) throw new Error('Invalid response JSON'); }
      }
      if (res.ok && res.status !== 204 && (!text || json == null || typeof json !== 'object')) {
        throw new Error('Invalid response body');
      }
      return { res, json };
    })()]);
  } finally { clearTimeout(timer!); }
}
