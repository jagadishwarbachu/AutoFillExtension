const SERVER_URL = "http://localhost:8000";

const checkButton = document.getElementById("check-server");
const previewButton = document.getElementById("preview-profile");
const fillButton = document.getElementById("fill-approved");
const cancelButton = document.getElementById("cancel-preview");
const inspectButton = document.getElementById("inspect-fields");
const status = document.getElementById("status");
const previewList = document.getElementById("preview-list");
const approvalActions = document.getElementById("approval-actions");
const fieldResults = document.getElementById("field-results");

let previewProfile = null;
let previewMatches = [];

async function fetchJson(path) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  return response.json();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  return tab;
}

async function connectToTab(tab) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("EXTENSION_RELOAD_REQUIRED");
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
}

function friendlyPreviewError(error) {
  const message = String(error?.message || error);
  if (message.includes("EXTENSION_RELOAD_REQUIRED")) {
    return "Reload Local Autofill on chrome://extensions, then refresh this page.";
  }
  if (message.includes("Failed to fetch") || message.includes("Server returned")) {
    return "Could not load your local profile. Start the FastAPI server and try again.";
  }
  if (message.includes("Cannot access") || message.includes("extensions gallery")) {
    return "Chrome does not allow extensions on this protected page.";
  }
  if (message.includes("Receiving end does not exist")) {
    return "The page changed while connecting. Refresh it and try again.";
  }
  return "Could not connect to this page. Reload the extension and refresh the page.";
}

function setBusy(isBusy) {
  checkButton.disabled = isBusy;
  previewButton.disabled = isBusy;
  inspectButton.disabled = isBusy;
  fillButton.disabled = isBusy;
}

function clearPreview() {
  previewProfile = null;
  previewMatches = [];
  previewList.replaceChildren();
  approvalActions.hidden = true;
}

function matchRow(match) {
  const row = document.createElement("label");
  row.className = "match";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.fieldId = match.fieldId;
  checkbox.checked = !match.hasExistingValue;
  checkbox.disabled = match.hasExistingValue;
  const content = document.createElement("span");
  const label = document.createElement("span");
  label.className = "match-label";
  label.textContent = match.label;
  const value = document.createElement("span");
  value.className = "match-value";
  value.textContent = match.displayValue ?? match.value;
  const meta = document.createElement("span");
  meta.className = match.hasExistingValue ? "match-meta warning" : "match-meta";
  meta.textContent = match.hasExistingValue
    ? "Already contains a value — skipped"
    : `${match.profileKey} · ${match.reason}`;
  content.append(label, value, meta);
  row.append(checkbox, content);
  return row;
}

checkButton.addEventListener("click", async () => {
  setBusy(true);
  status.textContent = "Checking server...";
  try {
    const data = await fetchJson("/health");
    if (data.status !== "ok") throw new Error("Unexpected health response.");
    status.textContent = "Connected. The local server is healthy.";
  } catch (error) {
    status.textContent = "Could not connect. Start the FastAPI server and try again.";
    console.error("Health check failed:", error);
  } finally {
    setBusy(false);
  }
});

previewButton.addEventListener("click", async () => {
  setBusy(true);
  clearPreview();
  status.textContent = "Finding safe matches...";
  try {
    const profile = await fetchJson("/profile");
    const tab = await activeTab();
    await connectToTab(tab);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "PREVIEW_PROFILE", profile });
    if (!Array.isArray(result?.matches)) throw new Error("Unexpected preview response.");
    previewProfile = profile;
    previewMatches = result.matches;
    previewList.replaceChildren(...previewMatches.map(matchRow));
    const selectableCount = previewMatches.filter((match) => !match.hasExistingValue).length;
    if (previewMatches.length === 0) {
      status.textContent = "No confident matches found. Add the matching details in Edit local profile, then preview again.";
      return;
    }
    status.textContent = `${selectableCount} field(s) ready. Review and select what to fill.`;
    approvalActions.hidden = false;
    fillButton.disabled = selectableCount === 0;
  } catch (error) {
    status.textContent = friendlyPreviewError(error);
    console.error("Preview failed:", error);
  } finally {
    checkButton.disabled = false;
    previewButton.disabled = false;
    inspectButton.disabled = false;
  }
});

fillButton.addEventListener("click", async () => {
  const selectedIds = new Set(
    Array.from(previewList.querySelectorAll('input[type="checkbox"]:checked'))
      .map((checkbox) => checkbox.dataset.fieldId)
  );
  const approvedMatches = previewMatches
    .filter((match) => selectedIds.has(match.fieldId))
    .map(({ fieldId, profileKey }) => ({ fieldId, profileKey }));
  if (approvedMatches.length === 0) {
    status.textContent = "Select at least one proposed field first.";
    return;
  }
  setBusy(true);
  status.textContent = "Filling approved fields...";
  try {
    const tab = await activeTab();
    await connectToTab(tab);
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "FILL_APPROVED",
      profile: previewProfile,
      approvedMatches
    });
    if (typeof result?.filledCount !== "number") throw new Error("Unexpected fill response.");
    const notes = [];
    if (result.skippedCount) notes.push(`${result.skippedCount} changed field(s) skipped.`);
    if (result.failedCount) notes.push(`${result.failedCount} custom selection(s) need manual entry.`);
    status.textContent = `Filled ${result.filledCount} approved field(s). ${notes.join(" ")}`.trim();
    clearPreview();
  } catch (error) {
    status.textContent = "Could not fill the selected fields. Refresh the form and preview again.";
    console.error("Approved fill failed:", error);
  } finally {
    setBusy(false);
  }
});

cancelButton.addEventListener("click", () => {
  clearPreview();
  status.textContent = "Preview cancelled. No fields were changed.";
});

inspectButton.addEventListener("click", async () => {
  setBusy(true);
  fieldResults.textContent = "Inspecting...";
  try {
    const tab = await activeTab();
    await connectToTab(tab);
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_FIELDS" });
    if (!Array.isArray(response?.fields)) throw new Error("Unexpected field response.");
    fieldResults.textContent = JSON.stringify(response.fields, null, 2);
  } catch (error) {
    fieldResults.textContent = "Could not inspect the current page.";
    console.error("Field inspection failed:", error);
  } finally {
    setBusy(false);
  }
});
