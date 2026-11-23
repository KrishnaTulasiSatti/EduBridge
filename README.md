# EduBridge

AI-assisted educational sponsorship platform that connects financially struggling students with sponsors through
structured applications, document verification, human review, need assessment and transparent sponsorship tracking.

> Trust through verification, fairness through assessment, transparency through tracking, and human authority through final administrative decisions.

## Repository layout

```
apps/
  edubridge-web   React 18 + TypeScript + Tailwind CSS v4 (Vite)
  edubridge-api   Node.js + Express 5 + TypeScript + Mongoose
  eduvault-web    React + Tailwind — simulated DigiLocker-style document locker
  eduvault-api    Express + Mongoose — institutions, Ed25519 signing, consent, one-time sharing
  ml-service      Python + FastAPI + scikit-learn need-assessment model (experimental second opinion)
packages/
  shared          Zod schemas and TypeScript types shared by EduBridge web and api
  eduvault-shared EduVault schemas, signed-document format and canonical JSON (used by both APIs)
```

## Quick start

Requirements: Node.js 20.19+, npm 10 and Python 3.10+ (for the ML service).

```bash
npm install
npm run ml:setup   # once: creates apps/ml-service/.venv and installs the Python packages
npm run dev
```

`npm run dev` starts all five apps. Each port is fixed (Vite fails instead of moving), because EduVault redirects back to an exact address.

| App            | URL                                  |
| -------------- | ------------------------------------ |
| EduBridge web  | http://localhost:5173                |
| EduBridge API  | http://localhost:5000/api/health     |
| EduVault web   | http://localhost:5174                |
| EduVault API   | http://localhost:5100/api/health     |
| ML service     | http://127.0.0.1:8000/health         |

No database setup is needed for development. When `MONGODB_URI` in `apps/edubridge-api/.env` is empty, the API starts an
in-memory MongoDB and seeds demo accounts. The data resets on every restart. The first run downloads a MongoDB binary (~600 MB, one time).

To use MongoDB Atlas, set `MONGODB_URI` in `apps/edubridge-api/.env` and `apps/eduvault-api/.env` (the same cluster is fine —
EduVault always uses its own `eduvault` database), then run `npm run seed` once. It seeds both applications.

EduBridge and EduVault share a partner secret: `EDUVAULT_CLIENT_SECRET` (EduBridge) must equal `EDUBRIDGE_CLIENT_SECRET` (EduVault).

### Demo accounts (fictional test data)

Password for all accounts: `Demo@1234`

| Role      | Email                              |
| --------- | ---------------------------------- |
| Admin     | admin@edubridge.test               |
| Student   | student@edubridge.test             |
| Volunteer | volunteer@edubridge.test           |
| Sponsor   | sponsor@edubridge.test             |
| Volunteer (pending approval) | pending.volunteer@edubridge.test |

EduVault (same password `Demo@1234`):

| Role                                   | Email                    |
| -------------------------------------- | ------------------------ |
| EduVault admin                         | admin@eduvault.test      |
| Institution — Krishna Valley College of Engineering (Test), trusted | registrar@kvce.test |
| Institution — Riverside Institute of Science (Test), awaiting approval | registrar@riverside.test |
| Student Rahul Kumar, roll no. 21KV1A0542 | student@edubridge.test |


## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Runs API and web together                     |
| `npm test`          | API integration tests (Vitest + Supertest) and ML service tests (pytest) |
| `npm run typecheck` | Type-checks every workspace                   |
| `npm run build`     | Production builds of API and web              |
| `npm run seed`      | Seeds demo users into the configured database |

## Security implemented (Phase 1)

- Passwords hashed with **Argon2id**
- Short-lived **JWT access tokens** (15 min) kept in memory only, never in localStorage
- **Refresh tokens** in an httpOnly cookie, stored as SHA-256 hashes, **rotated on every use**, with **reuse detection** that revokes the whole session family
- **Role-based access control** on the API (`requireRole`) and the UI (`ProtectedRoute`)
- Account lockout after 5 failed logins, rate limiting on auth routes, constant-time-ish responses for unknown emails
- Volunteer accounts require admin approval; admins cannot be self-registered
- Helmet security headers, CORS allow-list, Zod validation on every request body
- **Append-only audit log** for registrations, logins, failures, lockouts, logouts, token reuse and status changes

## Student application (Phase 2)

- Six-step application: personal details, education, family and income, support needed, documents, review
- Answers autosave as you type; each field is validated individually on save and the whole application is validated on submit
- Business rules: earning members cannot exceed family size; the requested amount cannot exceed total costs minus existing aid
- Documents (marksheet, income certificate + certificate number, college ID + roll number) are checked by file content, limited to 5 MB, stored privately under random keys with a SHA-256 hash, and served only to the owner, volunteers and admins (admin and volunteer views are audited)
- On submission the profile is frozen into a snapshot and the application is locked; the student sees a status tracker
- Admins see submitted applications with search and status filters

Uploaded files are stored in `UPLOAD_DIR` (default `apps/edubridge-api/uploads`, git-ignored).

### Atlas on Windows

Some Windows networks refuse Node's DNS lookup for `mongodb+srv` addresses. The API detects this and retries with public DNS (1.1.1.1 / 8.8.8.8) automatically.

## EduVault (Phase 3)

A separate, clearly labelled simulation of a DigiLocker-style locker. It is not affiliated with DigiLocker and all records are test data.

- **Institutions** register and stay pending until an EduVault admin approves them; approval creates an **Ed25519 signing key**.
  The private key is encrypted at rest (AES-256-GCM, `KEY_ENCRYPTION_KEY`); public keys are published at `/api/registry/issuers`.
- Institutions **enrol students**; each enrolment gets a **one-time activation code** that the student uses to open their account.
- Institutions **upload the marksheet PDF** (checked by content, max 5 MB, stored privately) and enter only its key details:
  student, semester, academic year, exam session, result and an optional overall percentage. Marks are not typed in.
- **Issuing** freezes those details together with the **PDF's SHA-256** into a canonical JSON record, hashes the record with
  **SHA-256** and signs it with Ed25519, so neither the details nor a single byte of the PDF can change unnoticed.
  Issued marksheets cannot be edited, only **revoked**.
- **Consent flow** (“Verify using EduVault” on EduBridge):
  1. EduBridge's server asks EduVault for access (partner client ID + secret, registered redirect URI only, anti-forgery `state`).
  2. The student signs in to EduVault and sees who is asking, why, and exactly which fields will be shared.
  3. On approval EduVault creates a **one-time sharing reference** (10 minutes, single use, stored only as a hash).
  4. EduBridge's server redeems it, fetches the issuer's public key from the registry **separately**, recomputes the hash and
     verifies the signature and that the received PDF matches the signed file hash, then compares name, roll number, institution and university with the application.
  5. EduBridge records issuer, document ID, key, hash, signature result, consent reference and time.
     Result: `VERIFIED`, `REVIEW_REQUIRED` (mismatch or untrusted issuer), `REJECTED` (bad signature or revoked) or `SERVICE_UNAVAILABLE`.
- Students see their **sharing history**; admins see an append-only **activity log**.

## Verification and volunteer workspace (Phase 4)

- **Verification queue**: submitted applications, oldest first. A volunteer (or admin) **claims** one atomically, so two people
  never work on the same application. The application moves to `UNDER_VERIFICATION` and its documents to `PROCESSING`.
  It can be returned to the queue; results recorded so far are kept.
- **Income certificate**: the student gives the certificate's application number and their **Aadhaar number** (format and
  Verhoeff checksum validated). Aadhaar is stored **encrypted (AES-256-GCM, `DATA_ENCRYPTION_KEY`)**; everyone sees only the last 4 digits.
  The assigned volunteer clicks **Show** (audited, hidden again after a minute), searches it on the official **AP Seva portal**
  (apseva.ap.gov.in), finds the matching application number in the list and records what the certificate shows
  (number, name, annual income, issue date). EduBridge compares it with the application (income within ₹1,000; a certificate is **valid for 4 years from its date of issue**).
- **College ID**: checked automatically when verification starts. EduBridge finds the college in the **EduVault issuer registry** and asks
  EduVault (partner API `POST /api/partner/enrolments/check`, exact roll number only, audited on both sides) whether the college has
  enrolled a student with that roll number. The college's record (name, roll number, programme) is compared with the application:
  a full match marks the college ID **Verified** with no manual step; a mismatch or a missing record is **Needs review**.
  If the college is not on EduVault, the volunteer contacts the college instead and logs who confirmed.
- **Marksheet**: one verified by its EduVault signature needs no manual check. An uploaded copy is inspected and its name and percentage compared.
- Every check records a result (`VERIFIED`, `REVIEW_REQUIRED`, `REJECTED`, `SERVICE_UNAVAILABLE`) with a required note.
  "Verified" requires the confirmed details. All differences are collected in a **Differences found** panel.
- Once every document has a final result, the volunteer submits a **recommendation** and summary. The application becomes
  `VOLUNTEER_REVIEWED`. Volunteers never approve or reject; the final decision is the administrator's (Phase 5).
- Access: volunteers open only applications they claimed or reviewed (documents included). Admins see everything.
  Reviewer notes are never shown to students. Claims, releases, each check and each review are audited.


## Need assessment and admin decisions (Phase 5)

- When a volunteer submits their review, the application is **assessed automatically** and moves to `ASSESSED`.
- **Rule-based need score (primary, 0–100)**, fully explainable, every point traced to one factor:
  income per family member (35), education cost burden vs income (25), dependents (15), special circumstances (15, capped),
  cost not covered by other aid (10). High need from 65, medium from 40. If the volunteer recorded the income shown on
  AP Seva, that **verified income** is used instead of the declared one.
- **ML second opinion (experimental)** from `apps/ml-service`: Logistic Regression (baseline), Decision Tree (explainable)
  and Random Forest are compared with **stratified 5-fold cross-validation**; the best macro F1 is used. The report shows
  accuracy, precision, recall, F1, the **confusion matrix**, feature importance and a **fairness check by gender**
  (gender, location, caste and religion are never model inputs).
  - The genuine route trains on **admins' decisions** (the need level they confirm), once there are at least 30 decided
    applications with at least 5 per level used.
  - A **demonstration model** can be trained on 600 synthetic applications. Its predictions are always labelled
    "Demonstration · synthetic data" and must not be treated as real assessments (spec: never present synthetic predictions as genuine).
  - If the ML service is down, assessments continue with the rule-based score alone.
- **Admin decision**: approve (with the amount approved for sponsorship), put on hold, or not approve; a confirmed need level;
  an internal reason (audited); an optional message the student sees. Approved / not approved are final.
- **Privacy**: the encrypted Aadhaar number is deleted once a final decision is made (the last 4 digits remain).
- The ML service is called only by the EduBridge API with a shared token (`ML_SERVICE_TOKEN` in both `.env` files).

## Development phases

1. ✅ Setup, design system, landing page, authentication and roles
2. ✅ Student profile, application wizard, document upload, status tracker
3. ✅ EduVault: institutions, marksheet issuing, Ed25519 signatures, consent and sharing
4. ✅ Income and college ID verification, volunteer workspace
5. ✅ Admin review, rule-based need assessment, ML service and model evaluation
6. Sponsor matching, sponsorship management, certificates
7. Analytics dashboard, audit log explorer, security hardening
8. End-to-end tests, demo data, deployment
