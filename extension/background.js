const SERVER_URL = "http://localhost:8000";

async function saveVisibleContacts(contacts) {
  const response = await fetch(`${SERVER_URL}/outreach-contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contacts),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Local server returned HTTP ${response.status}: ${detail.slice(0, 180)}`);
  }
  return response.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SAVE_PASSIVE_CONTACTS") return;
  saveVisibleContacts(Array.isArray(message.contacts) ? message.contacts : [])
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
