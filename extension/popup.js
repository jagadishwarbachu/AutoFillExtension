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
const connectGmailButton = document.getElementById("connect-gmail");
const scanContactsButton = document.getElementById("scan-contacts");
const passiveCaptureButton = document.getElementById("passive-capture");
const outreachStatus = document.getElementById("outreach-status");
const oauthNote = document.getElementById("oauth-note");
const contactList = document.getElementById("contact-list");
const outreachEditor = document.getElementById("outreach-editor");
const jobTitleInput = document.getElementById("job-title");
const companyNameInput = document.getElementById("company-name");
const outreachSubjectInput = document.getElementById("outreach-subject");
const outreachBodyInput = document.getElementById("outreach-body");
const resumeInput = document.getElementById("resume-file");
const resumeName = document.getElementById("resume-name");
const previewOutreachButton = document.getElementById("preview-outreach");
const createDraftsButton = document.getElementById("create-drafts");
const outreachPreview = document.getElementById("outreach-preview");
const outreachPreviewText = document.getElementById("outreach-preview-text");

let previewProfile = null;
let previewMatches = [];
let outreachContacts = [];
let outreachContext = null;
let passiveCaptureActive = false;

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
    files: ["job-board-adapters.js", "content.js"]
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

function setOutreachBusy(isBusy) {
  connectGmailButton.disabled = isBusy;
  scanContactsButton.disabled = isBusy;
  passiveCaptureButton.disabled = isBusy;
  previewOutreachButton.disabled = isBusy;
  createDraftsButton.disabled = isBusy;
}

function oauthClientConfigured() {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id || "";
  return Boolean(clientId) && !clientId.includes("REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID");
}

function showOauthSetupIfNeeded() {
  if (oauthClientConfigured()) return;
  oauthNote.hidden = false;
  oauthNote.textContent = "Gmail setup required: add this extension's Google OAuth client ID to manifest.json, then reload the extension.";
}

async function gmailToken(interactive) {
  if (!oauthClientConfigured()) throw new Error("OAUTH_SETUP_REQUIRED");
  const result = await chrome.identity.getAuthToken({ interactive });
  const token = typeof result === "string" ? result : result?.token;
  if (!token) throw new Error("Gmail did not return an access token.");
  return token;
}

function selectedContacts() {
  return Array.from(contactList.querySelectorAll('input[type="checkbox"]:checked'))
    .map((checkbox) => outreachContacts[Number(checkbox.dataset.contactIndex)])
    .filter(Boolean);
}

function contactCounts() {
  const readyCount = outreachContacts.filter((contact) => OutreachUtils.validEmail(contact.email)).length;
  return { readyCount, hiddenCount: outreachContacts.length - readyCount };
}

function updateContactStatus() {
  const { readyCount, hiddenCount } = contactCounts();
  outreachEditor.hidden = readyCount === 0;
  if (readyCount === 0) {
    outreachStatus.textContent = `${hiddenCount} JobRight contact card(s) found, but their email addresses are still hidden. Reveal an address on JobRight or paste it beside the contact below.`;
    return;
  }
  outreachStatus.textContent = hiddenCount
    ? `${readyCount} email contact(s) ready; ${hiddenCount} contact(s) still need an email address.`
    : `${readyCount} unique contact(s) found. Select recipients and review the message.`;
}

function contactRow(contact, index) {
  const row = document.createElement("div");
  row.className = "contact";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const hasEmail = OutreachUtils.validEmail(contact.email);
  checkbox.checked = hasEmail && !contact.previouslyDrafted;
  checkbox.disabled = !hasEmail;
  checkbox.dataset.contactIndex = String(index);
  const content = document.createElement("span");
  const email = document.createElement("span");
  email.className = "contact-email";
  email.textContent = hasEmail ? contact.email : contact.name || "JobRight contact";
  const name = document.createElement("span");
  name.className = "contact-name";
  const detectedName = contact.name ? `Detected name: ${contact.name}` : "Name not detected; greeting will use ‘Hi there’.";
  name.textContent = !hasEmail
    ? "Email not revealed by JobRight. Use its contact-info flow, then rescan or paste the address here."
    : contact.previouslyDrafted
    ? `${detectedName} A draft was already created for this contact and job, so it is unchecked.`
    : detectedName;
  content.append(email, name);
  if (!hasEmail) {
    const manualEmail = document.createElement("input");
    manualEmail.className = "manual-email";
    manualEmail.type = "email";
    manualEmail.placeholder = "Paste email address";
    manualEmail.autocomplete = "off";
    manualEmail.setAttribute("aria-label", `Email address for ${contact.name || "JobRight contact"}`);
    manualEmail.addEventListener("input", () => {
      const value = manualEmail.value.trim();
      const valid = OutreachUtils.validEmail(value);
      contact.email = valid ? OutreachUtils.normalizeEmail(value) : "";
      contact.needsReveal = !valid;
      checkbox.disabled = !valid;
      checkbox.checked = valid;
      manualEmail.classList.toggle("invalid", value.length > 0 && !valid);
      name.textContent = valid
        ? `Email entered for ${contact.name || "this contact"}. Review it before creating a draft.`
        : "Email not revealed by JobRight. Use its contact-info flow, then rescan or paste the address here.";
      updateContactStatus();
    });
    content.append(manualEmail);
  }
  row.append(checkbox, content);
  return row;
}

async function senderName() {
  try {
    const profile = await fetchJson("/profile");
    return String(profile.full_name || profile.preferred_name || profile.first_name || "").trim();
  } catch (_error) {
    return "";
  }
}

async function outreachValues(contact) {
  return {
    first_name: OutreachUtils.firstName(contact),
    job_title: jobTitleInput.value.trim() || "open role",
    company: companyNameInput.value.trim() || "your company",
    sender_name: await senderName() || "Job candidate",
  };
}

async function renderedDraft(contact) {
  const values = await outreachValues(contact);
  return {
    subject: OutreachUtils.applyTemplate(outreachSubjectInput.value, values).trim(),
    body: OutreachUtils.applyTemplate(outreachBodyInput.value, values).trim(),
  };
}

async function readResume() {
  const file = resumeInput.files?.[0];
  if (!file) throw new Error("Choose the résumé file you want to attach.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose a résumé smaller than 8 MB.");
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

async function createGmailDraft(token, raw) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });
  if (response.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token });
    throw new Error("Gmail authorization expired. Connect Gmail again.");
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail returned HTTP ${response.status}: ${detail.slice(0, 180)}`);
  }
  return response.json();
}

async function saveOutreachHistory(entries) {
  const stored = await chrome.storage.local.get("outreachDraftHistory");
  const history = Array.isArray(stored.outreachDraftHistory) ? stored.outreachDraftHistory : [];
  const combined = [...entries, ...history].slice(0, 100);
  await chrome.storage.local.set({ outreachDraftHistory: combined });
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
    const adapterNote = result.board?.id && result.board.id !== "generic"
      ? ` ${result.board.name} compatibility active.`
      : "";
    status.textContent = `${selectableCount} field(s) ready. Review and select what to fill.${adapterNote}`;
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
    .map(({ fieldId, profileKey, fingerprint, value }) => ({
      fieldId,
      profileKey,
      fingerprint,
      value,
    }));
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
    fieldResults.textContent = JSON.stringify({ board: response.board, fields: response.fields }, null, 2);
  } catch (error) {
    fieldResults.textContent = "Could not inspect the current page.";
    console.error("Field inspection failed:", error);
  } finally {
    setBusy(false);
  }
});

connectGmailButton.addEventListener("click", async () => {
  setOutreachBusy(true);
  outreachStatus.textContent = "Connecting to Gmail...";
  try {
    await gmailToken(true);
    outreachStatus.className = "success";
    outreachStatus.textContent = "Gmail connected. Drafts will be created only when you approve them.";
    connectGmailButton.textContent = "Gmail connected";
  } catch (error) {
    outreachStatus.className = "warning";
    outreachStatus.textContent = error.message === "OAUTH_SETUP_REQUIRED"
      ? "Finish the Google OAuth setup in manifest.json before connecting Gmail."
      : `Could not connect Gmail: ${error.message}`;
    console.error("Gmail connection failed:", error);
  } finally {
    setOutreachBusy(false);
  }
});

scanContactsButton.addEventListener("click", async () => {
  setOutreachBusy(true);
  contactList.replaceChildren();
  outreachEditor.hidden = true;
  outreachPreview.hidden = true;
  outreachStatus.className = "";
  outreachStatus.textContent = "Scanning emails currently visible on this page...";
  try {
    const tab = await activeTab();
    await connectToTab(tab);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "GET_OUTREACH_CONTEXT" });
    if (!Array.isArray(result?.contacts)) throw new Error("Unexpected contact scan response.");
    outreachContext = { ...result.context, url: tab.url || result.context?.url || "" };
    const stored = await chrome.storage.local.get("outreachDraftHistory");
    const history = Array.isArray(stored.outreachDraftHistory) ? stored.outreachDraftHistory : [];
    outreachContacts = result.contacts
      .filter((contact) => OutreachUtils.validEmail(contact.email) || (contact.needsReveal && contact.name))
      .map((contact) => ({
        ...contact,
        previouslyDrafted: OutreachUtils.validEmail(contact.email) && history.some((entry) => (
          OutreachUtils.normalizeEmail(entry.email) === OutreachUtils.normalizeEmail(contact.email) &&
          entry.jobUrl === outreachContext.url
        )),
      }));
    contactList.replaceChildren(...outreachContacts.map(contactRow));
    jobTitleInput.value = outreachContext.jobTitle || "";
    companyNameInput.value = outreachContext.company || "";
    if (outreachContacts.length === 0) {
      outreachStatus.textContent = "No visible email addresses found. Open the connection details on the page, then scan again.";
      return;
    }
    updateContactStatus();
  } catch (error) {
    outreachStatus.className = "warning";
    outreachStatus.textContent = friendlyPreviewError(error);
    console.error("Contact scan failed:", error);
  } finally {
    setOutreachBusy(false);
  }
});

passiveCaptureButton.addEventListener("click", async () => {
  setOutreachBusy(true);
  outreachStatus.className = "";
  outreachStatus.textContent = passiveCaptureActive ? "Stopping passive capture..." : "Starting passive capture on this page...";
  try {
    const tab = await activeTab();
    await connectToTab(tab);
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: passiveCaptureActive ? "STOP_PASSIVE_CAPTURE" : "START_PASSIVE_CAPTURE",
    });
    passiveCaptureActive = Boolean(result?.active);
    passiveCaptureButton.textContent = passiveCaptureActive ? "Stop passive email capture" : "Start passive email capture";
    outreachStatus.className = passiveCaptureActive ? "success" : "";
    outreachStatus.textContent = result?.message || "Passive capture status changed.";
  } catch (error) {
    outreachStatus.className = "warning";
    outreachStatus.textContent = friendlyPreviewError(error);
    console.error("Passive capture failed:", error);
  } finally {
    setOutreachBusy(false);
  }
});

async function refreshPassiveCaptureStatus() {
  try {
    const tab = await activeTab();
    await connectToTab(tab);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "GET_PASSIVE_CAPTURE_STATUS" });
    passiveCaptureActive = Boolean(result?.active);
    passiveCaptureButton.textContent = passiveCaptureActive ? "Stop passive email capture" : "Start passive email capture";
    if (passiveCaptureActive && result?.message) {
      outreachStatus.className = "success";
      outreachStatus.textContent = result.message;
    }
  } catch (_error) {
    passiveCaptureActive = false;
  }
}

resumeInput.addEventListener("change", () => {
  const file = resumeInput.files?.[0];
  resumeName.textContent = file
    ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`
    : "No résumé selected. The file stays local until you create drafts.";
});

previewOutreachButton.addEventListener("click", async () => {
  const contact = selectedContacts()[0];
  if (!contact) {
    outreachStatus.textContent = "Select at least one contact to preview.";
    return;
  }
  const draft = await renderedDraft(contact);
  outreachPreviewText.textContent = `To: ${contact.email}\nSubject: ${draft.subject}\n\n${draft.body}`;
  outreachPreview.hidden = false;
  outreachPreview.open = true;
});

createDraftsButton.addEventListener("click", async () => {
  const contacts = selectedContacts();
  if (contacts.length === 0) {
    outreachStatus.textContent = "Select at least one contact first.";
    return;
  }
  if (contacts.length > 5) {
    outreachStatus.className = "warning";
    outreachStatus.textContent = "Create at most five drafts at a time so each message can be reviewed carefully.";
    return;
  }

  setOutreachBusy(true);
  outreachStatus.className = "";
  outreachStatus.textContent = `Preparing ${contacts.length} Gmail draft(s)...`;
  try {
    const [token, attachment] = await Promise.all([gmailToken(false), readResume()]);
    const created = [];
    for (const contact of contacts) {
      const draft = await renderedDraft(contact);
      if (!draft.subject || !draft.body) throw new Error("Subject and message cannot be empty.");
      const raw = OutreachUtils.buildMimeMessage({
        to: contact.email,
        subject: draft.subject,
        body: draft.body,
        attachment,
      });
      const result = await createGmailDraft(token, raw);
      created.push({
        draftId: result.id,
        email: contact.email,
        jobUrl: outreachContext?.url || "",
        createdAt: new Date().toISOString(),
      });
    }
    await saveOutreachHistory(created);
    outreachStatus.className = "success";
    outreachStatus.textContent = `Created ${created.length} Gmail draft(s). Open Gmail Drafts, review every message, and send manually.`;
  } catch (error) {
    outreachStatus.className = "warning";
    outreachStatus.textContent = error.message === "OAUTH_SETUP_REQUIRED"
      ? "Configure and connect Gmail before creating drafts."
      : error.message;
    console.error("Draft creation failed:", error);
  } finally {
    setOutreachBusy(false);
  }
});

showOauthSetupIfNeeded();
refreshPassiveCaptureStatus();
