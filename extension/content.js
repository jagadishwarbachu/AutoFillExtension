(() => {
  const SCRIPT_VERSION = "0.4.0";
  if (window.__localAutofillVersion === SCRIPT_VERSION) {
    return;
  }
  window.__localAutofillVersion = SCRIPT_VERSION;

  const FIELD_SELECTOR = "input, textarea, select, button[aria-haspopup='listbox']";

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
    ].map(normalize).filter(Boolean);
  }

  function isFillable(element) {
    if (element.disabled || element.readOnly) {
      return false;
    }
    if (element.tagName === "BUTTON") {
      return element.getAttribute("aria-haspopup") === "listbox";
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
    if (element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "listbox") {
      return false;
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
    getFields().forEach((element, index) => {
      if (!isFillable(element)) return;
      let bestMatch = null;

      for (const [profileKey, profileValue] of Object.entries(expandedProfile(profile))) {
        if (profileValue === null || profileValue === undefined || profileValue === "") continue;
        const match = matchScore(element, profileKey);
        if (!match || (bestMatch && bestMatch.score >= match.score)) continue;
        const value = resolvedValue(element, profileValue);
        if (value === null) continue;
        bestMatch = {
          fieldId: `field-${index}`,
          profileKey,
          value,
          displayValue: String(profileValue),
          label: fieldLabel(element),
          score: match.score,
          reason: match.reason,
          hasExistingValue: hasExistingValue(element)
        };
      }

      if (bestMatch) matches.push(bestMatch);
    });
    return matches;
  }

  function nativeSet(element, property, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), property);
    if (descriptor?.set) descriptor.set.call(element, value);
    else element[property] = value;
  }

  function visibleOptions() {
    return Array.from(document.querySelectorAll('[role="option"]')).filter(
      (option) => option.getClientRects().length > 0 && option.getAttribute("aria-disabled") !== "true"
    );
  }

  function findMatchingOption(value) {
    const wanted = normalize(value);
    return visibleOptions().find((option) => {
      const optionText = normalize(option.textContent);
      return choicesMatch(optionText, wanted) || (wanted.length >= 3 && optionText.includes(wanted));
    });
  }

  async function waitForMatchingOption(value, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const option = findMatchingOption(value);
      if (option) return option;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  function isSearchPicker(element) {
    return element.tagName === "INPUT" && (
      normalize(element.getAttribute("placeholder")) === "search" ||
      element.getAttribute("role") === "combobox" ||
      element.hasAttribute("aria-autocomplete")
    );
  }

  async function setElementValue(element, value) {
    if (element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "listbox") {
      element.click();
      const option = await waitForMatchingOption(value);
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
      const option = await waitForMatchingOption(value);
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
      (approvedMatches || []).map((match) => [match.fieldId, match.profileKey])
    );
    const currentMatches = buildPreview(profile);
    const fields = getFields();
    let filledCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const match of currentMatches) {
      if (approved.get(match.fieldId) !== match.profileKey) continue;
      const index = Number(match.fieldId.replace("field-", ""));
      const element = fields[index];
      if (!element || match.hasExistingValue) {
        skippedCount += 1;
        continue;
      }
      if (await setElementValue(element, match.value)) filledCount += 1;
      else failedCount += 1;
    }

    return { filledCount, skippedCount, failedCount };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_FIELDS") {
      sendResponse({ fields: getFields().map(fieldDetails) });
      return;
    }
    if (message.type === "PREVIEW_PROFILE") {
      sendResponse({ matches: buildPreview(message.profile) });
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
  });
})();
