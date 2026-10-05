(() => {
  const SCRIPT_VERSION = "0.8.0";
  let passiveCaptureObserver = null;
  let passiveCaptureTimer = null;
  let passiveCaptureEmails = new Set();
  let passiveCaptureCount = 0;
  let passiveCaptureMessage = "Passive capture is off.";
  if (window.__localAutofillVersion === SCRIPT_VERSION) {
    return;
  }
  window.__localAutofillVersion = SCRIPT_VERSION;

  const FIELD_SELECTOR = "input, textarea, select, button[aria-haspopup='listbox'], button[role='combobox']";
  const fieldIdentities = new WeakMap();
  let nextFieldIdentity = 1;

  function identityFor(target) {
    if (!fieldIdentities.has(target)) fieldIdentities.set(target, nextFieldIdentity++);
    return fieldIdentities.get(target);
  }

  function boardAdapter() {
    return globalThis.JobBoardAdapters?.detect(window.location, document) || {
      id: "generic",
      name: "Generic form",
    };
  }

  const PROFILE_ALIASES = {
    full_name: ["full name", "legal name", "applicant name", "candidate name", "name"],
    first_name: ["first name", "given name", "forename"],
    middle_name: ["middle name", "middle initial"],
    last_name: ["last name", "family name", "surname"],
    preferred_name: ["preferred name", "chosen name", "nickname"],
    pronouns: ["pronouns", "preferred pronouns"],
    email: ["email", "email address", "e mail", "contact email"],
    phone: ["phone", "phone number", "mobile", "mobile number", "telephone"],
    address_line1: ["address line 1", "street address", "address", "street"],
    address_line2: ["address line 2", "apartment", "suite", "unit", "apt suite"],
    city: ["city", "town", "locality"],
    state: ["state", "province", "state province", "region"],
    postal_code: ["postal code", "zip code", "zip", "postcode"],
    country: ["country", "country region"],
    county: ["county", "district"],
    current_title: ["current title", "job title", "current job title", "position title"],
    current_company: ["current company", "current employer", "employer", "company"],
    years_experience: ["years of experience", "total experience", "professional experience"],
    bio: ["bio", "about me", "short introduction", "professional summary", "summary"],
    highest_degree: ["highest degree", "degree", "education level", "highest education"],
    school: ["school", "university", "college", "institution"],
    field_of_study: ["field of study", "major", "discipline"],
    graduation_year: ["graduation year", "year graduated", "completion year"],
    linkedin: ["linkedin", "linkedin profile", "linkedin url"],
    portfolio: ["portfolio", "portfolio website", "personal website", "website"],
    github: ["github", "github profile", "github url"],
    referral_source: ["how did you hear about us", "how did you hear about this job", "referral source", "source"],
    previously_worked_here: ["previously worked for this organization", "previous worker", "former employee"],
    phone_type: ["phone device type", "phone type", "device type"],
    phone_country_code: ["country phone code", "phone country code", "calling code"],
    phone_extension: ["phone extension", "extension"],
    authorized_to_work: [
      "authorized to work",
      "legally authorized to work",
      "work authorization",
      "eligible to work"
    ],
    requires_sponsorship: [
      "requires sponsorship",
      "require sponsorship",
      "need sponsorship",
      "employment sponsorship",
      "visa sponsorship"
    ],
    visa_status: ["visa status", "immigration status", "work authorization status"],
    work_mode: ["work mode", "work arrangement", "preferred work arrangement", "work preference"],
    employment_type: ["employment type", "job type", "work type"],
    available_start_date: ["available start date", "start date", "date available", "availability date"],
    notice_period: ["notice period", "required notice"],
    salary_expectation: ["salary expectation", "expected salary", "desired salary", "compensation expectation"],
    willing_to_relocate: ["willing to relocate", "relocation"],
    travel_willingness: ["travel willingness", "willing to travel", "travel percentage"],
    cover_letter: ["cover letter", "letter of interest"],
    gender: ["gender", "gender identity"],
    race_ethnicity: ["race ethnicity", "race", "ethnicity", "racial ethnic identity"],
    veteran_status: ["veteran status", "protected veteran", "veteran"],
    disability_status: ["disability status", "disability", "self identification of disability"]
  };

  const CHOICE_EQUIVALENTS = [
    ["yes", "true", "1", "y"],
    ["no", "false", "0", "n"],
    ["united states", "united states of america", "usa", "us", "u s"],
    ["united kingdom", "uk", "u k", "great britain"],
    ["on site", "onsite", "in office", "office"],
    ["prefer not to answer", "prefer not to say", "decline to self identify", "decline"]
  ];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalChoice(value) {
    const normalized = normalize(value);
    const group = CHOICE_EQUIVALENTS.find((values) => values.includes(normalized));
    return group ? group[0] : normalized;
  }

  function expandedProfile(profile) {
    const expanded = { ...(profile || {}) };
    const parts = String(expanded.full_name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      if (!expanded.first_name) expanded.first_name = parts[0];
      if (!expanded.last_name) expanded.last_name = parts[parts.length - 1];
      if (!expanded.middle_name && parts.length > 2) {
        expanded.middle_name = parts.slice(1, -1).join(" ");
      }
    }
    return expanded;
  }

  function referencedText(element, attribute) {
    const ids = (element.getAttribute(attribute) || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return ids
      .map((id) => document.getElementById(id)?.textContent.trim() || "")
      .filter(Boolean)
      .join(" ");
  }

  function legendText(element) {
    return element.closest("fieldset")?.querySelector("legend")?.textContent.trim() || "";
  }

  function ownLabelText(element) {
    return Array.from(element.labels || [])
      .map((label) => label.textContent.trim())
      .join(" ");
  }

  function fieldLabel(element) {
    return [
      legendText(element),
      ownLabelText(element),
      globalThis.JobBoardAdapters?.fieldLabel(element, window.location, document),
      element.getAttribute("aria-label"),
      referencedText(element, "aria-labelledby"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.id
    ].find((value) => String(value || "").trim()) || "Unlabelled field";
  }

  function fieldHints(element) {
    return [
      element.getAttribute("name"),
      element.id,
      element.getAttribute("autocomplete"),
      ownLabelText(element),
      legendText(element),
      element.getAttribute("aria-label"),
      referencedText(element, "aria-labelledby"),
      element.getAttribute("placeholder")
    ]
      .concat(globalThis.JobBoardAdapters?.fieldHints(element, window.location, document) || [])
      .map(normalize)
      .filter(Boolean);
  }

  function isFillable(element) {
    if (element.disabled || element.readOnly) {
      return false;
    }
    if (element.tagName === "BUTTON") {
      return element.getAttribute("aria-haspopup") === "listbox" || element.getAttribute("role") === "combobox";
    }
    if (element.tagName !== "INPUT") {
      return true;
    }
    return !["button", "file", "hidden", "image", "password", "reset", "submit"].includes(element.type);
  }

  function getFields() {
    return Array.from(document.querySelectorAll(FIELD_SELECTOR));
  }

  function fieldDetails(element, index) {
    return {
      fieldId: `field-${index}`,
      tag: element.tagName.toLowerCase(),
      id: element.id,
      name: element.getAttribute("name") || "",
      type: element.getAttribute("type") || (element.tagName === "INPUT" ? "text" : ""),
      label: fieldLabel(element),
      labels: ownLabelText(element),
      placeholder: element.getAttribute("placeholder") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      labelledbyText: referencedText(element, "aria-labelledby"),
      describedbyText: referencedText(element, "aria-describedby"),
      options: element.tagName === "SELECT"
        ? Array.from(element.options).map((option) => ({ text: option.textContent.trim(), value: option.value }))
        : []
    };
  }

  function fieldFingerprint(element) {
    return JSON.stringify({
      identity: identityFor(element),
      tag: element.tagName,
      type: element.getAttribute("type") || "",
      id: element.id,
      name: element.getAttribute("name") || "",
      label: fieldLabel(element),
      automationId: element.getAttribute("data-automation-id") || "",
      testId: element.getAttribute("data-testid") || "",
    });
  }

  function matchScore(element, profileKey) {
    const hints = fieldHints(element);
    const key = normalize(profileKey);
    const aliases = (PROFILE_ALIASES[profileKey] || []).map(normalize);
    if (hints.includes(key)) return { score: 100, reason: "Exact profile field" };
    if (aliases.some((alias) => hints.includes(alias))) return { score: 90, reason: "Recognized label" };
    const longerTerms = [key, ...aliases].filter((term) => term.length >= 5);
    if (hints.some((hint) => longerTerms.some((term) => hint.includes(term)))) {
      return { score: 70, reason: "Related field label" };
    }
    return null;
  }

  function choicesMatch(first, second) {
    return canonicalChoice(first) === canonicalChoice(second);
  }

  function resolvedValue(element, profileValue) {
    if (element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "listbox") {
      return String(profileValue);
    }

    if (element.tagName === "SELECT") {
      const option = Array.from(element.options).find(
        (candidate) => choicesMatch(candidate.value, profileValue) || choicesMatch(candidate.textContent, profileValue)
      );
      return option ? option.value : null;
    }

    if (element.type === "radio") {
      return choicesMatch(element.value, profileValue) || choicesMatch(ownLabelText(element), profileValue)
        ? element.value
        : null;
    }

    if (element.type === "checkbox") {
      return canonicalChoice(profileValue) === "yes" ? true : null;
    }

    return String(profileValue);
  }

  function hasExistingValue(element) {
    if (element.tagName === "BUTTON" && (
      element.getAttribute("aria-haspopup") === "listbox" || element.getAttribute("role") === "combobox"
    )) {
      const explicitValue = element.getAttribute("aria-valuetext") || element.dataset.value || "";
      if (String(explicitValue).trim()) return true;
      const buttonText = normalize(element.textContent);
      return Boolean(buttonText) && ![
        "choose", "choose an option", "select", "select one", "please select"
      ].includes(buttonText);
    }
    if (element.type === "radio") {
      if (!element.name) return element.checked;
      return getFields().some(
        (candidate) => candidate.type === "radio" && candidate.name === element.name && candidate.checked
      );
    }
    if (element.type === "checkbox") return element.checked;
    return String(element.value || "").trim() !== "";
  }

  function buildPreview(profile) {
    const matches = [];
    const matchedRadioGroups = new Set();
    getFields().forEach((element, index) => {
      if (!isFillable(element)) return;
      const radioGroup = element.type === "radio" && element.name
        ? `${identityFor(element.form || document)}:${element.name}`
        : null;
      if (radioGroup && matchedRadioGroups.has(radioGroup)) return;
      let bestMatch = null;

      for (const [profileKey, profileValue] of Object.entries(expandedProfile(profile))) {
        if (profileValue === null || profileValue === undefined || profileValue === "") continue;
        const match = matchScore(element, profileKey);
        if (!match || (bestMatch && bestMatch.score >= match.score)) continue;
        const value = resolvedValue(element, profileValue);
        if (value === null) continue;
        bestMatch = {
          fieldId: `field-${index}`,
          fingerprint: fieldFingerprint(element),
          profileKey,
          value,
          displayValue: String(profileValue),
          label: fieldLabel(element),
          score: match.score,
          reason: match.reason,
          hasExistingValue: hasExistingValue(element)
        };
      }

      if (bestMatch) {
        matches.push(bestMatch);
        if (radioGroup) matchedRadioGroups.add(radioGroup);
      }
    });
    return matches;
  }

  function nativeSet(element, property, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), property);
    if (descriptor?.set) descriptor.set.call(element, value);
    else element[property] = value;
  }

  function visibleOptions(element) {
    const controlledId = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
    const container = controlledId ? document.getElementById(controlledId) : document;
    if (!container) return [];
    return Array.from(container.querySelectorAll('[role="option"]')).filter(
      (option) => option.getClientRects().length > 0 && option.getAttribute("aria-disabled") !== "true"
    );
  }

  function findMatchingOption(element, value) {
    const wanted = normalize(value);
    return visibleOptions(element).find((option) => {
      const optionText = normalize(option.textContent);
      return choicesMatch(optionText, wanted) || (wanted.length >= 3 && optionText.includes(wanted));
    });
  }

  async function waitForMatchingOption(element, value, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const option = findMatchingOption(element, value);
      if (option) return option;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  function isSearchPicker(element) {
    return element.tagName === "INPUT" && (
      element.getAttribute("role") === "combobox" ||
      element.hasAttribute("aria-autocomplete") ||
      element.hasAttribute("aria-controls") ||
      element.hasAttribute("aria-owns")
    );
  }

  async function setElementValue(element, value) {
    if (element.tagName === "BUTTON" && (
      element.getAttribute("aria-haspopup") === "listbox" || element.getAttribute("role") === "combobox"
    )) {
      element.click();
      const option = await waitForMatchingOption(element, value);
      if (!option) {
        element.click();
        return false;
      }
      option.click();
      return true;
    }

    if (isSearchPicker(element)) {
      const previousValue = element.value;
      nativeSet(element, "value", value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      const option = await waitForMatchingOption(element, value);
      if (!option) {
        nativeSet(element, "value", previousValue);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return false;
      }
      option.click();
      return true;
    }

    const property = element.type === "radio" || element.type === "checkbox" ? "checked" : "value";
    const nextValue = property === "checked" ? true : value;
    nativeSet(element, property, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function fillApproved(profile, approvedMatches) {
    const approved = new Map(
      (approvedMatches || []).map((match) => [match.fieldId, match])
    );
    const currentMatches = buildPreview(profile);
    const fields = getFields();
    let filledCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const seenApprovals = new Set();

    for (const match of currentMatches) {
      const approval = approved.get(match.fieldId);
      if (!approval) continue;
      seenApprovals.add(match.fieldId);
      const index = Number(match.fieldId.replace("field-", ""));
      const element = fields[index];
      const unchanged = approval.profileKey === match.profileKey
        && approval.fingerprint === match.fingerprint
        && String(approval.value) === String(match.value);
      if (!element || !unchanged || match.hasExistingValue) {
        skippedCount += 1;
        continue;
      }
      if (await setElementValue(element, match.value)) filledCount += 1;
      else failedCount += 1;
    }

    skippedCount += Array.from(approved.keys()).filter(
      (fieldId) => !seenApprovals.has(fieldId)
    ).length;

    return { filledCount, skippedCount, failedCount };
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length > 0;
  }

  function emailMatches(value) {
    return String(value || "").match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || [];
  }

  function plausibleName(value, email) {
    const candidate = String(value || "")
      .replace(email, " ")
      .replace(/\b(email|contact|connect|message|copy)\b/gi, " ")
      .replace(/[^A-Za-z .'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 5 || candidate.length > 60) return "";
    if (words.some((word) => word.length > 24)) return "";
    return candidate;
  }

  function nearbyName(element, email) {
    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      const outreachName = String(current.innerText || "").match(/reach out to\s+(.+?)['’]s\s+work email/i)?.[1];
      if (outreachName) {
        const name = plausibleName(outreachName, email);
        if (name) return name;
      }
      const lines = String(current.innerText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const emailLine = lines.findIndex((line) => line.toLowerCase().includes(email.toLowerCase()));
      const candidates = emailLine >= 0
        ? [lines[emailLine].replace(email, ""), ...lines.slice(Math.max(0, emailLine - 3), emailLine).reverse()]
        : lines.slice(0, 3);
      for (const candidate of candidates) {
        const name = plausibleName(candidate, email);
        if (name) return name;
      }
      if (String(current.innerText || "").length > 700) break;
    }
    return "";
  }

  function visibleEmailContacts() {
    const contacts = new Map();
    const add = (emailValue, element) => {
      const email = String(emailValue || "").trim().toLowerCase();
      if (!email || contacts.has(email)) return;
      contacts.set(email, { email, name: nearbyName(element, email) });
    };

    document.querySelectorAll('a[href^="mailto:"]').forEach((anchor) => {
      if (!isVisible(anchor)) return;
      const address = anchor.getAttribute("href").slice(7).split(/[?,]/)[0];
      if (emailMatches(address).length) add(address, anchor);
    });

    document.querySelectorAll("input, textarea").forEach((field) => {
      if (!isVisible(field) || field.type === "hidden") return;
      emailMatches(field.value).forEach((email) => add(email, field));
    });

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && contacts.size < 30) {
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;
      emailMatches(node.nodeValue).forEach((email) => add(email, parent));
    }
    return Array.from(contacts.values()).slice(0, 30);
  }

  function jobrightContactCandidates(existingContacts) {
    if (!location.hostname.endsWith("jobright.ai")) return [];
    const knownNames = new Set(existingContacts.map((contact) => normalize(contact.name)));
    const mailButtons = Array.from(document.querySelectorAll(
      'button[aria-label*="mail" i], button[title*="mail" i], button[aria-label*="email" i], button[title*="email" i], button:has(img[alt*="mail" i]), button:has([aria-label*="mail" i])'
    )).filter(isVisible);

    return mailButtons.map((button) => {
      let current = button.parentElement;
      for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
        const lines = String(current.innerText || "")
          .split(/\n+/)
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const name = lines.find((line) => {
          const words = line.split(/\s+/);
          return words.length >= 2 && words.length <= 5 &&
            words.every((word) => /^[A-Z][A-Za-z.'-]*$/.test(word));
        });
        if (name && !knownNames.has(normalize(name))) {
          knownNames.add(normalize(name));
          return { email: "", name, needsReveal: true, source: "JobRight" };
        }
        if (String(current.innerText || "").length > 500) break;
      }
      return null;
    }).filter(Boolean);
  }

  function outreachContacts() {
    const visible = visibleEmailContacts();
    return [...visible, ...jobrightContactCandidates(visible)].slice(0, 30);
  }

  function firstVisibleText(selector, maxLength = 100) {
    return Array.from(document.querySelectorAll(selector))
      .filter(isVisible)
      .map((element) => String(element.textContent || "").replace(/\s+/g, " ").trim())
      .find((value) => value && value.length <= maxLength) || "";
  }

  function outreachPageContext() {
    const adapterContext = globalThis.JobBoardAdapters?.pageContext(document, window.location) || {};
    const heading = firstVisibleText("h1", 140);
    const labelledCompany = firstVisibleText(
      '[data-testid*="company" i], [aria-label*="company" i], [class*="company" i]',
      100,
    );
    const titleParts = document.title.split(/\s+[|\-–—]\s+/).map((part) => part.trim()).filter(Boolean);
    return {
      jobTitle: adapterContext.jobTitle || heading || titleParts[0] || "",
      company: adapterContext.company || labelledCompany || (titleParts.length > 1 ? titleParts[1] : ""),
      board: adapterContext.boardName || boardAdapter().name,
      pageTitle: document.title,
      url: location.href,
    };
  }

  function passiveCaptureStatus() {
    return {
      active: Boolean(passiveCaptureObserver),
      capturedCount: passiveCaptureCount,
      message: passiveCaptureMessage,
    };
  }

  function savePassiveContacts() {
    passiveCaptureTimer = null;
    const context = outreachPageContext();
    const contacts = visibleEmailContacts()
      .filter((contact) => !passiveCaptureEmails.has(contact.email))
      .map((contact) => ({
        ...contact,
        title: "",
        company: context.company,
        jobTitle: context.jobTitle,
        jobUrl: context.url,
        source: location.hostname,
      }));
    if (contacts.length === 0) return;
    contacts.forEach((contact) => passiveCaptureEmails.add(contact.email));
    passiveCaptureMessage = `Saving ${contacts.length} newly visible email(s)...`;
    if (!chrome.runtime?.id) {
      contacts.forEach((contact) => passiveCaptureEmails.delete(contact.email));
      passiveCaptureMessage = "Extension was reloaded. Refresh this page before restarting passive capture.";
      return;
    }
    chrome.runtime.sendMessage({ type: "SAVE_PASSIVE_CONTACTS", contacts }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        contacts.forEach((contact) => passiveCaptureEmails.delete(contact.email));
        passiveCaptureMessage = response?.error || chrome.runtime.lastError?.message || "Could not save visible emails.";
        return;
      }
      passiveCaptureCount += contacts.length;
      passiveCaptureMessage = `Saved ${passiveCaptureCount} visible email(s) from this page. Workbook now has ${response.result.total} unique contact(s).`;
    });
  }

  function schedulePassiveCapture() {
    if (passiveCaptureTimer) clearTimeout(passiveCaptureTimer);
    passiveCaptureTimer = setTimeout(savePassiveContacts, 400);
  }

  function startPassiveCapture() {
    if (!passiveCaptureObserver) {
      passiveCaptureEmails = new Set(visibleEmailContacts().map((contact) => contact.email));
      passiveCaptureObserver = new MutationObserver(schedulePassiveCapture);
      passiveCaptureObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href", "value", "class", "style", "aria-hidden"],
      });
    }
    passiveCaptureMessage = "Passive capture is active. Manually open permitted contact details; newly visible emails will be saved.";
    return passiveCaptureStatus();
  }

  function stopPassiveCapture() {
    passiveCaptureObserver?.disconnect();
    passiveCaptureObserver = null;
    if (passiveCaptureTimer) clearTimeout(passiveCaptureTimer);
    passiveCaptureTimer = null;
    passiveCaptureMessage = `Passive capture stopped after saving ${passiveCaptureCount} email(s) from this page.`;
    return passiveCaptureStatus();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_FIELDS") {
      const adapter = boardAdapter();
      sendResponse({ fields: getFields().map(fieldDetails), board: { id: adapter.id, name: adapter.name } });
      return;
    }
    if (message.type === "PREVIEW_PROFILE") {
      const adapter = boardAdapter();
      sendResponse({ matches: buildPreview(message.profile), board: { id: adapter.id, name: adapter.name } });
      return;
    }
    if (message.type === "FILL_APPROVED") {
      fillApproved(message.profile, message.approvedMatches)
        .then(sendResponse)
        .catch((error) => {
          console.error("Local Autofill fill failed:", error);
          sendResponse({ filledCount: 0, skippedCount: 0, failedCount: 1 });
        });
      return true;
    }
    if (message.type === "GET_OUTREACH_CONTEXT") {
      sendResponse({ contacts: outreachContacts(), context: outreachPageContext() });
      return;
    }
    if (message.type === "START_PASSIVE_CAPTURE") {
      sendResponse(startPassiveCapture());
      return;
    }
    if (message.type === "STOP_PASSIVE_CAPTURE") {
      sendResponse(stopPassiveCapture());
      return;
    }
    if (message.type === "GET_PASSIVE_CAPTURE_STATUS") {
      sendResponse(passiveCaptureStatus());
    }
  });
})();
