import json
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI()

BASE_DIR = Path(__file__).parent
PROFILE_PATH = BASE_DIR / "profile.json"

PROFILE_FIELDS = [
    {"key": "full_name", "label": "Full legal name", "section": "Contact", "type": "text"},
    {"key": "first_name", "label": "First name", "section": "Contact", "type": "text"},
    {"key": "middle_name", "label": "Middle name", "section": "Contact", "type": "text"},
    {"key": "last_name", "label": "Last name", "section": "Contact", "type": "text"},
    {"key": "preferred_name", "label": "Preferred name", "section": "Contact", "type": "text"},
    {"key": "pronouns", "label": "Pronouns", "section": "Contact", "type": "text"},
    {"key": "email", "label": "Email address", "section": "Contact", "type": "email"},
    {"key": "phone", "label": "Phone number", "section": "Contact", "type": "tel"},
    {"key": "address_line1", "label": "Street address", "section": "Address", "type": "text"},
    {"key": "address_line2", "label": "Apartment, suite, or unit", "section": "Address", "type": "text"},
    {"key": "city", "label": "City", "section": "Address", "type": "text"},
    {"key": "state", "label": "State or province", "section": "Address", "type": "text"},
    {"key": "postal_code", "label": "ZIP or postal code", "section": "Address", "type": "text"},
    {"key": "country", "label": "Country", "section": "Address", "type": "text"},
    {"key": "county", "label": "County", "section": "Address", "type": "text"},
    {"key": "current_title", "label": "Current job title", "section": "Experience", "type": "text"},
    {"key": "current_company", "label": "Current employer", "section": "Experience", "type": "text"},
    {"key": "years_experience", "label": "Years of experience", "section": "Experience", "type": "number"},
    {"key": "bio", "label": "Professional summary", "section": "Experience", "type": "textarea"},
    {"key": "highest_degree", "label": "Highest degree", "section": "Education", "type": "text"},
    {"key": "school", "label": "School or university", "section": "Education", "type": "text"},
    {"key": "field_of_study", "label": "Field of study", "section": "Education", "type": "text"},
    {"key": "graduation_year", "label": "Graduation year", "section": "Education", "type": "number"},
    {"key": "linkedin", "label": "LinkedIn profile URL", "section": "Links", "type": "url"},
    {"key": "portfolio", "label": "Portfolio website", "section": "Links", "type": "url"},
    {"key": "github", "label": "GitHub profile URL", "section": "Links", "type": "url"},
    {"key": "referral_source", "label": "How did you hear about this job?", "section": "Application", "type": "text"},
    {"key": "previously_worked_here", "label": "Previously worked for this organization", "section": "Application", "type": "choice", "options": ["", "Yes", "No"]},
    {"key": "phone_type", "label": "Phone device type", "section": "Contact", "type": "choice", "options": ["", "Mobile", "Landline"]},
    {"key": "phone_country_code", "label": "Phone country or calling code", "section": "Contact", "type": "text"},
    {"key": "phone_extension", "label": "Phone extension", "section": "Contact", "type": "text"},
    {"key": "authorized_to_work", "label": "Legally authorized to work", "section": "Work preferences", "type": "choice", "options": ["", "Yes", "No"]},
    {"key": "requires_sponsorship", "label": "Requires employment sponsorship", "section": "Work preferences", "type": "choice", "options": ["", "Yes", "No"]},
    {"key": "visa_status", "label": "Visa or work authorization status", "section": "Work preferences", "type": "text"},
    {"key": "work_mode", "label": "Preferred work arrangement", "section": "Work preferences", "type": "choice", "options": ["", "Remote", "Hybrid", "On-site"]},
    {"key": "employment_type", "label": "Preferred employment type", "section": "Work preferences", "type": "text"},
    {"key": "available_start_date", "label": "Available start date", "section": "Work preferences", "type": "date"},
    {"key": "notice_period", "label": "Notice period", "section": "Work preferences", "type": "text"},
    {"key": "salary_expectation", "label": "Salary expectation", "section": "Work preferences", "type": "text"},
    {"key": "willing_to_relocate", "label": "Willing to relocate", "section": "Work preferences", "type": "choice", "options": ["", "Yes", "No"]},
    {"key": "travel_willingness", "label": "Travel willingness", "section": "Work preferences", "type": "text"},
    {"key": "cover_letter", "label": "Reusable cover-letter text", "section": "Application", "type": "textarea"},
    {"key": "gender", "label": "Gender (optional)", "section": "Voluntary self-identification", "type": "text"},
    {"key": "race_ethnicity", "label": "Race or ethnicity (optional)", "section": "Voluntary self-identification", "type": "text"},
    {"key": "veteran_status", "label": "Veteran status (optional)", "section": "Voluntary self-identification", "type": "text"},
    {"key": "disability_status", "label": "Disability status (optional)", "section": "Voluntary self-identification", "type": "text"},
]

ALLOWED_PROFILE_KEYS = {field["key"] for field in PROFILE_FIELDS}


def read_profile() -> dict[str, Any]:
    try:
        data = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Local profile not found") from error
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=500, detail="Local profile contains invalid JSON") from error

    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="Local profile must be a JSON object")

    return data


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/profile")
def profile():
    return JSONResponse(read_profile(), headers={"Cache-Control": "no-store"})


@app.get("/profile-schema")
def profile_schema():
    return PROFILE_FIELDS


@app.put("/profile")
def update_profile(
    updates: dict[str, Any] = Body(...),
    x_local_autofill: str | None = Header(default=None),
):
    if x_local_autofill != "profile-editor":
        raise HTTPException(status_code=403, detail="Profile editor header required")

    unknown_keys = set(updates) - ALLOWED_PROFILE_KEYS
    if unknown_keys:
        raise HTTPException(status_code=400, detail="Unknown profile field")

    for value in updates.values():
        if not isinstance(value, (str, int, float, bool)) and value is not None:
            raise HTTPException(status_code=400, detail="Profile values must be simple values")

    current = read_profile()
    current.update(updates)
    temporary_path = PROFILE_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(current, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(PROFILE_PATH)
    return {"status": "saved", "field_count": len(updates)}


@app.get("/profile-editor")
def profile_editor():
    return FileResponse(BASE_DIR / "profile-editor.html")


@app.get("/test-form")
def test_form():
    return FileResponse(BASE_DIR / "test-form.html")


@app.get("/matcher-test")
def matcher_test():
    return FileResponse(BASE_DIR / "matcher-test.html")


@app.get("/content-script-test.js")
def content_script_test():
    return FileResponse(
        BASE_DIR.parent / "extension" / "content.js",
        media_type="application/javascript",
    )
