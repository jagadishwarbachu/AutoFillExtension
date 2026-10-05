const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const adapters = require("./job-board-adapters.js");

const fixtures = [
  ["Greenhouse", "https://boards.greenhouse.io/acme/jobs/1", '<div class="field"><label>First Name<input data-field-name="first_name"></label></div>', "first name"],
  ["Lever", "https://jobs.lever.co/acme/1", '<div class="application-question"><label>LinkedIn profile</label><input data-qa="linkedin"></div>', "linkedin profile"],
  ["Ashby", "https://jobs.ashbyhq.com/acme/1", '<div data-testid="email-field"><label>Email address</label><input data-testid="email"></div>', "email address"],
  ["Workday", "https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/1", '<div data-automation-id="formField"><div data-automation-id="formLabel">Phone number</div><input data-automation-id="phone-input"></div>', "phone number"],
  ["SmartRecruiters", "https://jobs.smartrecruiters.com/Acme/1", '<div class="form-group"><label>Portfolio website</label><input data-testid="portfolio-field"></div>', "portfolio website"],
  ["iCIMS", "https://careers-acme.icims.com/jobs/1", '<div class="iCIMS_Field"><span class="iCIMS_Label">Postal code</span><input></div>', "postal code"],
  ["Taleo / Oracle Recruiting", "https://acme.taleo.net/careersection/apply", '<div class="form-row"><span class="field-label">Work authorization</span><select></select></div>', "work authorization"],
];

for (const [name, url, body, expectedLabel] of fixtures) {
  test(`${name} adapter detects its board and field label`, () => {
    const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url });
    const element = dom.window.document.querySelector("input, select");
    const detected = adapters.detect(dom.window.location, dom.window.document);
    const hints = adapters.fieldHints(element, dom.window.location, dom.window.document)
      .map((value) => value.toLowerCase());

    assert.equal(detected.name, name);
    assert.ok(hints.some((hint) => hint.includes(expectedLabel)));
  });
}

test("page context uses board-specific job metadata", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="jobPostingHeader">Staff Data Scientist</div>
    <div data-automation-id="company">Example Corp</div>
  </body>`, { url: "https://example.myworkdayjobs.com/en-US/jobs/job/2" });

  assert.deepEqual(
    adapters.pageContext(dom.window.document, dom.window.location),
    {
      boardId: "workday",
      boardName: "Workday",
      jobTitle: "Staff Data Scientist",
      company: "Example Corp",
    },
  );
});

test("unknown sites retain the generic form adapter", () => {
  const dom = new JSDOM("<!doctype html><body><form><input></form></body>", {
    url: "https://careers.example.com/apply",
  });

  assert.equal(adapters.detect(dom.window.location, dom.window.document).id, "generic");
});
