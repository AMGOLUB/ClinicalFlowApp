# Add Diagnostic & Interventional Radiology Templates to ClinicalFlow

## Context

ClinicalFlow currently has 20 specialty note templates (SOAP, HPI, Problem-Oriented, DAP, BIRP, Cardiology, Orthopedics, Pediatrics, OB/GYN, Emergency, Dermatology, Neurology, Ophthalmology, 5 dental templates, Wellness/Preventive, Procedure Note, and Custom). This plan adds **two new radiology templates** — Diagnostic Radiology and Interventional Radiology — and integrates the radiology terminology dictionary into the transcription correction pipeline and term highlighting system.

**Reference file:** `docs/clinicalflow-radiology-dictionary.md` — a 2,300+ term radiology dictionary organized into 14 categories. This file must be read and used as the source for all terminology additions.

---

## Part A: New Note Templates

### Template 1: Diagnostic Radiology Report

**Template key:** `radiology_diagnostic`
**Display name:** "Diagnostic Radiology"
**Category group:** "Radiology" (new category in the template selector — sits between "Specialty" and "Preventive")

**Section headers and prompt:**

```
Use EXACTLY these section headers.

**EXAMINATION**
Type: [imaging modality and body region, e.g., "CT Abdomen and Pelvis with IV Contrast"]
Date: [use date below]
Referring Physician: [if mentioned in transcript]
Accession Number: [if mentioned]

**CLINICAL INDICATION**
[Reason for exam, relevant clinical history, specific clinical question to be answered. Include ICD-10 codes if dictated.]

**COMPARISON**
[Prior studies referenced for comparison, with dates. If none: "No prior studies available for comparison."]

**TECHNIQUE**
[Imaging protocol, contrast type/volume/route, sequences (MRI), phases (CT), scanner parameters if dictated. For CT: note if with/without contrast, single or multiphase. For MRI: list sequences obtained. For US: note transducer type if mentioned. For nuclear medicine: note radiopharmaceutical, dose, timing.]

**FINDINGS**
[Organized by anatomical region or organ system. Each finding on its own line. Use precise radiology descriptors (hypodense, hyperintense, enhancing, etc.). Include measurements in cm or mm. Reference comparison studies where applicable ("unchanged compared to [date]", "new since [date]", "interval increase/decrease"). Document normal structures explicitly when relevant to the clinical question.]

[For CT/MRI abdomen, organize by: Liver, Gallbladder/Biliary, Pancreas, Spleen, Adrenals, Kidneys/Ureters, Bladder, Reproductive organs, GI tract, Vasculature, Lymph nodes, Musculoskeletal, Other]

[For CT/MRI chest, organize by: Lungs/Airways, Pleura, Heart/Pericardium, Mediastinum/Hila, Vasculature, Chest wall/Spine, Upper abdomen (if included)]

[For CT/MRI brain, organize by: Brain parenchyma, Ventricles/CSF spaces, Extra-axial spaces, Calvarium, Orbits/Sinuses/Mastoids, Vascular (if CTA)]

[For ultrasound, organize by the specific organ(s) examined]

[For nuclear medicine/PET, organize by: Primary site of interest, Regional findings, Distant sites, Physiologic uptake]

**IMPRESSION**
[Numbered list of key findings in order of clinical significance. Each impression item should be concise and actionable. Include standardized classification scores when applicable:]
[- BI-RADS category for breast imaging]
[- LI-RADS category for liver lesions in at-risk patients]
[- PI-RADS score for prostate MRI]
[- TI-RADS category for thyroid nodules]
[- Lung-RADS category for lung cancer screening]
[- Bosniak classification for renal cysts]
[- Fleischner Society recommendation for incidental pulmonary nodules]

[Include follow-up recommendations when appropriate. State if findings were communicated as critical/emergent and to whom.]
```

**Additional prompt rules for diagnostic radiology:**
```
RADIOLOGY-SPECIFIC RULES:
1. Use standardized radiology descriptors from the findings. Never use vague terms like "abnormality" when a specific descriptor applies (e.g., "hypodense," "hyperintense," "ground-glass opacity").
2. Always include measurements for masses, nodules, collections, and aneurysms.
3. Reference comparison studies by modality and date when available.
4. For incidental findings, include the appropriate management recommendation (Fleischner, ACR, etc.).
5. Organize findings anatomically, not by clinical importance — save prioritization for the Impression.
6. The Impression should be a numbered list, most clinically significant finding first.
7. If the radiologist dictates a standardized score (BI-RADS, LI-RADS, PI-RADS, TI-RADS, Lung-RADS, Bosniak), always include it in the Impression.
8. Never fabricate measurements, comparison dates, or classification scores not stated in the transcript.
9. If the radiologist dictates critical findings communication (e.g., "results communicated to Dr. Smith by phone at 2:15 PM"), include this at the end of the Impression.
10. Document technique details exactly as dictated — do not infer contrast type, dose, or sequences.
```

---

### Template 2: Interventional Radiology Procedure Report

**Template key:** `radiology_interventional`
**Display name:** "Interventional Radiology"
**Category group:** "Radiology"

**Section headers and prompt:**

```
Use EXACTLY these section headers.

**PROCEDURE**
Name: [exact procedure name, e.g., "CT-guided percutaneous core needle biopsy of right hepatic lobe lesion"]
Date: [use date below]
Operators: [attending, fellow, resident if mentioned]
Referring Physician: [if mentioned]

**CLINICAL INDICATION**
[Reason for procedure, relevant clinical history, prior imaging findings that prompted the intervention. Include diagnosis codes if dictated.]

**CONSENT**
[Documentation of informed consent: risks discussed, alternatives offered, patient understanding confirmed. Include specific risks mentioned (bleeding, infection, pneumothorax, contrast reaction, etc.). Note if consent was obtained by a specific provider.]

**SEDATION / ANESTHESIA**
[Type: conscious sedation / moderate sedation / MAC / general anesthesia / local only]
[Medications administered with doses and route: e.g., "Midazolam 2 mg IV, Fentanyl 100 mcg IV, Lidocaine 1% 10 mL local"]
[Monitoring: continuous pulse oximetry, cardiac monitoring, BP monitoring]
[Sedation provider if different from operator]

**TECHNIQUE**
[Step-by-step procedural description as dictated. Include:]
[- Patient positioning and prep (prone, supine, lateral decubitus)]
[- Skin prep and drape (sterile technique, chlorhexidine/betadine)]
[- Access method (Seldinger technique, direct puncture, micropuncture)]
[- Imaging guidance used (CT, ultrasound, fluoroscopy, cone-beam CT)]
[- Needle/catheter/wire specifics if dictated (gauge, type, brand)]
[- Route of access (e.g., right common femoral artery, right internal jugular vein)]
[- Key procedural steps in sequence]
[- Embolic agents / devices / stents used with sizes and quantities]
[- Contrast type and volume administered]
[- Specimens obtained (number of cores, specimen handling — formalin, CytoLyt)]
[- Completion imaging / angiography findings (e.g., "post-embolization angiogram demonstrates cessation of flow")]
[- Hemostasis method (manual compression, closure device, tract embolization)]
[- Catheter/drain placement details (size, type, position, secured with suture/StatLock)]

**FINDINGS**
[Intraprocedural imaging findings:]
[- Pre-procedure imaging (target lesion appearance, measurements, access route planning)]
[- Intraprocedural findings (e.g., angiographic findings, biopsy target confirmation)]
[- Post-procedure imaging (completion angiogram, post-ablation imaging, drain positioning)]
[- Unexpected findings]

**SPECIMENS**
[If biopsy/aspiration was performed:]
[- Number and type of specimens (e.g., "4 core biopsies obtained using 18-gauge coaxial technique")]
[- Specimen destination (surgical pathology in formalin, cytology in CytoLyt)]
[- Rapid on-site evaluation (ROSE) results if performed]
[- Adequacy assessment]

**DRAINS / DEVICES**
[If a drain or device was placed:]
[- Type and size (e.g., "10 French pigtail drainage catheter")]
[- Position (e.g., "tip in the right hepatic abscess cavity")]
[- Secured with (suture, StatLock, adhesive)]
[- Immediate output (volume, character — e.g., "20 mL of purulent fluid aspirated")]
[- Connected to (gravity drainage bag, bulb suction)]

**ESTIMATED BLOOD LOSS**
[Minimal / [amount] mL / as dictated]

**COMPLICATIONS**
[None / description of any intraprocedural complications]
[If pneumothorax: size, management (observation vs chest tube)]
[If bleeding: management steps taken]

**FLUOROSCOPY / RADIATION DOSE**
[Fluoroscopy time: X minutes Y seconds]
[Dose: reference air kerma / DAP / CTDIvol / DLP as applicable]
[Number of DSA runs if applicable]

**IMPRESSION**
[Numbered summary:]
[1. Procedure performed and outcome (successful/unsuccessful/partially successful)]
[2. Key findings]
[3. Specimens sent]
[4. Drain/device details]
[5. Any complications]
[6. Recommendations and follow-up plan]

**POST-PROCEDURE ORDERS**
[Dictated post-procedure care instructions:]
[- Activity restrictions (bed rest duration, weight-bearing status)]
[- Monitoring (vital sign frequency, access site checks, drain output)]
[- Medications (antibiotics, pain management, anticoagulation hold/resume)]
[- Diet (NPO duration, advance as tolerated)]
[- Follow-up imaging (timing, modality)]
[- Drain care instructions]
[- When to call / return to ED]
```

**Additional prompt rules for interventional radiology:**
```
IR-SPECIFIC RULES:
1. Document the procedure technique in chronological order as dictated — this is the medicolegal record.
2. Always capture consent documentation including specific risks discussed.
3. Record exact medication doses for sedation (drug name, dose in mg/mcg, route).
4. Record exact device specifications if dictated (needle gauge, catheter French size, wire diameter, stent dimensions).
5. For embolization: document the embolic agent(s), sizes/quantities, and completion angiogram results.
6. For ablation: document the ablation modality, number/position of probes, ablation time, and post-ablation imaging findings.
7. For biopsy: document number of specimens, specimen handling, and ROSE results if performed.
8. Always include fluoroscopy time and radiation dose if dictated.
9. Capture estimated blood loss.
10. Document complications explicitly — if none, state "No immediate complications."
11. If the radiologist dictates post-procedure orders, capture them in full.
12. Never fabricate device specifications, medication doses, radiation doses, or specimen counts.
```

---

## Part B: Register Templates in the Codebase

### B1. Add template prompts to the note generation system

File: `src/noteGeneration.js` (or wherever the `formatPrompts` / template prompt object lives)

Add two new entries to the template prompt object:

```javascript
radiology_diagnostic: `Use EXACTLY these section headers. ...`, // Full prompt from Part A above
radiology_interventional: `Use EXACTLY these section headers. ...`, // Full prompt from Part A above
```

### B2. Add templates to the format selector dropdown

File: `src/index.html` — find the note format `<select>` or template selector UI

Add a new `<optgroup>` for Radiology between the existing specialty and preventive groups:

```html
<optgroup label="Radiology">
  <option value="radiology_diagnostic">Diagnostic Radiology</option>
  <option value="radiology_interventional">Interventional Radiology</option>
</optgroup>
```

### B3. Update template count references

The app and website reference "20 specialty templates" in multiple places. Update to "22":

Files to search and update:
- `src/index.html` — welcome wizard, settings, any template count mention
- `ClinicalFlowWebsite/index.html` — "20 specialty templates" → "22 specialty templates", update the template showcase section to add a Radiology card
- `ClinicalFlowWebsite/docs.html` — template documentation
- `ClinicalFlowWebsite/pricing.html` — feature comparison if templates are listed
- `docs/INFRASTRUCTURE.md` — template count

### B4. Add Radiology category to the template showcase on the website

File: `ClinicalFlowWebsite/index.html` — Templates section

Add a new template card between "Specialty" and "Preventive":

```html
<div class="template-card">
  <h4 class="template-card-category">Radiology</h4>
  <p class="template-card-subtitle">2 Radiology Templates</p>
  <p class="template-card-desc">Structured diagnostic reports and interventional procedure documentation with standardized classification systems (BI-RADS, LI-RADS, PI-RADS) and dose reporting.</p>
  <div class="template-card-list">
    <span>Diagnostic Radiology</span>
    <span>Interventional Radiology</span>
  </div>
</div>
```

---

## Part C: Integrate Radiology Terminology into ASR Correction Pipeline

### C1. Add radiology correction pairs to corrections.json

File: `src-tauri/resources/corrections_en.json` (English corrections file)

Read Category 11 (ASR Correction Pairs for Radiology) from `docs/clinicalflow-radiology-dictionary.md`. Add every correction pair to the existing English corrections JSON file. The format should match the existing correction pair structure in the file.

There are approximately 140 radiology-specific ASR correction pairs across these subcategories:
- Imaging modality misrecognitions (20 pairs)
- Contrast agent misrecognitions (24 pairs)
- Interventional radiology misrecognitions (28 pairs)
- Nuclear medicine misrecognitions (24 pairs)
- Findings/pathology misrecognitions (20 pairs)
- Anatomy misrecognitions (24 pairs)

**Important:** Read the existing `corrections_en.json` first to understand the exact format (key-value pairs, regex patterns, or however the correction system works). Match the format exactly. Do not duplicate corrections that already exist in the general medical dictionary.

### C2. Add radiology terms to the medical term highlighting system

File: `src/` — wherever the medical term highlighting dictionary/list lives (the system that highlights medical terms in the transcript with a different color)

Add all radiology-specific terms from the dictionary that should be highlighted in transcripts when recognized. Focus on:
- Imaging modalities (CT, MRI, ultrasound, PET, etc.)
- Contrast agent names (Omnipaque, Isovue, Gadavist, etc.)
- Key radiology findings descriptors (ground-glass opacity, consolidation, etc.)
- Procedure names (embolization, ablation, thrombectomy, etc.)
- Standardized scores (BI-RADS, LI-RADS, PI-RADS, etc.)
- Anatomy terms specific to radiology (celiac trunk, circle of Willis, etc.)
- Device and embolic agent names (Gelfoam, Onyx, coils, etc.)

Do NOT add every single abbreviation or common English word — only highlight terms that are specifically medical/radiology and would benefit from visual identification in the transcript.

### C3. Add radiology terms to the medical vocabulary conditioning prompt

File: `src-tauri/src/audio.rs` — the `MEDICAL_PROMPT` constant (or wherever the Whisper vocabulary conditioning prompt is defined)

The Whisper prompt helps bias transcription toward medical terminology. Add key radiology terms to this prompt. Keep it focused on the most commonly misrecognized terms — don't dump all 2,300 terms in (that would degrade performance). Add approximately 50-80 high-value terms:

Priority additions:
- Commonly misrecognized contrast agents: Omnipaque, Isovue, Visipaque, Gadavist, Dotarem, Eovist
- Commonly misrecognized modalities: FLAIR, STIR, DWI, MRCP, tomosynthesis
- IR terms: TIPS, TACE, TARE, embolization, cryoablation, vertebroplasty, kyphoplasty
- Findings: ground-glass opacity, honeycombing, pneumoperitoneum, pneumomediastinum
- Anatomy: celiac trunk, mesenteric, brachiocephalic, popliteal
- Scoring systems: BI-RADS, LI-RADS, PI-RADS, TI-RADS, Fleischner, Bosniak
- Devices: Gelfoam, Onyx, Glidewire, pigtail catheter, Seldinger

---

## Part D: Radiology-Specific Billing Code Support

### D1. Add radiology CPT code awareness to the coding prompt

When the note template is `radiology_diagnostic` or `radiology_interventional` AND auto-coding is enabled, the billing code generation prompt should be aware of radiology-specific code categories:

**For Diagnostic Radiology:**
- CPT codes for imaging studies (70000-79999 range — Radiology section)
- Professional component (modifier -26) vs technical component (modifier -TC)
- ICD-10 codes from the clinical indication and findings

**For Interventional Radiology:**
- CPT codes for IR procedures (36000-37799 vascular, 47000-47999 hepatobiliary, 49000-49999 abdomen, 10000-10999 integumentary biopsies, etc.)
- Imaging guidance codes (77001-77022 — fluoroscopic guidance, CT guidance, US guidance, MRI guidance)
- Moderate sedation codes (99151-99157)
- ICD-10 codes from the indication and findings
- Modifier awareness (-26, -TC, -59, -XE, -XS, -XP, -XU for distinct procedural services)
- Supervision and interpretation (S&I) code pairs

Add this context to the coding prompt when a radiology template is active. Read the existing coding prompt structure first to understand how specialty-specific code guidance is integrated.

---

## Part E: Add Radiology Dictionary as App Reference

### E1. Bundle the radiology dictionary

File: `src-tauri/resources/radiology-dictionary.json` (NEW)

Convert the key terminology from `docs/clinicalflow-radiology-dictionary.md` into a structured JSON file that the app can reference. This is used by:
- The ASR correction system (already handled by corrections.json)
- The term highlighting system
- Future autocomplete / terminology lookup features

Structure:
```json
{
  "imaging_modalities": ["CT", "MRI", "ultrasound", ...],
  "contrast_agents": [
    { "generic": "iohexol", "brand": "Omnipaque", "type": "iodinated" },
    ...
  ],
  "ir_procedures": ["embolization", "ablation", "thrombectomy", ...],
  "findings_descriptors": ["hypodense", "hyperintense", "ground-glass opacity", ...],
  "abbreviations": { "CTA": "CT angiography", "MRA": "MR angiography", ... },
  "vascular_anatomy": ["celiac trunk", "SMA", "IMA", ...],
  "devices": ["pigtail catheter", "Glidewire", "Gelfoam", ...],
  "scoring_systems": {
    "BI-RADS": { "0": "Incomplete", "1": "Negative", ... },
    "LI-RADS": { "LR-1": "Definitely benign", ... },
    ...
  }
}
```

This JSON becomes a resource file bundled with the app, accessible via `app.path().resource_dir()`.

---

## Implementation Order

### Phase 1: Templates (Core Feature)
1. Read the existing template prompt object to understand the format
2. Add `radiology_diagnostic` and `radiology_interventional` prompt strings
3. Add Radiology optgroup to the template selector UI
4. Test: select each template, generate a note from a sample radiology transcript
5. Update template counts on website and docs

### Phase 2: ASR Corrections & Highlighting
6. Read existing `corrections_en.json` format
7. Add ~140 radiology ASR correction pairs
8. Read existing term highlighting dictionary
9. Add radiology terms to highlighting
10. Add key radiology terms to the Whisper MEDICAL_PROMPT
11. Test: record/transcribe radiology dictation, verify corrections fire and terms highlight

### Phase 3: Billing Codes
12. Read existing coding prompt structure
13. Add radiology-specific CPT/ICD-10 context for both templates
14. Test: generate a diagnostic radiology note with coding enabled, verify appropriate CPT codes

### Phase 4: Dictionary Bundle
15. Create `radiology-dictionary.json` from the markdown source
16. Bundle in resources
17. Test: verify file loads from resource directory

---

## Files Summary

| File | Action | Change |
|------|--------|--------|
| `src/noteGeneration.js` (or equivalent) | MODIFY | Add 2 radiology template prompts |
| `src/index.html` | MODIFY | Add Radiology optgroup in template selector |
| `src-tauri/resources/corrections_en.json` | MODIFY | Add ~140 radiology ASR correction pairs |
| `src-tauri/resources/radiology-dictionary.json` | CREATE | Structured radiology terminology JSON |
| `src-tauri/src/audio.rs` | MODIFY | Add ~50-80 radiology terms to MEDICAL_PROMPT |
| `src/` (highlighting module) | MODIFY | Add radiology terms to transcript highlighting |
| `src/` (coding prompt) | MODIFY | Add radiology CPT/ICD-10 context |
| `ClinicalFlowWebsite/index.html` | MODIFY | Update template count to 22, add Radiology card |
| `ClinicalFlowWebsite/docs.html` | MODIFY | Add radiology template documentation |
| `docs/INFRASTRUCTURE.md` | MODIFY | Update template count |

---

## Reference: Radiology Dictionary Source

The complete radiology terminology dictionary is located at:
```
docs/clinicalflow-radiology-dictionary.md
```

This file contains 2,300+ terms across 14 categories:
1. Imaging Modalities & Techniques (~330 terms)
2. Contrast Agents & Radiopharmaceuticals (~145 terms)
3. Interventional Radiology Procedures (~275 procedures)
4. Radiology Findings & Descriptors (~340 terms)
5. Standardized Reporting Systems — BI-RADS, LI-RADS, PI-RADS, TI-RADS, Lung-RADS, Fleischner, Bosniak, RECIST (~100 categories)
6. Radiology Abbreviations (~200 abbreviations)
7. Radiology-Specific Vascular Anatomy (~125 vessels)
8. Embolic Agents & IR Medications (~75 agents)
9. Report Structure & Standard Phrases (~80 phrases)
10. Equipment & Technology Terms (~110 terms)
11. ASR Correction Pairs (~140 pairs) — **USE THESE FOR corrections_en.json**
12. IR Devices, Hardware & Tool Brands (~250 devices + 27 manufacturers)
13. Pathology & Specimen Handling (~50 terms)
14. Additional Normal-Findings & Report Phrases (~75 phrases)

**Read this file in full before implementing.** It is the single source of truth for all radiology terminology additions.

**Cross-platform note:** All changes are cross-platform. No platform-specific code is involved — template prompts, corrections JSON, highlighting, and resource files are shared across macOS and Windows builds. The `radiology-dictionary.json` resource file is platform-agnostic and resolves via `app.path().resource_dir()` on both platforms.

---

## Verification

- [ ] Template selector shows "Radiology" category with Diagnostic and Interventional options
- [ ] Diagnostic Radiology template generates a properly structured report with Examination, Clinical Indication, Comparison, Technique, Findings (organized anatomically), and Impression sections
- [ ] Interventional Radiology template generates a procedure report with all required sections including Consent, Sedation, Technique, Findings, Specimens, Drains, Complications, Dose, and Post-Procedure Orders
- [ ] Radiology ASR corrections fire during transcription (test: dictate "omni pock" → should correct to "Omnipaque")
- [ ] Radiology terms highlight in transcript (test: "ground-glass opacity" should be highlighted)
- [ ] Whisper recognizes key radiology terms with improved accuracy (test with vocabulary conditioning)
- [ ] Billing codes generated for diagnostic radiology include appropriate CPT radiology codes (70000-79999)
- [ ] Billing codes for IR include procedure + guidance + sedation codes
- [ ] Website template count updated to 22
- [ ] Website template showcase includes Radiology card
- [ ] Docs page documents both new templates
- [ ] `radiology-dictionary.json` loads from resource directory without error
- [ ] Template count in INFRASTRUCTURE.md updated
- [ ] macOS build succeeds with all changes
- [ ] Windows build succeeds with all changes (GitHub Actions workflow or local Windows build)
