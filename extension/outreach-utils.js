(function attachOutreachUtils(root) {
  const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validEmail(value) {
    return EMAIL_PATTERN.test(normalizeEmail(value));
  }

  function firstName(contact) {
    const explicit = String(contact?.name || "").trim().split(/\s+/)[0];
    if (explicit && !explicit.includes("@")) return explicit;
    return "there";
  }

  function applyTemplate(template, values) {
    return String(template || "").replace(/\{([a-z_]+)\}/gi, (match, key) => {
      const value = values?.[key.toLowerCase()];
      return value === undefined || value === null ? match : String(value);
    });
  }

  function cleanHeader(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").trim();
  }

  function utf8ToBase64(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function asciiToBase64Url(value) {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function wrapBase64(value) {
    return String(value).match(/.{1,76}/g)?.join("\r\n") || "";
  }

  function quotedFilename(value) {
    return cleanHeader(value).replace(/["\\]/g, "_") || "resume.pdf";
  }

  function buildMimeMessage({ to, subject, body, attachment }) {
    const recipient = normalizeEmail(to);
    if (!validEmail(recipient)) throw new Error(`Invalid recipient email: ${to}`);

    const boundary = `local-autofill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const safeSubject = cleanHeader(subject);
    const encodedSubject = `=?UTF-8?B?${utf8ToBase64(safeSubject)}?=`;
    const bodyBase64 = wrapBase64(utf8ToBase64(String(body || "")));
    const lines = [
      `To: ${recipient}`,
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      bodyBase64,
    ];

    if (attachment?.bytes?.length) {
      const filename = quotedFilename(attachment.name);
      const contentType = cleanHeader(attachment.type) || "application/octet-stream";
      lines.push(
        `--${boundary}`,
        `Content-Type: ${contentType}; name="${filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${filename}"`,
        "",
        wrapBase64(bytesToBase64(attachment.bytes)),
      );
    }

    lines.push(`--${boundary}--`, "");
    return asciiToBase64Url(lines.join("\r\n"));
  }

  const api = {
    applyTemplate,
    buildMimeMessage,
    firstName,
    normalizeEmail,
    validEmail,
  };

  root.OutreachUtils = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
