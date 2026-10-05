(function initializeJobBoardAdapters(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JobBoardAdapters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const ADAPTERS = [
    {
      id: "greenhouse",
      name: "Greenhouse",
      hosts: ["greenhouse.io"],
      markers: ["#application_form", ".application-form"],
      containers: [".field", ".input-wrapper", ".application-question"],
      labels: ["label", ".field-label"],
      titles: ["h1.app-title", ".job__title h1", "h1"],
      companies: [".company-name", ".company-name-link", '[data-testid="company-name"]'],
    },
    {
      id: "lever",
      name: "Lever",
      hosts: ["lever.co"],
      markers: [".application-form", ".posting-page"],
      containers: [".application-question", ".application-field", ".form-field"],
      labels: ["label", ".application-label", ".field-label"],
      titles: [".posting-headline h2", ".posting-header h1", "h1"],
      companies: [".posting-headline .company", ".main-header-logo img", '[data-testid="company-name"]'],
    },
    {
      id: "ashby",
      name: "Ashby",
      hosts: ["ashbyhq.com"],
      markers: ['[data-testid="application-form"]', 'form[data-testid*="application" i]'],
      containers: ['[data-testid*="field" i]', '[class*="field" i]'],
      labels: ["label", '[data-testid*="label" i]'],
      titles: ['[data-testid="job-title"]', "h1"],
      companies: ['[data-testid="company-name"]', '[class*="company" i]'],
    },
    {
      id: "workday",
      name: "Workday",
      hosts: ["myworkdayjobs.com", "workday.com", "workdayjobs.com"],
      markers: ['[data-automation-id="jobPostingPage"]', '[data-automation-id="applicationPage"]'],
      containers: ['[data-automation-id="formField"]', '[data-automation-id="questionItem"]'],
      labels: ['[data-automation-id="formLabel"]', "label", "legend"],
      titles: ['[data-automation-id="jobPostingHeader"]', '[data-automation-id="jobTitle"]', "h1"],
      companies: ['[data-automation-id="company"]', '[data-automation-id="companyName"]'],
    },
    {
      id: "smartrecruiters",
      name: "SmartRecruiters",
      hosts: ["smartrecruiters.com"],
      markers: ['[data-testid="application-form"]', ".application-form"],
      containers: [".form-group", ".application-field", '[data-testid*="field" i]'],
      labels: ["label", ".control-label", '[data-testid*="label" i]'],
      titles: [".job-title", '[data-testid="job-title"]', "h1"],
      companies: [".company", ".company-name", '[data-testid="company-name"]'],
    },
    {
      id: "icims",
      name: "iCIMS",
      hosts: ["icims.com"],
      markers: [".iCIMS_MainWrapper", "#iCIMS_MainWrapper"],
      containers: [".iCIMS_Field", ".field", ".form-group"],
      labels: [".iCIMS_Label", "label", "legend"],
      titles: [".iCIMS_Header", ".iCIMS_JobHeader h1", "h1"],
      companies: [".iCIMS_CompanyName", ".company-name"],
    },
    {
      id: "oracle",
      name: "Taleo / Oracle Recruiting",
      hosts: ["taleo.net", "oraclecloud.com"],
      markers: [".taleo-application", '[data-automation-id="candidate-experience"]'],
      containers: [".form-row", ".form-group", '[data-automation-id="formField"]'],
      labels: ["label", ".field-label", '[data-automation-id="formLabel"]', "legend"],
      titles: ['[data-automation-id="job-title"]', ".job-title", "h1"],
      companies: ['[data-automation-id="company-name"]', ".company-name"],
    },
  ];

  const GENERIC = {
    id: "generic",
    name: "Generic form",
    hosts: [],
    markers: [],
    containers: [".form-group", ".field", '[class*="field" i]'],
    labels: ["label", ".field-label", "legend"],
    titles: ["h1"],
    companies: ['[data-testid*="company" i]', '[class*="company-name" i]'],
  };

  function hostMatches(hostname, domain) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }

  function detect(locationLike, documentLike) {
    const hostname = String(locationLike?.hostname || "").toLowerCase();
    const byHost = ADAPTERS.find((adapter) => adapter.hosts.some((domain) => hostMatches(hostname, domain)));
    if (byHost) return byHost;
    if (!documentLike?.querySelector) return GENERIC;
    return ADAPTERS.find((adapter) => adapter.markers.some((selector) => documentLike.querySelector(selector))) || GENERIC;
  }

  function textValue(element) {
    if (!element) return "";
    if (element.tagName === "META") return String(element.content || "").trim();
    if (element.tagName === "IMG") return String(element.alt || element.title || "").trim();
    return String(element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function firstText(documentLike, selectors) {
    for (const selector of selectors) {
      const value = textValue(documentLike?.querySelector?.(selector));
      if (value) return value;
    }
    return "";
  }

  function nearestContainer(element, adapter) {
    for (const selector of [...adapter.containers, ...GENERIC.containers]) {
      const container = element.closest?.(selector);
      if (container) return container;
    }
    return element.parentElement || null;
  }

  function fieldLabel(element, locationLike, documentLike) {
    const adapter = detect(locationLike, documentLike);
    const container = nearestContainer(element, adapter);
    for (const selector of [...adapter.labels, ...GENERIC.labels]) {
      const label = container?.querySelector?.(selector);
      if (label && !label.contains(element)) {
        const value = textValue(label);
        if (value) return value;
      }
      if (label) {
        const clone = label.cloneNode(true);
        clone.querySelectorAll?.("input, select, textarea, button").forEach((control) => control.remove());
        const value = textValue(clone);
        if (value) return value;
      }
    }
    return "";
  }

  function fieldHints(element, locationLike, documentLike) {
    const label = fieldLabel(element, locationLike, documentLike);
    return [
      label,
      element.getAttribute?.("data-automation-id"),
      element.getAttribute?.("data-testid"),
      element.getAttribute?.("data-field-name"),
      element.getAttribute?.("data-qa"),
      element.getAttribute?.("itemprop"),
    ].filter(Boolean);
  }

  function pageContext(documentLike, locationLike) {
    const adapter = detect(locationLike, documentLike);
    const title = firstText(documentLike, adapter.titles)
      || firstText(documentLike, ['meta[property="og:title"]', 'meta[name="twitter:title"]']);
    const company = firstText(documentLike, adapter.companies)
      || firstText(documentLike, ['meta[property="og:site_name"]']);
    return { boardId: adapter.id, boardName: adapter.name, jobTitle: title, company };
  }

  return { ADAPTERS, GENERIC, detect, fieldHints, fieldLabel, pageContext };
});
