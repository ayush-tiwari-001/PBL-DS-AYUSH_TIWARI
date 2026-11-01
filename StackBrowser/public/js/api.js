// Client for the local server, which forwards every history operation to the C++ engine.
const HEADERS = { 'content-type': 'application/json', 'x-stackbrowser': '1' };

async function call(method, path, body) {
  try {
    const res = await fetch('/api' + path, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok && data.ok === undefined) data.ok = false;
    return data;
  } catch (e) {
    return { ok: false, message: 'Could not reach the StackBrowser server. Is it still running?', offline: true };
  }
}

export const api = {
  newTab: () => call('POST', '/tabs'),
  closeTab: (id) => call('DELETE', `/tabs/${id}`),
  navigate: (id, url) => call('POST', `/tabs/${id}/navigate`, { url }),
  back: (id) => call('POST', `/tabs/${id}/back`),
  forward: (id) => call('POST', `/tabs/${id}/forward`),
  reset: (id) => call('POST', `/tabs/${id}/reset`),
  state: (id) => call('GET', `/tabs/${id}/state`),
};
