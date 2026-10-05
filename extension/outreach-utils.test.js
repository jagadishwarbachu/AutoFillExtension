const assert = require("node:assert/strict");
const {
  applyTemplate,
  buildMimeMessage,
  firstName,
  validEmail,
} = require("./outreach-utils.js");

assert.equal(validEmail("person@example.com"), true);
assert.equal(validEmail("not-an-email"), false);
assert.equal(firstName({ name: "JaLisa Harris" }), "JaLisa");
assert.equal(firstName({ email: "person@example.com" }), "there");
assert.equal(
  applyTemplate("Hi {first_name} — {job_title} at {company}", {
    first_name: "JaLisa",
    job_title: "Data Scientist",
    company: "Example Co",
  }),
  "Hi JaLisa — Data Scientist at Example Co",
);

const raw = buildMimeMessage({
  to: "person@example.com",
  subject: "Referral request",
  body: "Hello from the test suite.",
  attachment: {
    name: "resume.pdf",
    type: "application/pdf",
    bytes: new Uint8Array([37, 80, 68, 70]),
  },
});
const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - raw.length % 4) % 4);
const mime = Buffer.from(padded, "base64").toString("utf8");
assert.match(mime, /To: person@example\.com/);
assert.match(mime, /Content-Disposition: attachment; filename="resume\.pdf"/);
assert.match(mime, /JVBERg==/);

console.log("outreach-utils tests passed");
