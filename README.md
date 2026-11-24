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
  pan-registry-api Express + Mongoose — simulated PAN registry that verifies sponsors with an email OTP
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

`npm run dev` starts all six apps. Each port is fixed (Vite fails instead of moving), because EduVault redirects back to an exact address.

| App            | URL                                  |
| -------------- | ------------------------------------ |
| EduBridge web  | http://localhost:5173                |
| EduBridge API  | http://localhost:5001/api/health     |
| EduVault web   | http://localhost:5174                |
| EduVault API   | http://localhost:5100/api/health     |
| ML service     | http://127.0.0.1:8000/health         |
| PAN Registry   | http://localhost:5200 (records page) |

No database setup is needed for development. When `MONGODB_URI` in `apps/edubridge-api/.env` is empty, the API starts an
in-memory MongoDB and creates the administrator. The data resets on every restart. The first run downloads a MongoDB binary (~600 MB, one time).

To use MongoDB Atlas, set `MONGODB_URI` in `apps/edubridge-api/.env` and `apps/eduvault-api/.env` (the same cluster is fine —
EduVault always uses its own `eduvault` database), then run `npm run seed` once. It creates the administrator of each application.

EduBridge and EduVault share a partner secret: `EDUVAULT_CLIENT_SECRET` (EduBridge) must equal `EDUBRIDGE_CLIENT_SECRET` (EduVault).

### Accounts

Only the two administrators are created automatically. Everyone else signs up on the website.

| App      | Administrator          | Default password |
| -------- | ---------------------- | ---------------- |
| EduBridge | admin@edubridge.test  | `Demo@1234`      |
| EduVault  | admin@eduvault.test   | `Demo@1234`      |

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the app's `.env` **before** the first `npm run seed` to choose different ones
(required in production). An existing administrator is never changed by the seed.

- **Students, sponsors and volunteers** register at http://localhost:5173/register. Volunteers stay pending until the admin approves them (*Users*).
- **Sponsors** verify their PAN while signing up, so their PAN must first be added on the PAN Registry records page (see *Sponsor PAN verification* below).
- **Institutions** register on EduVault (http://localhost:5174) and stay pending until the EduVault admin approves them.
- **Students' EduVault accounts** are activated with the one-time code their institution gives them when enrolling them.

The automated tests create their own fictional accounts (`apps/*/tests/fixtures.ts`); they never touch your database.

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Runs API and web together                     |
| `npm test`          | API integration tests (Vitest + Supertest) and ML service tests (pytest) |
| `npm run typecheck` | Type-checks every workspace                   |
| `npm run build`     | Production builds of API and web              |
| `npm run seed`      | Creates the administrators in the configured database |

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

## Sponsor matching, sponsorships and certificates (Phase 6)

- **Student consent first**: an approved student chooses on the *Sponsorship* page to show an **anonymised profile**
  (pseudonym such as “Student 7KQ2MD”, course, level, year, state, last exam %, need level, cost breakdown, circumstances and
  an optional note). Name, contact details, address, college name, income figures, documents and Aadhaar are never sent to sponsors.
- **Sponsor preferences**: budget, preferred levels, types of support (tuition, hostel, books…), states and circumstances,
  the name to print on certificates and whether students may see it.
- **Matching** (rule-based, explainable): `0.30 × level + 0.30 × support category + 0.25 × budget fit + 0.15 × other preferences`.
  An empty preference means “any”. Category match is the share of the student's costs in the sponsor's preferred categories.
  Ties are broken by need level, then remaining requirement. Each student card shows why it was suggested.
- **Pledge → send → received** (no administrator needed):
  1. A sponsor pledges an amount (minimum ₹500). The pledge reserves it for **14 days**; if the money is not sent by then it is released automatically.
     Sponsors can withdraw a pledge until they send the money.
  2. The student adds their **bank account** (name, account number, IFSC, bank) on the *Sponsorship* page. The account number is
     **encrypted at rest** (AES-256-GCM, `DATA_ENCRYPTION_KEY`); the student sees only the last 4 digits.
  3. The sponsor clicks **Send money** on *My sponsorships*, opens the bank details (audited; shown only to that sponsor and only while the
     money is still to be sent), transfers it by NEFT/IMPS/RTGS and records the date and **UTR**. The sponsorship becomes `SENT`.
  4. The student checks their account and clicks **Yes, I received it**. The sponsorship becomes `CONFIRMED` and certificates are issued.
     If it has not arrived they click **Not received yet**; the sponsor is told and can record a corrected transfer, and an administrator can
     settle it (**Mark received** or **Cancel**).
- **Over-allocation is impossible**: each pledge runs in a **MongoDB transaction** whose updates check
  `pledged + confirmed + amount ≤ approved amount` and `committed + amount ≤ sponsor budget` atomically, so two sponsors pledging at
  the same moment cannot over-fund a student. One active sponsorship per sponsor per student (partial unique index).
- The application moves to `PARTIALLY_FUNDED` / `FULLY_FUNDED` from **confirmed** amounts; fully funded students leave discovery.
- **Certificates**: once the money is confirmed as received, EduBridge issues a sponsor certificate of appreciation and a student award certificate.
  Each is a canonical JSON record hashed with SHA-256 and **signed with EduBridge's Ed25519 key** (`CERTIFICATE_SIGNING_KEY`).
  `/certificates/<number>?code=<code>` is a public, printable verification page (the random code printed on the certificate is required);
  it re-verifies the signature and shows if the certificate was revoked. The public key is at `/api/certificates/public-key`.
- Every action (preferences, consent, bank details saved or viewed, pledge, withdrawal, expiry, money sent, not-received report, confirmation, cancellation, certificate issue/revoke) is audited.
- No payment gateway: sponsors transfer the money directly to the student's bank account, outside the platform. EduBridge records each step.

## Analytics, audit log explorer and security hardening (Phase 7)

- **Analytics** (`/dashboard/analytics`, admins): registered students, applications submitted, awaiting verification,
  documents awaiting review, approved / not approved / on hold, approved by need level, students eligible for sponsorship,
  confirmed, pledged and still-needed amounts, sponsor budgets, a 12-month trend (submissions, decisions, confirmed money),
  volunteer verification activity (last 30 days) and security events. Every figure is counted live from the database (`GET /api/analytics`).
- **Audit log explorer** (`/dashboard/audit`, admins): filter by category, activity, role, person (name or email), record
  (application number, sponsorship reference, certificate number or ID) and date range; open an entry to see every recorded
  detail, IP address, browser and other activity on the same record. Filters live in the URL, so other pages link to it.
  **CSV export** (up to 10,000 rows) neutralises spreadsheet formulas and is itself audited. Entries remain immutable.
- **Security hardening**
  - Suspending an account or changing its role ends access **immediately** (each request re-checks the account; 10-second cache), not when the 15-minute token expires
  - JWTs are signed and verified with **HS256 only** (no `alg: none` or algorithm confusion)
  - A global **MongoDB operator-injection guard** rejects `$`-keys, dotted keys and prototype keys in bodies and query strings
  - General **API rate limit** (900 requests / 15 min per IP) on top of the stricter sign-in limit
  - Strict headers for a JSON API: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, no referrer,
    HSTS in production, `Cache-Control: no-store` on every API response
  - **HTTPS required** in production (`/api/health` excepted for the host's health check)
  - Invalid query parameters return 400 instead of a server error; production errors never reveal internals
  - **Audit metadata redaction**: keys such as passwords, tokens, secrets and Aadhaar numbers are replaced with `[redacted]` before saving
- **Document retention**: files of applications that were **not approved** are deleted `DOCUMENT_RETENTION_DAYS` after the decision
  (default 180). The record, SHA-256 fingerprint and verification results are kept; opening the file returns *410 Gone*. The job runs
  at start-up and daily and is audited. (Aadhaar numbers are already deleted at any final decision.)

## Sponsor PAN verification

Sponsors cannot create an account until their PAN is verified. The check runs against **PAN Registry**
(`apps/pan-registry-api`, port 5200). It is a clearly labelled **simulation** built for this project, in the same spirit
as EduVault. It is **not** connected to the Income Tax Department, and it must only hold made-up records.

1. The registry administrator opens http://localhost:5200, signs in with `ADMIN_KEY` and adds a record: PAN, name as on the
   PAN card, date of birth and the email where codes are sent. Records can be deactivated (e.g. "PAN cancelled") or deleted.
2. On EduBridge's sign-up page the sponsor enters their name, PAN and date of birth and clicks **Send code**.
3. EduBridge's server asks the registry (partner ID and secret, server-to-server). The registry checks the PAN format, that
   the PAN exists and is active, and that the name (ignoring case, dots and spaces) and date of birth match. If they do, it emails a
   **6-digit OTP to the address registered for that PAN**, never to an address the sponsor typed.
4. The sponsor enters the code. The OTP is stored only as a SHA-256 hash, is valid for **10 minutes**, allows **5 tries**
   and can be used **once**. A PAN can receive at most 3 codes in 15 minutes.
5. EduBridge then gives the browser a **signed PAN token** (HS256, 30 minutes) and the sign-up form unlocks. The account name must match the PAN name.
6. The sponsor account stores the PAN **encrypted** (AES-256-GCM), a keyed hash (HMAC-SHA256) that allows **one sponsor account
   per PAN**, the masked PAN (`XXXXXX234L`) and the registry reference. Admins see "PAN verified · XXXXXX234L" on *Users*.

Results the registry can return: `OTP_SENT`, `NOT_FOUND`, `INACTIVE`, `NAME_MISMATCH`, `DOB_MISMATCH`, `INVALID_FORMAT`;
and for the code: `VERIFIED`, `INVALID_OTP`, `EXPIRED`, `TOO_MANY_ATTEMPTS`, `ALREADY_USED`. Every step is in EduBridge's audit log.

**Setup.** Copy `apps/pan-registry-api/.env.example` to `.env`, set `ADMIN_KEY` and `EDUBRIDGE_CLIENT_SECRET`, and put the same
secret in `PAN_REGISTRY_CLIENT_SECRET` in `apps/edubridge-api/.env`. Without SMTP settings (development), codes are printed in the
registry's console. To send real emails with Gmail set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` and a Gmail
**app password** in `SMTP_PASS`. Set `MONGODB_URI` to keep records between restarts (the registry uses its own `panregistry` database).

**Going live.** Replace the registry with a licensed PAN verification provider. Only `panClient.ts` in the EduBridge API needs to change.

## Deploying the web app on Vercel

The repository is an npm workspace. `apps/edubridge-web/vercel.json` holds the build settings, so in Vercel only set:

- **Root Directory**: `apps/edubridge-web` (keep “Include files outside the root directory” enabled; the app uses `packages/shared`)
- **Environment variable** `VITE_API_URL`: the public URL of the deployed EduBridge API, without `/api` (e.g. `https://edubridge-api.onrender.com`)

The API (Express + MongoDB) runs as a normal Node server (e.g. Render or Railway), with `NODE_ENV=production`, `MONGODB_URI`,
`JWT_ACCESS_SECRET`, `DATA_ENCRYPTION_KEY`, `CERTIFICATE_SIGNING_KEY` and `CLIENT_ORIGIN` set to the Vercel URL.

## Development phases

1. ✅ Setup, design system, landing page, authentication and roles
2. ✅ Student profile, application wizard, document upload, status tracker
3. ✅ EduVault: institutions, marksheet issuing, Ed25519 signatures, consent and sharing
4. ✅ Income and college ID verification, volunteer workspace
5. ✅ Admin review, rule-based need assessment, ML service and model evaluation
6. ✅ Sponsor matching, sponsorship management, certificates
7. ✅ Analytics dashboard, audit log explorer, security hardening
8. End-to-end tests, demo data, deployment
