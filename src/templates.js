/* ============================================================
   CLINICALFLOW — Template Definitions & Medical Coding Prompt
   ============================================================ */

/* ── Template Categories (UI grouping order) ── */

export const TEMPLATE_CATEGORIES=[
  {id:'general',label:'General'},
  {id:'behavioral',label:'Behavioral Health'},
  {id:'specialty',label:'Specialty'},
  {id:'dental',label:'Dental'},
  {id:'custom',label:'My Templates'}
];

/* ── Built-in Templates ── */

export const TEMPLATES={

  /* ─── General ─── */

  soap:{
    id:'soap',
    label:'SOAP Notes',
    description:'Subjective, Objective, Assessment, Plan',
    category:'general',
    sections:['Subjective','Objective','Assessment','Plan'],
    noteTitle:'SOAP Note',
    prompt:`Output ONLY these four top-level sections: SUBJECTIVE, OBJECTIVE, ASSESSMENT, PLAN. Do not add any other top-level headers (no 'CLINICAL NOTE', no 'HPI:' as a separate header). Use **HEADER** markers for each section header exactly as shown below. Within section body text, use plain text with bullet points — no markdown bold, no horizontal rules, no extra delimiters.
Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**SUBJECTIVE**
Chief Complaint: [ALL problems discussed, separated by semicolons]
HPI: [For EACH problem: onset, duration, location, character, severity, aggravating/alleviating factors. Include all patient-reported numbers.]
Associated Symptoms: [Symptoms the patient confirmed or volunteered]
Pertinent Negatives: [ONLY symptoms the doctor specifically asked about AND the patient explicitly denied]
Current Medications: [Meds patient was already taking BEFORE this visit, with doses]
Allergies:
Family/Social History:

**OBJECTIVE**
Vital Signs: [Every vital sign stated by any speaker, with exact numbers and units]
Physical Examination: [Every exam finding stated by the doctor. Only include body systems actually examined.]

**ASSESSMENT**
[ONLY diagnoses the doctor explicitly stated or discussed as impressions. Do not infer new diagnoses from objective findings alone.]

**PLAN**
Medications Continued: [Meds kept the same, with doses]
New Medications Started: [Meds prescribed for the first time at THIS visit — name, dose, frequency, instructions. Include OTC medications the doctor recommended.]
Medications Discontinued: [Meds stopped, with reason]
Medications Adjusted: [Dose changes — old dose to new dose]
Labs/Tests Ordered: [All ordered]
Referrals: [Specialty and provider name if given]
Procedures Performed:
Follow-Up: [Exact timeframe as stated]
Patient Education: [ONLY what the doctor actually said]
Safety Net: [ONLY if the doctor stated specific warning signs]`
  },

  hpi:{
    id:'hpi',
    label:'HPI-Focused',
    description:'History of Present Illness emphasis',
    category:'general',
    sections:['Patient Demographics','Chief Complaint','History of Present Illness','Review of Systems','Physical Examination','Assessment & Plan'],
    noteTitle:'HPI-Focused Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**PATIENT DEMOGRAPHICS**
Visit Date: [use date below]
Duration: [use duration below]
Participants: [use speakers below]

**CHIEF COMPLAINT**
[All reasons for the visit]

**HISTORY OF PRESENT ILLNESS**
[Narrative for each problem: onset, location, duration, character, severity, timing, context, modifying factors, associated symptoms. Include patient-reported numbers.]

**REVIEW OF SYSTEMS**
[Only include body systems that were actually discussed. For each, list positive and negative findings. Do not list systems that were never mentioned.]

**PHYSICAL EXAMINATION**
Vital Signs: [exact numbers with units]
[All exam findings by body area. Only include systems actually examined.]

**ASSESSMENT & PLAN**
[For each problem: diagnosis, treatment, medications, labs, referrals, follow-up]`
  },

  problem:{
    id:'problem',
    label:'Problem-Oriented',
    description:'Organized by clinical problem',
    category:'general',
    sections:['Visit Overview','Problem 1','Medications Summary','Follow-Up'],
    noteTitle:'Problem-Oriented Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**VISIT OVERVIEW**
Date: [use date below] | Duration: [use duration below]
Participants: [use speakers below]
Chief Complaint: [all reasons for visit]

[Create a numbered section for EACH distinct problem discussed:]

**PROBLEM 1: [Name]**
Subjective: [patient-reported symptoms, history, pertinent negatives]
Objective: [relevant exam findings]
Assessment: [diagnosis/impression]
Plan: [treatment, medications, labs, referrals, follow-up]

[Add more problems as needed]

**MEDICATIONS SUMMARY**
Continued: [name, dose]
New: [name, dose, frequency]
Discontinued: [name, reason]
Adjusted: [name, old dose to new dose]

**FOLLOW-UP**
[Return timeframe and instructions as stated by provider]`
  },

  /* ─── Behavioral Health ─── */

  dap:{
    id:'dap',
    label:'DAP Note (Psychiatry)',
    description:'Data, Assessment, Plan',
    category:'behavioral',
    sections:['Data','Assessment','Plan'],
    noteTitle:'DAP Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**DATA**
Presenting Concerns: [All issues the patient discussed]
Mood/Affect: [Patient's reported mood AND observed affect if described]
Mental Status Observations: [Orientation, thought process, speech, cognition — only what was observed or tested]
Symptoms: [All psychiatric symptoms discussed: sleep, appetite, energy, concentration, motivation, anxiety, mood episodes, psychotic symptoms, etc.]
Risk Assessment: [Any mention of self-harm, suicidal ideation, homicidal ideation, substance use. If discussed, include exact patient statements. If safety screening was done, include results.]
Medications: [Current psychotropic medications with doses and adherence. Any side effects reported.]
Substance Use: [Current use, changes, sobriety status — only if discussed]
Psychosocial: [Housing, employment, relationships, stressors, support systems — only if discussed]

**ASSESSMENT**
[Clinical impressions based on data. Diagnostic considerations. Functional status. Progress toward treatment goals. Severity and acuity assessment.]

**PLAN**
Medication Changes: [New, adjusted, continued, discontinued — with doses]
Therapy Plan: [Type, focus areas, interventions to continue]
Safety Plan: [Only if safety concerns were identified]
Referrals: [Any referrals discussed]
Follow-Up: [Next appointment timeframe]`
  },

  birp:{
    id:'birp',
    label:'BIRP Note (Behavioral)',
    description:'Behavior, Intervention, Response, Plan',
    category:'behavioral',
    sections:['Behavior','Intervention','Response','Plan'],
    noteTitle:'BIRP Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**BEHAVIOR**
Presenting Behavior: [Observable behaviors, affect, appearance, demeanor]
Reported Symptoms: [Patient's subjective complaints and concerns]
Mood: [Patient-reported mood state]
Risk Indicators: [Any safety concerns, substance use, self-harm — only if discussed]
Functional Status: [ADLs, work, social functioning — only if discussed]

**INTERVENTION**
Therapeutic Approach: [Type of therapy used: CBT, DBT, MI, psychodynamic, etc.]
Techniques Applied: [Specific interventions: cognitive restructuring, behavioral activation, exposure, grounding, role-play, psychoeducation, etc.]
Topics Addressed: [Key themes and issues discussed in session]
Skills Practiced: [Any coping skills, mindfulness, or behavioral strategies practiced]

**RESPONSE**
Patient Engagement: [Level of participation, receptiveness, insight]
Emotional Response: [How patient responded to interventions]
Progress: [Movement toward or away from treatment goals]
Barriers: [Any obstacles to progress identified]

**PLAN**
Homework/Tasks: [Between-session assignments]
Goals for Next Session: [Focus areas]
Medication: [Any medication-related discussion or changes]
Safety Plan: [Only if indicated]
Follow-Up: [Next appointment timeframe]`
  },

  /* ─── Specialty ─── */

  cardiology:{
    id:'cardiology',
    label:'Cardiology',
    description:'Cardiac history, exam, diagnostics, plan',
    category:'specialty',
    sections:['Cardiac History','Cardiovascular Examination','Diagnostics','Assessment','Plan'],
    noteTitle:'Cardiology Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**CARDIAC HISTORY**
Chief Complaint: [Cardiac-specific symptoms: chest pain, dyspnea, palpitations, syncope, edema, etc.]
HPI: [Onset, duration, character, severity, exertional vs rest, radiation, associated symptoms. Include NYHA class if discussed.]
Cardiac Risk Factors: [HTN, DM, hyperlipidemia, smoking, family history of CAD, obesity — only if discussed]
Cardiac History: [Prior MI, CABG, PCI, valve disease, arrhythmias, CHF, devices — only if discussed]
Current Medications: [Cardiac medications with doses: antihypertensives, antiarrhythmics, anticoagulants, antiplatelets, statins, etc.]

**CARDIOVASCULAR EXAMINATION**
Vital Signs: [BP (both arms if mentioned), HR, RR, SpO2, weight]
Heart: [Rate, rhythm, S1/S2, murmurs (grade, location, radiation), gallops, rubs]
Lungs: [Crackles, wheezing, decreased breath sounds]
Vascular: [JVD, carotid bruits, peripheral pulses, edema (grade, distribution)]
Abdomen: [Hepatomegaly, ascites — only if examined]

**DIAGNOSTICS**
ECG/EKG: [Rhythm, rate, intervals, axis, ST changes, other findings — only if reviewed]
Echocardiogram: [EF, wall motion, valve function, chamber sizes — only if reviewed]
Labs: [Troponin, BNP, lipid panel, INR, etc. — only if discussed]
Other Studies: [Stress test, cath, Holter, CT angiography — only if discussed]

**ASSESSMENT**
[Cardiac diagnoses and clinical impressions. Include severity and acuity.]

**PLAN**
Medication Changes: [With doses]
Procedures: [Scheduled or recommended]
Lifestyle Modifications: [Diet, exercise, smoking cessation — only if discussed]
Device Management: [Pacemaker/ICD — only if discussed]
Referrals:
Follow-Up: [Timeframe and any interval testing]`
  },

  orthopedics:{
    id:'orthopedics',
    label:'Orthopedics',
    description:'MSK history, exam, imaging, plan',
    category:'specialty',
    sections:['History','Musculoskeletal Examination','Imaging','Assessment','Plan'],
    noteTitle:'Orthopedics Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**HISTORY**
Chief Complaint: [Joint/body region, side (L/R), mechanism of injury or onset]
HPI: [Onset, duration, mechanism, pain character (sharp/dull/aching), severity (scale), aggravating/alleviating factors, functional limitations]
Prior Treatment: [PT, injections, bracing, surgery — only if discussed]
Surgical History: [Relevant orthopedic surgeries — only if discussed]
Current Medications: [Pain medications, anti-inflammatories, muscle relaxants with doses]

**MUSCULOSKELETAL EXAMINATION**
Inspection: [Swelling, deformity, erythema, atrophy, alignment, gait]
Palpation: [Point tenderness, effusion, warmth, crepitus]
Range of Motion: [Active and passive ROM for affected joint(s) — degrees if stated]
Strength: [Manual muscle testing, grade if stated]
Special Tests: [Lachman, McMurray, drawer, impingement, Tinel, Phalen, etc. — name and result]
Neurovascular: [Sensation, pulses, reflexes — only if tested]

**IMAGING**
[X-ray, MRI, CT, ultrasound findings — only if reviewed during visit. Include specific findings: fractures, joint space, alignment, soft tissue]

**ASSESSMENT**
[Diagnosis with laterality, severity, chronicity]

**PLAN**
Activity Modifications: [Weight-bearing status, restrictions, bracing]
Medications: [Pain management changes]
Physical Therapy: [Referral, frequency, focus]
Injections: [Type, location — only if performed or planned]
Surgery: [Discussed, recommended, or scheduled — only if applicable]
Follow-Up: [Timeframe and repeat imaging if planned]`
  },

  pediatrics:{
    id:'pediatrics',
    label:'Pediatrics',
    description:'Growth, development, history, exam, plan',
    category:'specialty',
    sections:['Growth & Development','History','Physical Examination','Assessment','Plan'],
    noteTitle:'Pediatrics Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**GROWTH & DEVELOPMENT**
Age: [Exact age in years/months]
Growth Parameters: [Weight, height/length, head circumference, BMI — with percentiles if stated]
Developmental Milestones: [Gross motor, fine motor, language, social — only milestones actually discussed]
Immunizations: [Status discussed, vaccines given or due — only if discussed]
Nutrition: [Feeding type, diet, appetite — only if discussed]

**HISTORY**
Chief Complaint: [Reason for visit — illness, well-child, concern]
HPI: [Symptom details with duration. For infants: feeding, output, activity level changes]
Birth History: [Gestational age, delivery, complications — only if discussed]
Past Medical History: [Relevant conditions — only if discussed]
Medications: [Current medications with weight-based doses]
Allergies:
Family History: [Relevant — only if discussed]
Social History: [School, daycare, home environment — only if discussed]

**PHYSICAL EXAMINATION**
Vital Signs: [Temp, HR, RR, BP (if applicable), SpO2, weight]
General: [Appearance, activity, interaction, distress level]
HEENT: [Fontanelles (if infant), TMs, throat, dentition — only systems examined]
Lungs: [Breath sounds, work of breathing]
Heart: [Rate, rhythm, murmurs]
Abdomen: [Soft/tender, organomegaly, bowel sounds]
Skin: [Rashes, lesions — only if examined]
Neurological: [Tone, reflexes, gait — only if examined]

**ASSESSMENT**
[Diagnoses with developmental context. Well-child vs acute visit impression.]

**PLAN**
Medications: [Weight-based dosing, formulation (liquid, chewable), duration]
Immunizations Given: [Vaccines administered — only if given]
Anticipatory Guidance: [Safety, nutrition, development counseling — only if provided]
Referrals:
Follow-Up: [Next well-child visit or return timeframe]`
  },

  obgyn:{
    id:'obgyn',
    label:'OB/GYN',
    description:'OB/GYN history, exam, labs, plan',
    category:'specialty',
    sections:['OB/GYN History','Physical Examination','Labs & Studies','Assessment','Plan'],
    noteTitle:'OB/GYN Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**OB/GYN HISTORY**
Chief Complaint: [Reason for visit — prenatal, gynecologic concern, well-woman]
HPI: [Symptom details, menstrual history, sexual history — only what was discussed]
Obstetric History: [Gravida/Para, prior deliveries, complications — only if discussed]
Menstrual History: [LMP, cycle regularity, flow, dysmenorrhea — only if discussed]
Gynecologic History: [Prior surgeries, abnormal Paps, STIs, contraception — only if discussed]
Current Medications: [Including prenatal vitamins, hormonal contraception, with doses]
Allergies:

**PHYSICAL EXAMINATION**
Vital Signs: [BP, weight, HR — include fundal height and fetal heart rate if prenatal]
Abdominal: [Fundal height, tenderness, uterine size — only if examined]
Pelvic/Speculum: [Cervical appearance, discharge, lesions — only if performed]
Bimanual: [Uterine size, adnexal tenderness/masses — only if performed]
Breast: [Exam findings — only if performed]

**LABS & STUDIES**
Prenatal Labs: [Blood type, CBC, glucose, GBS, etc. — only if reviewed]
Cervical Screening: [Pap, HPV — only if performed or reviewed]
Ultrasound: [Gestational age, fetal measurements, placenta, fluid — only if performed]
Other: [STI testing, urinalysis, cultures — only if ordered or reviewed]

**ASSESSMENT**
[OB: gestational age, complications, fetal status. GYN: diagnosis/impression. Include risk stratification if discussed.]

**PLAN**
Medications: [Prenatal vitamins, tocolytics, antibiotics, hormonal therapy — with doses]
Procedures: [Scheduled or performed — IUD, biopsy, surgery, etc.]
Patient Education: [Precautions, warning signs — only if discussed]
Referrals:
Follow-Up: [Next prenatal visit or GYN follow-up timeframe]`
  },

  emergency:{
    id:'emergency',
    label:'Emergency / Urgent Care',
    description:'Triage, HPI, exam, MDM, disposition',
    category:'specialty',
    sections:['Triage','History of Present Illness','Physical Examination','Medical Decision Making','Disposition'],
    noteTitle:'Emergency Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**TRIAGE**
Chief Complaint: [Brief presenting complaint]
Acuity: [ESI level if stated or implied by urgency of presentation]
Vital Signs: [All initial vitals with exact numbers]
Allergies: [Only if discussed]

**HISTORY OF PRESENT ILLNESS**
[Detailed narrative: onset, timing, quality, severity, context, modifying factors, associated symptoms. Include mechanism of injury for trauma. Include time course (sudden vs gradual). Include prior episodes.]
Past Medical History: [Relevant — only if discussed]
Medications: [Current medications — only if discussed]
Social History: [Alcohol, drugs, tobacco — only if discussed]

**PHYSICAL EXAMINATION**
General: [Appearance, distress level, GCS if stated]
[Document each body system examined. For trauma: systematic head-to-toe. Use only systems actually examined.]

**MEDICAL DECISION MAKING**
Data Reviewed: [Labs, imaging, EKG results — with specific values]
Differential Diagnosis: [Conditions considered]
Clinical Reasoning: [Why certain diagnoses were favored or excluded]
Risk Assessment: [Acuity, morbidity/mortality considerations if discussed]
Procedures: [Any procedures performed: IV, splinting, laceration repair, intubation, etc.]

**DISPOSITION**
Diagnosis: [Final ED diagnosis/impression]
Disposition: [Admitted (to what service/level), discharged, transferred, AMA]
Medications Prescribed: [Name, dose, quantity, duration]
Discharge Instructions: [Activity, diet, wound care, warning signs — only if stated]
Follow-Up: [With whom, timeframe]`
  },

  dermatology:{
    id:'dermatology',
    label:'Dermatology',
    description:'Lesion description, distribution, assessment, plan',
    category:'specialty',
    sections:['History','Lesion Description','Assessment','Plan'],
    noteTitle:'Dermatology Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**HISTORY**
Chief Complaint: [Skin concern(s) — description, location, duration]
HPI: [Onset, evolution over time, symptoms (pruritus, pain, burning), triggers, prior treatments and response, associated symptoms]
Skin History: [Prior skin conditions, biopsies, skin cancer history — only if discussed]
Medications: [Topical and systemic medications, recent antibiotics — only if discussed]
Allergies:
Family History: [Skin conditions, melanoma — only if discussed]
Sun Exposure: [History, sunscreen use, tanning — only if discussed]

**LESION DESCRIPTION**
[For EACH lesion or area discussed:]
Location: [Anatomic site, laterality, distribution pattern (localized, generalized, dermatomal, sun-exposed)]
Morphology: [Primary lesion type: macule, papule, plaque, nodule, vesicle, bulla, pustule, patch, tumor, wheal]
Characteristics: [Color, size (cm), shape, border (well-defined, irregular), surface (smooth, scaly, crusted, ulcerated)]
Secondary Changes: [Excoriation, lichenification, scarring, hyperpigmentation — only if noted]
Distribution Pattern: [Symmetric, unilateral, grouped, linear, annular — if noted]

**ASSESSMENT**
[Diagnosis or differential for each lesion. Include clinical reasoning for diagnosis.]

**PLAN**
Topical Therapy: [Medication, strength, vehicle (cream/ointment/solution), application instructions, duration]
Systemic Therapy: [Oral/injectable medications — only if prescribed]
Procedures: [Biopsy (type: shave, punch, excisional), cryotherapy, excision, Mohs — only if performed or planned]
Sun Protection: [Counseling — only if discussed]
Follow-Up: [Timeframe, biopsy result review if applicable]`
  },

  neurology:{
    id:'neurology',
    label:'Neurology',
    description:'History, neuro exam, cognitive testing, assessment, plan',
    category:'specialty',
    sections:['Neurological History','Neurological Examination','Diagnostic Studies','Assessment','Plan'],
    noteTitle:'Neurology Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**NEUROLOGICAL HISTORY**
Chief Complaint: [Neurological symptom(s): headache, weakness, numbness, seizure, memory loss, tremor, etc.]
HPI: [Onset (sudden vs gradual), duration, progression, laterality, aggravating/alleviating factors, associated symptoms. For headache: location, quality, frequency, aura, triggers. For seizure: type, duration, frequency, aura, postictal state.]
Neurological History: [Prior strokes, seizures, head injury, MS, Parkinson's, neuropathy — only if discussed]
Medications: [Current neurological medications with doses]
Family History: [Neurological conditions — only if discussed]
Social History: [Occupation, handedness, functional status — only if discussed]

**NEUROLOGICAL EXAMINATION**
Mental Status: [Alert/oriented, GCS, attention, language, memory — only components tested]
Cranial Nerves: [List each nerve tested with findings. Do not list nerves not examined.]
Motor: [Tone, bulk, strength by muscle group (MRC scale if used), pronator drift, fasciculations]
Sensory: [Light touch, pinprick, vibration, proprioception, temperature — by distribution, only modalities tested]
Reflexes: [DTRs with grades, Babinski, Hoffmann — only if tested]
Coordination: [Finger-to-nose, heel-to-shin, rapid alternating movements, dysmetria]
Gait: [Regular, tandem, Romberg — only if tested]

**DIAGNOSTIC STUDIES**
[MRI, CT, EEG, EMG/NCS, lumbar puncture results — only if reviewed or ordered. Include specific findings.]

**ASSESSMENT**
[Neurological diagnosis/impression. Localization (cortical, subcortical, brainstem, spinal, peripheral, NMJ). Acuity and severity.]

**PLAN**
Medications: [Antiepileptics, disease-modifying therapies, pain management — with doses]
Studies Ordered: [Imaging, EEG, labs, nerve studies]
Therapy: [PT, OT, speech — only if discussed]
Referrals:
Driving/Safety: [Restrictions — only if discussed]
Follow-Up: [Timeframe]`
  },

  ophthalmology:{
    id:'ophthalmology',
    label:'Ophthalmology',
    description:'Visual acuity, slit lamp, fundoscopy, plan',
    category:'specialty',
    sections:['Ophthalmic History','Examination','Assessment','Plan'],
    noteTitle:'Ophthalmology Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**OPHTHALMIC HISTORY**
Chief Complaint: [Visual symptom(s) — decreased vision, flashes, floaters, pain, redness, discharge, double vision, etc.]
HPI: [Onset, duration, laterality (OD/OS/OU), progression, associated symptoms. Pain character if present.]
Ocular History: [Prior surgeries (cataract, LASIK, retinal), glaucoma, macular degeneration, diabetic retinopathy — only if discussed]
Medications: [Eye drops with frequency, systemic medications affecting eyes — only if discussed]
Allergies:

**EXAMINATION**
Visual Acuity: [OD and OS — distance and near, with/without correction, pinhole if tested]
Pupils: [Size, reactivity, RAPD (Marcus Gunn) — only if tested]
Extraocular Movements: [Full or restricted, diplopia in gaze positions — only if tested]
Intraocular Pressure: [OD and OS, method (Goldmann, Tonopen, NCT) — only if measured]
External/Lids: [Lid position, lesions, proptosis — only if examined]
Slit Lamp:
  Conjunctiva: [Injection, chemosis, discharge]
  Cornea: [Clarity, edema, staining, infiltrate, dystrophy]
  Anterior Chamber: [Depth, cell/flare, hyphema]
  Iris: [Synechiae, neovascularization, transillumination defects]
  Lens: [Clarity, cataract grade, IOL status]
[Only include slit lamp components actually examined]
Fundoscopy:
  Optic Disc: [C/D ratio, pallor, swelling, neovascularization]
  Macula: [Drusen, edema, hemorrhage, RPE changes]
  Vessels: [AV nicking, hemorrhages, neovascularization]
  Periphery: [Tears, detachment, lattice, lesions]
[Only include fundoscopy if performed]

**ASSESSMENT**
[Diagnosis by eye (OD/OS). Include severity and laterality.]

**PLAN**
Medications: [Eye drops — name, concentration, frequency, duration, per eye]
Procedures: [Laser, injection, surgery — only if performed or planned]
Referrals: [Retina, oculoplastics, etc. — only if discussed]
Follow-Up: [Timeframe, testing at next visit]`
  },

  wellness:{
    id:'wellness',
    label:'Preventive / Wellness',
    description:'Screening, preventive care, counseling',
    category:'specialty',
    sections:['Preventive Health','Health Screening','Physical Examination','Counseling & Education','Plan'],
    noteTitle:'Wellness Visit Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**PREVENTIVE HEALTH**
Visit Type: [Annual wellness, Medicare wellness, routine physical]
Health Maintenance: [Immunization status, cancer screenings due/completed — only if discussed]
Active Medical Conditions: [Chronic conditions reviewed — only if discussed]
Current Medications: [Full medication list with doses — only if reviewed]
Allergies:
Family History: [Relevant conditions — only if discussed]
Social History: [Tobacco, alcohol, drugs, exercise, diet, occupation, relationships, safety — only topics discussed]

**HEALTH SCREENING**
Depression Screening: [PHQ-2/PHQ-9 score — only if administered]
Cognitive Screening: [MMSE, MoCA — only if administered]
Fall Risk: [Assessment — only if performed]
Cancer Screening: [Colonoscopy, mammogram, Pap, PSA, lung CT — status of each discussed]
Cardiovascular Risk: [ASCVD score, lipid panel — only if discussed]
Diabetes Screening: [A1c, fasting glucose — only if discussed]
Other Screening: [STI, hepatitis, osteoporosis — only if discussed]

**PHYSICAL EXAMINATION**
Vital Signs: [BP, HR, weight, BMI, height]
[Comprehensive exam by system — only systems actually examined]

**COUNSELING & EDUCATION**
[Topics actually discussed: diet, exercise, tobacco cessation, alcohol moderation, sun protection, immunizations, fall prevention, advance directives, etc.]

**PLAN**
Immunizations: [Administered or recommended]
Screenings Ordered: [Labs, imaging, referrals for screening]
Medication Changes: [Adjustments to chronic medications]
Referrals:
Follow-Up: [Next wellness visit timeframe]`
  },

  procedure:{
    id:'procedure',
    label:'Procedure Note',
    description:'Indication, procedure, findings, plan',
    category:'specialty',
    sections:['Pre-Procedure','Procedure','Findings','Post-Procedure'],
    noteTitle:'Procedure Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**PRE-PROCEDURE**
Procedure: [Name of procedure performed]
Indication: [Clinical reason for the procedure]
Consent: [Consent obtained, risks/benefits discussed — only if mentioned]
Pre-Procedure Assessment: [Relevant vitals, labs, allergies, medications held — only if discussed]
Anesthesia: [Type: local, regional, sedation, general — only if discussed]
Timeout: [Patient identification, site marking, laterality confirmed — only if mentioned]

**PROCEDURE**
Technique: [Step-by-step description of what was done, in the order performed]
Site: [Anatomic location, laterality]
Equipment: [Specific instruments, implants, catheters, suture types — only if mentioned]
Medications Given: [Local anesthetic, sedation, prophylactic antibiotics — with doses if stated]
Estimated Blood Loss: [Only if stated]
Specimens: [Tissue sent to pathology, cultures obtained — only if mentioned]

**FINDINGS**
[Intra-procedure findings: normal anatomy, pathology identified, measurements, visualization quality]

**POST-PROCEDURE**
Condition: [Patient's condition after procedure]
Complications: [Any immediate complications. If none mentioned, omit this line.]
Instructions: [Activity restrictions, wound care, medication changes — only if discussed]
Follow-Up: [Pathology review timeline, next appointment, warning signs — only if discussed]`
  },

  /* ─── Dental ─── */

  dental_general:{
    id:'dental_general',label:'General Dental Exam',description:'Comprehensive dental examination note',category:'dental',
    sections:['Chief Complaint','Dental History','Extraoral Examination','Intraoral Examination','Radiographic Findings','Dental Chart Findings','Assessment','Treatment Plan'],
    noteTitle:'Dental Examination Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**CHIEF COMPLAINT**
[Reason for dental visit — pain, routine exam, cosmetic concern, follow-up]

**DENTAL HISTORY**
Last Dental Visit: [Date or timeframe if mentioned]
Dental Hygiene: [Brushing, flossing, mouthwash — only if discussed]
Previous Dental Work: [Fillings, crowns, extractions, orthodontics — only if discussed]
Relevant Medical History: [Conditions affecting dental care — bleeding disorders, bisphosphonates, diabetes, radiation — only if discussed]
Current Medications: [Especially anticoagulants, bisphosphonates — only if discussed]
Allergies: [Latex, local anesthetics, metals — only if discussed]

**EXTRAORAL EXAMINATION**
TMJ: [Click, crepitus, deviation, limited opening — only if examined]
Lymph Nodes: [Cervical, submandibular — only if palpated]
Facial Symmetry: [Only if noted]

**INTRAORAL EXAMINATION**
Soft Tissue: [Oral mucosa, tongue, floor of mouth, palate — only examined areas]
Gingiva: [Color, texture, bleeding on probing, recession — only if examined]
Occlusion: [Class, crossbite, open bite — only if assessed]
Existing Restorations: [Condition of existing work — only if examined]

**RADIOGRAPHIC FINDINGS**
[Periapical, bitewing, panoramic findings with specific tooth numbers — only if taken/reviewed]

**DENTAL CHART FINDINGS**
{{DENTAL_CHART}}

**ASSESSMENT**
[Diagnoses by tooth number. Caries classification, periodontal status. Pay close attention to the specific tooth surfaces listed in the Dental Chart Findings above — surface involvement (e.g., MOD vs O) directly affects diagnosis coding and treatment planning.]

**TREATMENT PLAN**
Immediate: [Urgent needs — pain, infection, fracture]
Restorative: [Fillings, crowns — with tooth numbers AND specific surfaces from the chart data]
Periodontal: [Scaling, root planing — only if indicated]
Prosthetic: [Dentures, implants — only if discussed]
Preventive: [Fluoride, sealants, hygiene instructions — only if discussed]
Referrals: [Oral surgery, endodontics, orthodontics, periodontics]
Follow-Up: [Next appointment timeframe and reason]`
  },

  dental_periodontal:{
    id:'dental_periodontal',label:'Periodontal Exam',description:'Periodontal assessment and treatment note',category:'dental',
    sections:['Chief Complaint','Periodontal History','Periodontal Examination','Radiographic Findings','Dental Chart Findings','Assessment','Treatment Plan'],
    noteTitle:'Periodontal Examination Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**CHIEF COMPLAINT**
[Reason for periodontal visit — bleeding gums, loose teeth, referral for perio evaluation, maintenance]

**PERIODONTAL HISTORY**
Previous Periodontal Treatment: [SRP, surgery, maintenance schedule — only if discussed]
Risk Factors: [Smoking, diabetes, family history, medications (calcium channel blockers, phenytoin, cyclosporine) — only if discussed]
Relevant Medical History: [Diabetes control, immunosuppression, bisphosphonate use, anticoagulants — only if discussed]
Current Medications: [Especially those affecting gingiva or bleeding — only if discussed]
Allergies: [Only if discussed]

**PERIODONTAL EXAMINATION**
Probing Depths: [By tooth/site — record depths ≥4mm with specific locations]
Clinical Attachment Loss: [Sites with significant loss — only if measured]
Bleeding on Probing: [Sites/percentage — only if recorded]
Gingival Recession: [Sites and measurements — only if noted]
Furcation Involvement: [Tooth numbers and classification (I, II, III) — only if assessed]
Mobility: [Tooth numbers and grade (I, II, III) — only if assessed]
Mucogingival Defects: [Inadequate attached gingiva — only if noted]
Plaque/Calculus: [Distribution and severity — only if assessed]
Suppuration: [Sites — only if noted]

**RADIOGRAPHIC FINDINGS**
[Bone loss pattern (horizontal, vertical/angular), bone level relative to CEJ, furcation radiolucencies — with specific tooth numbers. Only if taken/reviewed]

**DENTAL CHART FINDINGS**
{{DENTAL_CHART}}

**ASSESSMENT**
[Periodontal diagnosis per AAP/EFP classification: Stage (I-IV), Grade (A-C). Localized vs generalized. Specific teeth with guarded or hopeless prognosis. Pay close attention to the Dental Chart Findings above for tooth-specific conditions.]

**TREATMENT PLAN**
Phase I (Non-Surgical): [OHI, SRP by quadrant, antimicrobial therapy — only if planned]
Phase II (Surgical): [Flap surgery, osseous surgery, guided tissue regeneration, soft tissue grafts — only if planned]
Phase III (Maintenance): [Periodontal maintenance interval — only if discussed]
Extractions: [Hopeless teeth — only if discussed]
Referrals: [Prosthodontics, implants — only if discussed]
Follow-Up: [Re-evaluation timeframe after treatment]`
  },

  dental_endodontic:{
    id:'dental_endodontic',label:'Endodontic Evaluation',description:'Root canal evaluation and treatment note',category:'dental',
    sections:['Chief Complaint','Endodontic History','Diagnostic Testing','Radiographic Findings','Dental Chart Findings','Assessment','Treatment Plan'],
    noteTitle:'Endodontic Evaluation Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**CHIEF COMPLAINT**
[Tooth pain — location, onset, character (sharp, dull, throbbing), spontaneous vs provoked, severity]

**ENDODONTIC HISTORY**
Symptom Timeline: [When pain started, progression, episodes — only if discussed]
Previous Treatment on Tooth: [Fillings, crowns, prior root canal, trauma — only if discussed]
Relevant Medical History: [Conditions affecting treatment — bisphosphonates, immunosuppression — only if discussed]
Current Medications: [Pain medications taken, antibiotics — only if discussed]
Allergies: [Local anesthetics, antibiotics, latex — only if discussed]

**DIAGNOSTIC TESTING**
Cold Test: [Tooth numbers tested, response (normal, lingering, no response) — only if performed]
Heat Test: [Tooth numbers tested, response — only if performed]
Electric Pulp Test: [Tooth numbers tested, response — only if performed]
Percussion: [Tooth numbers, positive or negative — only if performed]
Palpation: [Apical area, buccal/lingual swelling — only if performed]
Bite Test: [Tooth numbers, response — only if performed]
Selective Anesthesia: [If used to localize pain — only if performed]
Transillumination: [Crack detection — only if performed]
Probing: [Isolated deep pocket suggesting vertical fracture — only if performed]

**RADIOGRAPHIC FINDINGS**
[Periapical radiolucency, widened PDL space, root resorption, calcified canals, previous root canal quality, proximity to anatomic structures — with specific tooth numbers. Only if taken/reviewed]

**DENTAL CHART FINDINGS**
{{DENTAL_CHART}}

**ASSESSMENT**
[Pulpal diagnosis (normal, reversible pulpitis, irreversible pulpitis, pulp necrosis, previously treated, previously initiated therapy). Periapical diagnosis (normal, symptomatic apical periodontitis, asymptomatic apical periodontitis, acute apical abscess, chronic apical abscess). By tooth number. Reference Dental Chart Findings above for related conditions.]

**TREATMENT PLAN**
Recommended Treatment: [Root canal therapy, retreatment, apicoectomy, extraction — with tooth number]
Urgency: [Emergency vs elective]
Restoration After RCT: [Crown, buildup — only if discussed]
Medications: [Antibiotics, analgesics — only if prescribed]
Referrals: [To endodontist, oral surgeon — only if discussed]
Follow-Up: [Treatment appointment timing, recall radiograph schedule]`
  },

  dental_oral_surgery:{
    id:'dental_oral_surgery',label:'Oral Surgery Consult',description:'Oral surgery evaluation and procedure note',category:'dental',
    sections:['Chief Complaint','Surgical History','Clinical Examination','Radiographic Findings','Dental Chart Findings','Assessment','Surgical Plan'],
    noteTitle:'Oral Surgery Consultation Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**CHIEF COMPLAINT**
[Reason for oral surgery referral — extraction, impacted teeth, biopsy, implant, jaw pathology, trauma]

**SURGICAL HISTORY**
Medical History: [ASA classification if stated, cardiac conditions, bleeding disorders, diabetes, osteoporosis, immunosuppression — only if discussed]
Surgical History: [Prior oral/maxillofacial surgeries — only if discussed]
Current Medications: [Anticoagulants, bisphosphonates, immunosuppressants, steroids — only if discussed]
Allergies: [Anesthetics, antibiotics, latex, metals — only if discussed]
Social History: [Smoking, alcohol — only if discussed as surgical risk factors]

**CLINICAL EXAMINATION**
Extraoral: [Swelling, asymmetry, trismus, paresthesia, lymphadenopathy — only if examined]
Intraoral: [Soft tissue lesions, swelling, infection signs, tooth condition — only if examined]
Nerve Function: [Inferior alveolar, lingual, mental nerve — sensation testing — only if assessed]
Mouth Opening: [Measurement in mm, limitation — only if assessed]

**RADIOGRAPHIC FINDINGS**
[Panoramic, CBCT, periapical findings — impaction classification (mesioangular, distoangular, horizontal, vertical), proximity to inferior alveolar nerve, maxillary sinus involvement, pathology (cysts, tumors), bone quality — only if reviewed]

**DENTAL CHART FINDINGS**
{{DENTAL_CHART}}

**ASSESSMENT**
[Surgical diagnosis. Impaction classification if applicable. Pathology differential if biopsy indicated. Risk assessment for nerve injury, sinus communication. Reference Dental Chart Findings for tooth-specific conditions.]

**SURGICAL PLAN**
Procedure: [Specific procedure with tooth numbers — simple extraction, surgical extraction, impaction removal, biopsy, implant placement, etc.]
Anesthesia: [Local, IV sedation, general anesthesia — only if discussed]
Pre-Operative: [Labs, medication adjustments (anticoagulant hold), pre-medication — only if discussed]
Post-Operative: [Pain management, antibiotics, diet, activity restrictions, wound care — only if discussed]
Pathology: [Specimen to pathology — only if biopsy planned]
Referrals: [Prosthodontics for implant restoration, orthodontics — only if discussed]
Follow-Up: [Post-op check timing, suture removal, pathology review]`
  },

  dental_prosthodontic:{
    id:'dental_prosthodontic',label:'Prosthodontic Eval',description:'Crown, bridge, denture, or implant prosthetic note',category:'dental',
    sections:['Chief Complaint','Prosthodontic History','Clinical Examination','Radiographic Findings','Dental Chart Findings','Assessment','Treatment Plan'],
    noteTitle:'Prosthodontic Evaluation Note',
    prompt:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**CHIEF COMPLAINT**
[Reason for prosthodontic visit — missing teeth, broken restoration, ill-fitting denture, cosmetic concern, implant consultation]

**PROSTHODONTIC HISTORY**
Existing Prostheses: [Current dentures, partials, crowns, bridges, implants — age and condition — only if discussed]
Previous Prosthodontic Treatment: [History of remakes, relines, repairs — only if discussed]
Relevant Medical History: [Conditions affecting prosthetics — xerostomia, bruxism, osteoporosis, radiation — only if discussed]
Current Medications: [Especially those causing dry mouth, bisphosphonates — only if discussed]
Allergies: [Metals, acrylics — only if discussed]

**CLINICAL EXAMINATION**
Remaining Dentition: [Condition of abutment teeth, caries, periodontal status — only if examined]
Edentulous Ridge: [Ridge height, width, undercuts, tori — only if examined]
Occlusion: [Vertical dimension, centric relation, interocclusal space — only if assessed]
TMJ: [Click, crepitus, deviation — only if examined]
Soft Tissue: [Denture stomatitis, epulis fissuratum, hyperplasia — only if examined]
Esthetics: [Tooth shade, smile line, lip support — only if assessed]

**RADIOGRAPHIC FINDINGS**
[Abutment tooth condition, bone volume for implants, sinus pneumatization, remaining root tips, pathology — only if reviewed]

**DENTAL CHART FINDINGS**
{{DENTAL_CHART}}

**ASSESSMENT**
[Kennedy classification for partial edentulism if applicable. Abutment tooth prognosis. Implant candidacy assessment. Reference Dental Chart Findings above for tooth-specific conditions affecting prosthetic planning.]

**TREATMENT PLAN**
Fixed Prosthodontics: [Crowns, bridges — with tooth numbers, material selection — only if planned]
Removable Prosthodontics: [Complete dentures, partial dentures, overdentures — only if planned]
Implant Prosthodontics: [Implant-supported crowns, bridges, overdentures — with positions — only if planned]
Pre-Prosthetic Treatment: [Extractions, alveoloplasty, tori removal, soft tissue conditioning — only if needed]
Provisional Restoration: [Temporary prosthesis — only if discussed]
Laboratory Steps: [Impressions, bite registration, try-in, delivery schedule — only if discussed]
Referrals: [Oral surgery for implant placement, periodontics, orthodontics — only if discussed]
Follow-Up: [Next appointment, adjustment visits, recall schedule]`
  }
};

/* ── Template Registry (merges built-in + custom) ── */

export function getTemplateRegistry(cfgObj){
  const registry={...TEMPLATES};
  if(!cfgObj)return registry;
  try{
    const custom=JSON.parse(cfgObj.get('ms-custom-templates','[]'));
    for(const t of custom){
      if(t&&t.id&&t.label&&t.prompt){
        registry[t.id]={...t,category:'custom'};
      }
    }
  }catch(e){/* ignore malformed custom templates */}
  return registry;
}

/* ── Medical Coding Prompt ── */

export const CODING_PROMPT=`You are a medical coding specialist. Analyze this clinical note and suggest appropriate medical codes.

RULES:
1. Only suggest codes supported by documentation in the note.
2. Use the most specific ICD-10-CM code possible based on the documented information.
3. For E&M level, consider: number of problems addressed, amount and complexity of data reviewed, and risk of complications/morbidity/mortality.
4. Assign a confidence level to each code:
   - "high": Strong, specific documentation supports this code
   - "medium": Documentation supports the code but lacks some specificity
   - "low": Code is inferred from context; documentation is indirect
5. Do NOT fabricate codes. Use real, valid ICD-10-CM and CPT codes.
6. Limit to the most relevant codes (max 8 ICD-10, max 4 CPT).

Return ONLY a JSON object with this exact structure (no other text, no markdown fences):
{
  "icd10": [
    {"code": "E11.65", "description": "Type 2 diabetes mellitus with hyperglycemia", "confidence": "high"}
  ],
  "cpt": [
    {"code": "99214", "description": "Office visit, established patient, moderate complexity", "confidence": "high"}
  ],
  "emLevel": {
    "level": "4",
    "mdm": "Moderate",
    "confidence": "medium"
  }
}

CLINICAL NOTE:
{{NOTE_TEXT}}

Return the JSON object now.`;

/* ── Dental Coding Prompt (CDT + dental ICD-10) ── */

export const DENTAL_CODING_PROMPT=`You are a constrained dental coding auditor. You do NOT summarize text. You analyze structured clinical data against strict mathematical and clinical rules to produce billing codes, diagnosis codes, and audit flags.

═══════════════════════════════════════════════════════════
PILLAR 1 — ABSOLUTE DATA HIERARCHY (Source of Truth Mandate)
═══════════════════════════════════════════════════════════

You receive TWO inputs: a STRUCTURED DATA OBJECT and a CLINICAL NOTE.

SOURCE OF TRUTH: The STRUCTURED DATA OBJECT (DENTAL CHART FINDINGS below) is the immutable, absolute source of truth for all quantitative metrics, tooth conditions, anatomical locations, probing depths, BOP flags, surface involvement, mobility grades, furcation classes, and recession measurements.

TRANSCRIPT ROLE: The CLINICAL NOTE is permitted ONLY for understanding:
- Patient-reported symptoms and chief complaint
- Medical history and medications
- Treatment planning intent and future referrals
- Informed consent documentation
- Qualitative context (e.g., "patient reports sensitivity")

FORBIDDEN: You are STRICTLY FORBIDDEN from extracting or inferring any of the following from the clinical note when the structured data object does not contain them:
- Tooth numbers, conditions, or states
- Probing depths or pocket measurements
- Bleeding on probing status
- Surface involvement (M, O, D, B, L)
- Mobility or furcation grades
- Recession values

If a condition is mentioned in the clinical note but is NOT present in the structured data object, treat it as non-existent for the purposes of code assignment. You may flag it as a documentation gap in audit_flags.

═══════════════════════════════════════════════════════════
PILLAR 2 — SPATIAL AND ANATOMICAL MATHEMATICS (Geography Rules)
═══════════════════════════════════════════════════════════

BOUNDARY DEFINITIONS:
- ANTERIOR zone: teeth 6-11 (maxillary), 22-27 (mandibular)
- POSTERIOR zone: teeth 1-5, 12-16 (maxillary), 17-21, 28-32 (mandibular)
- MAXILLARY ARCH: teeth 1-16
- MANDIBULAR ARCH: teeth 17-32
- QUADRANTS: UR (1-8), UL (9-16), LL (17-21, includes premolars through 3rd molar area), LR (25-32)
- SEXTANTS: UR posterior (1-5), UR/UL anterior (6-11), UL posterior (12-16), LL posterior (17-21), LL/LR anterior (22-27), LR posterior (28-32)

COUNTING PREREQUISITE: Before outputting ANY procedure code, you MUST:
1. Count the number of affected teeth/sites within the relevant anatomical boundary.
2. Determine the scope category from that count.

SCOPE CATEGORIZATION — PERIODONTAL:
- Count teeth with probing depths >=5mm within each arch.
- If affected teeth exist in <=1 quadrant of an arch → LOCALIZED: D4342 (SRP, 1-3 teeth per quadrant)
- If affected teeth span 2+ quadrants of an arch → evaluate per-quadrant: D4341 (SRP, 4+ teeth per quadrant) or D4342
- NEVER output D4341 or D4342 without specifying which quadrant(s) the code applies to.

SCOPE CATEGORIZATION — RESTORATIVE:
- Use surface count from the structured data object to select the correct CDT code tier:
  1 surface → D2391/D2330, 2 surfaces → D2392/D2331, 3 surfaces → D2393/D2332, 4+ surfaces → D2394/D2332
- ANTERIOR vs POSTERIOR determines the code series: anterior uses D2330-D2335, posterior uses D2391-D2394.

SCOPE CATEGORIZATION — PROSTHETICS:
- Count missing teeth per arch before selecting denture scope.
- Full arch edentulous → D5110/D5120 (complete denture). Partial → D5213/D5214.

═══════════════════════════════════════════════════════════
PILLAR 3 — CLINICAL THRESHOLD GATES (Medical Necessity)
═══════════════════════════════════════════════════════════

HIGH-TIER PROCEDURES require ALL prerequisites to be satisfied in the structured data. If ANY prerequisite is missing, you are FORBIDDEN from suggesting the code.

D4341/D4342 (SRP) PREREQUISITES — ALL required:
  ☐ Probing depths >=5mm at specific sites (from structured data)
  ☐ BOP positive at those sites (from structured data)
  ☐ Evidence of bone loss (from clinical note context OR radiographic mention)

D4346 (Scaling in presence of inflammation) PREREQUISITES:
  ☐ Probing depths 4mm with BOP (from structured data)
  ☐ Absence of radiographic bone loss
  ☐ Generalized BOP (>30% of sites)

D2740 (Crown) PREREQUISITES — at least ONE required:
  ☐ Tooth state is "fracture" in structured data with >=50% structural loss documented
  ☐ Tooth state is "rct" (root canal treated) requiring cuspal coverage
  ☐ Tooth state is "decay" with >=3 surfaces involved
  ☐ Cracked tooth syndrome documented with cuspal involvement

D7210 (Surgical extraction) PREREQUISITES — at least ONE required:
  ☐ Tooth state is "impacted" in structured data
  ☐ Clinical note explicitly documents bone removal, sectioning, or flap elevation

D4260/D4261 (Osseous surgery) PREREQUISITES — ALL required:
  ☐ Probing depths >=7mm at multiple sites (from structured data)
  ☐ Radiographic bone loss documented
  ☐ Prior SRP documented as completed

NARRATIVE CONSTRAINT: Any code suggestion with confidence "high" MUST be supported by specific numerical data points from the structured data object. Vague qualitative descriptors alone cannot justify "high" confidence.

═══════════════════════════════════════════════════════════
PILLAR 4 — SEVERITY ESCALATION (Anti-Downcoding Rule)
═══════════════════════════════════════════════════════════

EXCLUSION PRINCIPLE: The following treatment categories are MUTUALLY EXCLUSIVE within the same anatomical space:
- D1110 (Prophylaxis) CANNOT coexist with D4341/D4342 (SRP) in the same quadrant
- D1110 CANNOT coexist with D4346 (Scaling in inflammation) in the same arch
- D2391-D2394 (Direct composite) CANNOT coexist with D2740 (Crown) on the same tooth
- D7140 (Simple extraction) CANNOT coexist with D7210-D7240 (Surgical extraction) on the same tooth

ACUITY OVERRIDE: When the structured data contains markers of active destructive disease, you MUST suppress all baseline/preventative codes and escalate:
- If ANY quadrant has depths >=5mm with BOP → SUPPRESS D1110 for that arch entirely. Escalate to D4341/D4342.
- If tooth has >=3 surfaces of decay + structural compromise → SUPPRESS D2391-D2394. Escalate to D2740.
- If tooth is "impacted" → SUPPRESS D7140. Escalate to D7220-D7240 based on impaction type.
- If pulpal necrosis or irreversible pulpitis → SUPPRESS caries-only codes. Escalate to D3310/D3320/D3330 + appropriate ICD-10 (K04.0/K04.1).

ICD-10 SEVERITY ESCALATION:
- If structured data shows depths >=5mm + BOP + bone loss → K05.311/K05.319 minimum. NEVER K05.10 (gingivitis).
- If "severe" or "advanced" + depths >=7mm → K05.321/K05.329.
- If caries "approaching pulp" or endo is planned → K04.0/K04.1, NOT K02.51 (enamel-limited).
- Always select the code reflecting the DEEPEST severity documented in the structured data.

═══════════════════════════════════════════════════════════
PILLAR 5 — AUDITOR OUTPUT LAYER (Cross-Check Phase)
═══════════════════════════════════════════════════════════

You MUST produce an "audit_flags" array. Scan for ALL of the following:

MISSING PREREQUISITE DOCUMENTATION:
- SRP coded but no periapical/bitewing radiographs mentioned → flag: "No radiographic documentation of bone loss referenced — required to support D4341/D4342"
- Crown coded but no radiograph or photo referenced → flag: "Pre-operative radiograph recommended to document structural compromise for D2740"
- Surgical extraction coded but operative technique not described → flag: "Surgical narrative required — document bone removal, sectioning, or flap technique for D7210"
- Endo coded but no vitality/sensibility testing mentioned → flag: "Pulp testing documentation recommended for endodontic diagnosis"

FREQUENCY AND BENEFIT LIMITATIONS:
- D1110 coded → flag: "Verify prophylaxis not already billed 2x this benefit year"
- D0120 or D0150 coded → flag: "Verify exam frequency within benefit limits"
- D4910 coded → flag: "Verify patient has completed active periodontal therapy before maintenance"
- Multiple crowns coded → flag: "Verify each crown meets individual medical necessity documentation"

CROSS-DOMAIN BILLING OPPORTUNITIES:
- Scan the clinical note for: sleep apnea, OSA, TMJ/TMD, bruxism with muscle pain, oral biopsy, trauma/accident, diabetes affecting perio → flag: "Cross-domain billing opportunity: [condition] may qualify for medical insurance coverage under [relevant category]"
- Trauma documented → flag: "If injury is accident-related, consider medical insurance primary billing"

DATA DISCREPANCIES:
- Condition mentioned in clinical note but absent from structured data → flag: "Documentation gap: [condition] referenced in clinical note but not present in charting data — verify and update chart"
- Structured data shows pathology but clinical note does not address it → flag: "Charting shows [finding] on tooth #X but clinical note does not document assessment or treatment plan"

═══════════════════════════════════════════════════════════
DOMAIN GATE
═══════════════════════════════════════════════════════════
You MUST output ONLY CDT procedure codes (D-codes) and dental-specific ICD-10 diagnosis codes.
FORBIDDEN: CPT codes (00100-99499), E&M levels (99201-99499), any non-dental codes.
Every procedure code MUST begin with the letter "D".

═══════════════════════════════════════════════════════════
TRAUMA CLASSIFICATION
═══════════════════════════════════════════════════════════
When fracture or trauma is documented, classify into exactly ONE track per tooth:
TRACK A — STRUCTURAL FAILURE (hard tissue fractured/cracked):
  ICD-10: K03.81 (Cracked tooth), S02.5XXA (Fracture of tooth)
  CDT: D2740 (Crown), D2390 (Emergency composite), D7140 (Extraction if non-restorable)
TRACK B — POSITIONAL DISPLACEMENT (intact tooth displaced/avulsed):
  ICD-10: S03.2XXA (Luxation/subluxation), M26.30 (Positional anomaly)
  CDT: D7270 (Reimplantation/stabilization), D4921 (Splinting)
NEVER assign codes from both tracks to the same tooth.

═══════════════════════════════════════════════════════════
ETIOLOGY OF ABSENCE
═══════════════════════════════════════════════════════════
For every missing tooth:
- Default to ACQUIRED ABSENCE: K08.111-K08.119, K08.401-K08.409
- Use CONGENITAL ABSENCE (K00.0) ONLY if explicitly stated: "congenitally absent", "agenesis", "hypodontia"

═══════════════════════════════════════════════════════════
CDT REFERENCE TABLE
═══════════════════════════════════════════════════════════
Decay → D2140-D2161 (amalgam), D2330-D2335 (composite anterior), D2391-D2394 (composite posterior), D2740 (crown)
Root Canal → D3310 (anterior), D3320 (premolar), D3330 (molar), D3346-D3348 (retreatment)
Impacted → D7220 (soft tissue), D7230 (partial bony), D7240 (complete bony), D7241 (complete bony w/ complications)
Implant → D6010 (body), D6065-D6066 (abutment), D6058-D6059 (crown)
Fracture → D2390 (emergency), D2740 (crown), D7140 (simple ext), D7210 (surgical ext)
Prosthetic → D5110/D5120 (complete denture), D5213/D5214 (partial denture), D6240 (pontic)
Perio → D1110 (prophy), D4341 (SRP 4+ teeth/quad), D4342 (SRP 1-3 teeth/quad), D4346 (scaling in inflammation), D4910 (perio maintenance), D4260/D4261 (osseous surgery)

═══════════════════════════════════════════════════════════
OUTPUT RULES
═══════════════════════════════════════════════════════════
1. Only suggest codes supported by the STRUCTURED DATA OBJECT. The clinical note provides context only.
2. Use the most specific ICD-10-CM code possible.
3. Confidence levels: "high" = all prerequisites met in structured data; "medium" = prerequisites partially met; "low" = inferred from clinical note context only.
4. Do NOT fabricate codes. Use real, valid CDT and ICD-10-CM codes only.
5. Max 8 ICD-10 and max 8 CDT codes.
6. Every tooth-specific code MUST include the tooth number. Every quadrant-specific perio code MUST include the quadrant.
7. Surface-dependent restoration codes MUST use the surface count from the structured data.
8. The audit_flags array MUST contain at least one entry. If no issues are found, include: "No audit flags — documentation appears complete."

═══════════════════════════════════════════════════════════
INPUT DATA
═══════════════════════════════════════════════════════════

STRUCTURED DATA OBJECT (SOURCE OF TRUTH):
{{DENTAL_CHART}}

CLINICAL NOTE (CONTEXT ONLY):
{{NOTE_TEXT}}

Return ONLY a JSON object with this exact structure (no other text, no markdown fences):
{
  "cdt": [
    {"code": "D4341", "description": "Periodontal scaling and root planing, 4+ teeth, per quadrant", "tooth": "LL quadrant", "confidence": "high"}
  ],
  "icd10": [
    {"code": "K05.311", "description": "Aggressive periodontitis, localized", "tooth": "19", "confidence": "high"}
  ],
  "warnings": [
    "D1110 suppressed — active periodontal disease present in LL quadrant"
  ],
  "audit_flags": [
    "Cross-domain billing opportunity: Type 2 diabetes documented — periodontal disease may qualify for medical cross-coding",
    "Pre-operative radiograph recommended to document bone loss pattern for D4341"
  ]
}

Return the JSON object now.`;
