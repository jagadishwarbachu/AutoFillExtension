# Local Autofill

A learning project that keeps profile data on your computer and requires a preview before it fills any form fields. It never submits a job application. Chrome grants temporary access to the active site when you open the extension, so no website allowlist is required.

The referral-outreach workflow can scan email addresses that are currently visible on the active page, let you select recipients, personalize a message, attach a resume, and create separate Gmail drafts. It does not reveal hidden contacts, click through gated connection details, scrape profiles in the background, or send email without a final review in Gmail.

## Start the local server

From the project folder:

```bash
cd server
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Open <http://localhost:8000/test-form> in Chrome.

## Load or reload the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `extension` folder. If it is already loaded, click its reload button.
4. Refresh the practice-form tab so the updated content script runs.

The extension can run on ordinary `http` and `https` pages after you click it. Chrome blocks extensions from internal pages such as `chrome://` settings and the Chrome Web Store.

## Job-board compatibility

Version 0.8 adds tested field-label and job-metadata adapters for:

- Greenhouse
- Lever
- Ashby
- Workday
- SmartRecruiters
- iCIMS
- Taleo and Oracle Recruiting

The extension automatically selects an adapter from the current hostname and known page markers. The preview status names the active adapter, and **Developer field inspection** includes both the detected board and the fields it found. Unknown sites continue through the generic matcher.

Adapters improve recognition of generated field names, board-specific label containers, ARIA comboboxes, and job/company headings. They do not bypass login screens, CAPTCHAs, cross-origin iframe restrictions, or file-upload controls. Multi-page applications should be previewed again on every page, and every proposed value still requires review before filling.

## Use it

1. Open the extension while the practice form is active.
2. Use **Edit local profile** to add or update application details on your computer.
3. Choose **Preview matches**.
4. Review the proposed values and uncheck anything you do not want filled.
5. Choose **Fill selected**.

## Referral outreach with Gmail

### One-time Google setup

1. Load the unpacked extension and copy its ID from `chrome://extensions`.
2. In Google Cloud Console, create or select a project and enable the Gmail API.
3. Configure the OAuth consent screen. While developing, add your Gmail address as a test user.
4. Create an OAuth client with application type **Chrome Extension** and use the extension ID as its item ID.
5. Put the generated client ID in the `oauth2.client_id` field in `extension/manifest.json`. If the unpacked extension ID changes, create a matching Chrome Extension OAuth client and update this value.
6. Reload the extension from `chrome://extensions`.

The extension requests the Gmail `gmail.compose` scope so it can create drafts with attachments. Keep the OAuth client ID in the manifest; never add a client secret to a browser extension.

### Create referral drafts

1. On JobRight or another job page, reveal the connection details you are authorized to view so the email addresses are visible.
2. Open Local Autofill and choose **Find contacts**.
3. Select the recipients and correct the detected job title or company if necessary.
4. Review the subject and message template. Choose **Preview first** to inspect the first personalized message.
5. Select the resume file to attach.
6. Choose **Connect Gmail** once, then choose **Create Gmail drafts**.
7. Open Gmail Drafts, review each recipient and message, and send manually.

The extension creates no more than five drafts per action and keeps a small local history of created draft IDs. It only scans the currently visible page after you click **Find contacts**.

### Passive visible-email capture to Excel

1. Open the job, recruiter, company, or contact page you want to use.
2. Open Local Autofill and choose **Start passive email capture**.
3. Close the extension popup and manually open contact details you are permitted to view.
4. When a visible email address appears, the extension saves it locally. Reopen the extension to see the page capture status or to stop monitoring.

Passive capture works on ordinary websites after you explicitly start it for the current page. It reads only email addresses that appear in visible text, visible form fields, or `mailto:` links. It does not click website controls, reveal gated information, bypass access restrictions, or send messages. A full page reload or navigation stops monitoring; start it again on the new page when needed.

## Automated tests

Install the JavaScript test dependency and run the adapter, filling, stale-field, and outreach tests:

```bash
npm install
npm test
```

Captured contacts are deduplicated by email and saved to `jobright_contacts.xlsx` in the project folder. Despite the historical filename, the workbook can contain contacts from any supported website. It records name, email, contact title, company, job title, job URL, source hostname, and capture time. The file is excluded from Git because it contains personal contact data.

Fields that already contain a value are shown but cannot be selected. Passwords, hidden fields, file inputs, disabled fields, and read-only fields are ignored. Standard radio buttons and positive checkbox choices can be previewed and approved; custom controls may require manual entry.

## Local profile

The server reads `server/profile.json`. Keep these keys for the current practice form:

```json
{
  "full_name": "Example Person",
  "email": "person@example.com",
  "bio": "A short introduction.",
  "work_mode": "remote",
  "portfolio": "https://example.com"
}
```

`server/profile.json` is excluded by `.gitignore`. Do not commit real personal data.

The profile editor includes 46 common contact, address, experience, education, link, application, work-authorization, availability, and optional self-identification fields. If only `full_name` is present, the preview derives first, middle, and last name suggestions for sites that split the name. File uploads are intentionally excluded because browsers do not allow extensions to choose local files automatically.
