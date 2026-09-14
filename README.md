# Local Autofill

A learning project that keeps profile data on your computer and requires a preview before it fills any form fields. It never submits a form. Chrome grants temporary access to the active site when you open the extension, so no website allowlist is required.

## Start the local server

From the project folder:

```bash
cd server
source .venv/bin/activate
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Open <http://localhost:8000/test-form> in Chrome.

## Load or reload the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `extension` folder. If it is already loaded, click its reload button.
4. Refresh the practice-form tab so the updated content script runs.

The extension can run on ordinary `http` and `https` pages after you click it. Chrome blocks extensions from internal pages such as `chrome://` settings and the Chrome Web Store.

## Use it

1. Open the extension while the practice form is active.
2. Use **Edit local profile** to add or update application details on your computer.
3. Choose **Preview matches**.
4. Review the proposed values and uncheck anything you do not want filled.
5. Choose **Fill selected**.

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
