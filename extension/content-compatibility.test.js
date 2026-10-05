const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const adapterScript = fs.readFileSync(path.join(__dirname, "job-board-adapters.js"), "utf8");
const contentScript = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");

function fixture(url, body) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
    runScripts: "outside-only",
    url,
  });
  let listener;
  dom.window.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: {
        addListener(callback) {
          listener = callback;
        },
      },
      sendMessage() {},
    },
  };
  dom.window.HTMLElement.prototype.getClientRects = function getClientRects() {
    return this.isConnected ? [{}] : [];
  };
  dom.window.eval(adapterScript);
  dom.window.eval(contentScript);
  return {
    document: dom.window.document,
    async send(message) {
      return new Promise((resolve) => listener(message, {}, resolve));
    },
  };
}

function approvals(matches) {
  return matches.map(({ fieldId, profileKey, fingerprint, value }) => ({
    fieldId,
    profileKey,
    fingerprint,
    value,
  }));
}

const boards = [
  {
    name: "Greenhouse",
    url: "https://boards.greenhouse.io/acme/jobs/1",
    body: '<div class="field"><label>First Name<input data-field-name="candidate"></label></div>',
    profile: { first_name: "Alex" },
    selector: "input",
    expected: "Alex",
  },
  {
    name: "Lever",
    url: "https://jobs.lever.co/acme/1",
    body: '<div class="application-question"><label>LinkedIn profile</label><input data-qa="answer"></div>',
    profile: { linkedin: "https://linkedin.com/in/example" },
    selector: "input",
    expected: "https://linkedin.com/in/example",
  },
  {
    name: "Ashby",
    url: "https://jobs.ashbyhq.com/acme/1",
    body: '<div data-testid="candidate-field"><label>Email address</label><input data-testid="answer"></div>',
    profile: { email: "person@example.com" },
    selector: "input",
    expected: "person@example.com",
  },
  {
    name: "Workday",
    url: "https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/1",
    body: '<div data-automation-id="formField"><div data-automation-id="formLabel">Phone number</div><input data-automation-id="answer"></div>',
    profile: { phone: "555-0100" },
    selector: "input",
    expected: "555-0100",
  },
  {
    name: "SmartRecruiters",
    url: "https://jobs.smartrecruiters.com/Acme/1",
    body: '<div class="form-group"><label>Portfolio website</label><input data-testid="answer"></div>',
    profile: { portfolio: "https://example.com" },
    selector: "input",
    expected: "https://example.com",
  },
  {
    name: "iCIMS",
    url: "https://careers-acme.icims.com/jobs/1",
    body: '<div class="iCIMS_Field"><span class="iCIMS_Label">Postal code</span><input></div>',
    profile: { postal_code: "10001" },
    selector: "input",
    expected: "10001",
  },
  {
    name: "Taleo / Oracle Recruiting",
    url: "https://acme.taleo.net/careersection/apply",
    body: '<div class="form-row"><span class="field-label">Work authorization</span><select><option value=""></option><option value="yes">Yes</option><option value="no">No</option></select></div>',
    profile: { authorized_to_work: "Yes" },
    selector: "select",
    expected: "yes",
  },
];

for (const board of boards) {
  test(`${board.name} fixture previews and fills its adapted field`, async () => {
    const page = fixture(board.url, board.body);
    const preview = await page.send({ type: "PREVIEW_PROFILE", profile: board.profile });

    assert.equal(preview.board.name, board.name);
    assert.equal(preview.matches.length, 1);
    const result = await page.send({
      type: "FILL_APPROVED",
      profile: board.profile,
      approvedMatches: approvals(preview.matches),
    });

    assert.equal(result.filledCount, 1);
    assert.equal(page.document.querySelector(board.selector).value, board.expected);
  });
}

test("stale board fields are skipped after preview", async () => {
  const page = fixture(
    "https://boards.greenhouse.io/acme/jobs/1",
    '<div class="field"><label>Email<input name="email"></label></div>',
  );
  const profile = { email: "profile@example.com" };
  const preview = await page.send({ type: "PREVIEW_PROFILE", profile });
  page.document.querySelector("input").value = "typed@example.com";

  const result = await page.send({
    type: "FILL_APPROVED",
    profile,
    approvedMatches: approvals(preview.matches),
  });

  assert.equal(result.filledCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(page.document.querySelector("input").value, "typed@example.com");
});
