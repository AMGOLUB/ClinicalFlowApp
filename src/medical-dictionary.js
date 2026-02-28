/* ============================================================
   CLINICALFLOW — Comprehensive Medical Dictionary
   1,300+ terms: medications, conditions, procedures, anatomy
   Single-pass highlight regex for optimal performance
   ============================================================ */

/* ── Category 1: Top 200 Medications (Generic Names) ── */

export const MEDICATIONS_GENERIC = [
  'atorvastatin','metformin','levothyroxine','lisinopril','amlodipine','metoprolol','albuterol',
  'losartan','gabapentin','omeprazole','sertraline','rosuvastatin','pantoprazole','escitalopram',
  'amphetamine','dextroamphetamine','hydrochlorothiazide','bupropion','fluoxetine','semaglutide',
  'montelukast','trazodone','simvastatin','amoxicillin','tamsulosin','acetaminophen','hydrocodone',
  'fluticasone','meloxicam','apixaban','furosemide','duloxetine','ibuprofen','famotidine',
  'empagliflozin','carvedilol','tramadol','alprazolam','prednisone','hydroxyzine','buspirone',
  'clopidogrel','glipizide','citalopram','allopurinol','aspirin','cyclobenzaprine','ergocalciferol',
  'oxycodone','methylphenidate','venlafaxine','spironolactone','ondansetron','zolpidem','cetirizine',
  'estradiol','pravastatin','lamotrigine','quetiapine','clonazepam','dulaglutide','azithromycin',
  'clavulanate','latanoprost','cholecalciferol','propranolol','ezetimibe','topiramate','paroxetine',
  'diclofenac','budesonide','formoterol','atenolol','lisdexamfetamine','doxycycline','pregabalin',
  'glimepiride','tizanidine','clonidine','fenofibrate','valsartan','cephalexin','baclofen',
  'rivaroxaban','amitriptyline','finasteride','dapagliflozin','aripiprazole','olmesartan',
  'valacyclovir','mirtazapine','lorazepam','levetiracetam','naproxen','cyanocobalamin','loratadine',
  'diltiazem','sumatriptan','triamcinolone','hydralazine','tirzepatide','celecoxib','alendronate',
  'oxybutynin','warfarin','progesterone','testosterone','nifedipine','methocarbamol','benzonatate',
  'sitagliptin','chlorthalidone','donepezil','dexmethylphenidate','sulfamethoxazole','trimethoprim',
  'clobetasol','methotrexate','hydroxychloroquine','lovastatin','pioglitazone','irbesartan',
  'methylprednisolone','norethindrone','meclizine','ketoconazole','azelastine','nitrofurantoin',
  'adalimumab','memantine','prednisolone','esomeprazole','docusate','clindamycin','acyclovir',
  'sildenafil','ciprofloxacin','morphine','levocetirizine','nirmatrelvir','ritonavir','valproate',
  'atomoxetine','budesonide','tiotropium','cefdinir','doxepin','olanzapine','phentermine',
  'mupirocin','benazepril','timolol','fluconazole','risperidone','verapamil','linaclotide',
  'doxazosin','ipratropium','hydrocortisone','diazepam','telmisartan','carbamazepine',
  'metronidazole','liraglutide','oxcarbazepine','lithium','nortriptyline','ramipril','enalapril',
  'canagliflozin','levofloxacin','guanfacine','tadalafil','sacubitril','mirabegron','colchicine',
  'linagliptin','solifenacin','nebivolol','dabigatran','erenumab','umeclidinium','vilanterol',
  'fexofenadine','insulin','salmeterol','isosorbide','ferrous sulfate','folic acid',
  'potassium chloride','valproic acid'
];

/* ── Category 1: Brand Names ── */

export const MEDICATIONS_BRAND = [
  'Lipitor','Glucophage','Synthroid','Levoxyl','Prinivil','Zestril','Norvasc','Lopressor','Toprol',
  'ProAir','Ventolin','Proventil','Cozaar','Neurontin','Prilosec','Zoloft','Crestor','Protonix',
  'Lexapro','Adderall','Microzide','Wellbutrin','Zyban','Prozac','Ozempic','Wegovy','Rybelsus',
  'Singulair','Desyrel','Zocor','Amoxil','Flomax','Vicodin','Norco','Flonase','Flovent','Mobic',
  'Eliquis','Lasix','Lantus','Basaglar','Toujeo','Cymbalta','Advil','Motrin','Pepcid','Jardiance',
  'Coreg','Ultram','Xanax','Deltasone','Vistaril','Atarax','BuSpar','Plavix','Glucotrol','Celexa',
  'Zyloprim','Bayer','Ecotrin','Flexeril','Drisdol','OxyContin','Roxicodone','Ritalin','Concerta',
  'Effexor','Aldactone','Zofran','Ambien','Zyrtec','Estrace','Pravachol','Zestoretic','Lamictal',
  'Seroquel','Advair','Klonopin','Trulicity','Zithromax','Hyzaar','Augmentin','Xalatan','Inderal',
  'Zetia','Topamax','Paxil','Voltaren','Symbicort','Tenormin','Vyvanse','Vibramycin','Lyrica',
  'Amaryl','Zanaflex','Catapres','Tricor','Humalog','Diovan','Keflex','Lioresal','Xarelto',
  'Elavil','Proscar','Propecia','Farxiga','Percocet','Abilify','Benicar','Valtrex','Remeron',
  'Ativan','Keppra','NovoLog','Aleve','Naprosyn','Claritin','Cardizem','Tiazac','Imitrex',
  'Kenalog','Apresoline','Mounjaro','Zepbound','Celebrex','Tylenol','Fosamax','Ditropan','Dyazide',
  'Maxzide','Coumadin','Prometrium','Trelegy','AndroGel','Procardia','Adalat','Robaxin','Tessalon',
  'Januvia','Thalitone','Imdur','Aricept','Focalin','Bactrim','Septra','Temovate','Trexall',
  'Plaquenil','Mevacor','Actos','Avapro','Medrol','Aygestin','Antivert','Alesse','Seasonique',
  'Breo','Nizoral','Astelin','Macrobid','Macrodantin','Humira','Namenda','Orapred','Nexium',
  'Colace','Cleocin','Zovirax','Viagra','Revatio','Tresiba','Levemir','Cipro','Xyzal','Paxlovid',
  'Depakote','Depakene','Strattera','Pulmicort','Entocort','Spiriva','Omnicef','Sinequan','Silenor',
  'Zyprexa','Bactroban','Lotensin','Timoptic','Diflucan','Risperdal','Calan','Verelan','Linzess',
  'Cardura','Combivent','Cortef','Valium','Micardis','Tegretol','Flagyl','Victoza','Saxenda',
  'Trileptal','Lithobid','Pamelor','Altace','Vasotec','Invokana','Levaquin','Intuniv','Tenex',
  'Cialis','Adcirca','Entresto','Myrbetriq','Colcrys','Tradjenta','Vesicare','Bystolic','Pradaxa',
  'Aimovig','Allegra','Yaz','Yasmin'
];

/* ── Category 2: Medical Conditions (~365 terms, all 14 specialties) ── */

export const MED_CONDITIONS = [
  /* Cardiology */
  'hypertension','atrial fibrillation','atrial flutter','heart failure','congestive heart failure',
  'coronary artery disease','myocardial infarction','unstable angina','angina pectoris',
  'aortic stenosis','aortic regurgitation','mitral valve prolapse','mitral regurgitation',
  'mitral stenosis','tricuspid regurgitation','pericarditis','pericardial effusion',
  'cardiac tamponade','endocarditis','myocarditis','cardiomyopathy','aortic aneurysm',
  'aortic dissection','peripheral artery disease','deep vein thrombosis','pulmonary embolism',
  'supraventricular tachycardia','ventricular tachycardia','ventricular fibrillation',
  'bradycardia','heart block','long QT syndrome','patent foramen ovale','atrial septal defect',
  /* Gastroenterology */
  'gastroesophageal reflux disease','GERD','esophageal varices','esophagitis','peptic ulcer disease',
  'helicobacter pylori','gastritis','gastroparesis','ulcerative colitis','inflammatory bowel disease',
  'irritable bowel syndrome','celiac disease','diverticulitis','diverticulosis','colorectal cancer',
  'colorectal polyps','hepatitis','cirrhosis','fatty liver disease','steatohepatitis',
  'cholelithiasis','cholecystitis','choledocholithiasis','cholangitis','pancreatitis',
  'pancreatic cancer','hepatocellular carcinoma','small bowel obstruction',
  /* Neurology */
  'ischemic stroke','hemorrhagic stroke','transient ischemic attack','epilepsy',
  'status epilepticus','migraine','tension headache','cluster headache','multiple sclerosis',
  'dementia','amyotrophic lateral sclerosis','myasthenia gravis','trigeminal neuralgia',
  'peripheral neuropathy','carpal tunnel syndrome','meningitis','encephalitis',
  'normal pressure hydrocephalus','essential tremor','cerebral aneurysm',
  /* Pulmonology */
  'asthma','chronic obstructive pulmonary disease','COPD','emphysema','chronic bronchitis',
  'pneumonia','aspiration pneumonia','pulmonary fibrosis','pulmonary hypertension',
  'pneumothorax','pleural effusion','pleurisy','acute respiratory distress syndrome',
  'respiratory failure','obstructive sleep apnea','lung cancer','bronchiectasis',
  'sarcoidosis','tuberculosis','cystic fibrosis','hemoptysis','interstitial lung disease',
  'pulmonary edema','acute bronchitis',
  /* Endocrinology */
  'diabetes mellitus','diabetic ketoacidosis','hyperosmolar hyperglycemic state','hypoglycemia',
  'hypothyroidism','hyperthyroidism','thyroid nodule','thyroid cancer','thyroiditis',
  'adrenal insufficiency','pheochromocytoma','hyperaldosteronism','polycystic ovary syndrome',
  'osteoporosis','hyperparathyroidism','hypoparathyroidism','hypercalcemia','hypocalcemia',
  'metabolic syndrome','pituitary adenoma','hypopituitarism','diabetes insipidus','acromegaly',
  /* Nephrology */
  'chronic kidney disease','acute kidney injury','nephrotic syndrome','nephritic syndrome',
  'glomerulonephritis','polycystic kidney disease','renal artery stenosis','nephrolithiasis',
  'pyelonephritis','hydronephrosis','renal cell carcinoma','hyperkalemia','hypokalemia',
  'hypernatremia','hyponatremia','metabolic acidosis','metabolic alkalosis','rhabdomyolysis',
  /* Rheumatology */
  'rheumatoid arthritis','systemic lupus erythematosus','gout','pseudogout','osteoarthritis',
  'ankylosing spondylitis','psoriatic arthritis','polymyalgia rheumatica',
  'giant cell arteritis','dermatomyositis','polymyositis','vasculitis','fibromyalgia',
  'reactive arthritis','antiphospholipid syndrome','mixed connective tissue disease',
  /* Infectious Disease */
  'sepsis','septic shock','cellulitis','osteomyelitis','abscess','bacteremia',
  'necrotizing fasciitis','candidiasis','aspergillosis','herpes simplex','herpes zoster',
  'mononucleosis','lyme disease','malaria',
  /* Hematology / Oncology */
  'iron deficiency anemia','anemia','sickle cell disease','thalassemia','hemolytic anemia',
  'aplastic anemia','thrombocytopenia','immune thrombocytopenic purpura',
  'thrombotic thrombocytopenic purpura','disseminated intravascular coagulation',
  'hemophilia','von Willebrand disease','polycythemia vera','acute lymphoblastic leukemia',
  'acute myeloid leukemia','chronic lymphocytic leukemia','chronic myeloid leukemia',
  'lymphoma','multiple myeloma','myelodysplastic syndrome',
  /* Psychiatry */
  'major depressive disorder','generalized anxiety disorder','panic disorder',
  'social anxiety disorder','obsessive compulsive disorder','post traumatic stress disorder',
  'bipolar disorder','schizophrenia','schizoaffective disorder',
  'attention deficit hyperactivity disorder','autism spectrum disorder','anorexia nervosa',
  'bulimia nervosa','binge eating disorder','insomnia','alcohol use disorder',
  'opioid use disorder','substance use disorder','delirium','somatic symptom disorder',
  'adjustment disorder','borderline personality disorder','conversion disorder',
  /* Orthopedics */
  'rotator cuff tear','rotator cuff tendinopathy','anterior cruciate ligament tear',
  'meniscus tear','achilles tendon rupture','plantar fasciitis','lateral epicondylitis',
  'medial epicondylitis','hip fracture','femur fracture','compression fracture',
  'stress fracture','spinal stenosis','herniated disc','sciatica','scoliosis',
  'patellar tendinitis','frozen shoulder','adhesive capsulitis',
  /* Dermatology */
  'acne vulgaris','rosacea','psoriasis','eczema','atopic dermatitis','contact dermatitis',
  'seborrheic dermatitis','urticaria','angioedema','impetigo','tinea','onychomycosis',
  'basal cell carcinoma','squamous cell carcinoma','melanoma','alopecia areata','vitiligo',
  'scabies','molluscum contagiosum','drug eruption','bullous pemphigoid',
  /* Emergency Medicine */
  'cardiac arrest','anaphylaxis','hypertensive emergency','upper GI bleed','acute abdomen',
  'appendicitis','traumatic brain injury','spinal cord injury','hemorrhagic shock',
  'compartment syndrome','testicular torsion','ectopic pregnancy','mesenteric ischemia',
  /* Primary Care / Family Medicine */
  'hyperlipidemia','dyslipidemia','obesity','upper respiratory infection',
  'acute pharyngitis','acute sinusitis','acute otitis media','allergic rhinitis',
  'urinary tract infection','low back pain','neck pain','constipation',
  'vitamin D deficiency','chronic pain','benign prostatic hyperplasia','erectile dysfunction',
  /* Additional common terms */
  'diabetes','tachycardia','arrhythmia','stroke','seizure','fracture','laceration',
  'contusion','edema','inflammation','infection','thyroid','diaphoresis','dyspnea',
  'cyanosis','orthopnea','syncope','vertigo','nausea','emesis','diarrhea',
  'hematuria','dysuria','costochondritis','aura','paresthesia','pruritus',
  'depression','anxiety','hypertension','hypotension','hyperglycemia','hypoglycemia'
];

/* ── Category 3: Procedures & Tests (~110) ── */

export const MED_PROCEDURES = [
  /* Diagnostic Imaging */
  'radiograph','computed tomography','CT scan','magnetic resonance imaging','MRI',
  'ultrasound','sonography','echocardiogram','Doppler ultrasound','fluoroscopy',
  'mammography','PET scan','DEXA scan','bone densitometry','nuclear stress test',
  'CT angiography','MR angiography','venous duplex','carotid ultrasound',
  /* Laboratory Tests */
  'complete blood count','basic metabolic panel','comprehensive metabolic panel',
  'hemoglobin A1c','lipid panel','thyroid function tests','liver function tests',
  'coagulation panel','urinalysis','urine culture','blood culture','arterial blood gas',
  'venous blood gas','procalcitonin','lactate','glomerular filtration rate',
  'iron studies','hemoglobin electrophoresis','rheumatoid factor','antinuclear antibody',
  /* Cardiac Procedures */
  'electrocardiogram','ECG','EKG','Holter monitor','event monitor','cardiac stress test',
  'cardiac catheterization','percutaneous coronary intervention','angioplasty',
  'coronary artery stenting','coronary artery bypass grafting','cardioversion',
  'catheter ablation','pacemaker implantation','transesophageal echocardiogram',
  'pericardiocentesis',
  /* GI Procedures */
  'esophagogastroduodenoscopy','upper endoscopy','colonoscopy','flexible sigmoidoscopy',
  'endoscopic retrograde cholangiopancreatography','ERCP','liver biopsy','paracentesis',
  'appendectomy','cholecystectomy','colectomy','hernia repair',
  /* Pulmonary Procedures */
  'pulmonary function tests','spirometry','bronchoscopy','thoracentesis',
  'chest tube placement','thoracostomy','intubation','tracheostomy','mechanical ventilation',
  /* Neurological Procedures */
  'lumbar puncture','spinal tap','electroencephalogram','EEG','electromyography','EMG',
  'nerve conduction study',
  /* Orthopedic Procedures */
  'arthroscopy','total knee replacement','arthroplasty','total hip replacement',
  'ACL reconstruction','rotator cuff repair','open reduction internal fixation','ORIF',
  'spinal fusion','laminectomy','discectomy',
  /* Other Procedures */
  'central venous catheter','central line','PICC line','arterial line',
  'Foley catheter','nasogastric tube','incision and drainage','skin biopsy',
  'fine needle aspiration','bone marrow biopsy','dialysis','hemodialysis',
  'peritoneal dialysis','joint aspiration','arthrocentesis','epidural steroid injection',
  'nerve block','wound debridement','laceration repair','fracture reduction'
];

/* ── Category 4: Anatomical Terms (~115) ── */

export const MED_ANATOMY = [
  /* Directional & Positional */
  'anterior','posterior','superior','inferior','medial','lateral','proximal','distal',
  'superficial','ipsilateral','contralateral','bilateral','unilateral','midline','peripheral',
  /* Body Positions */
  'supine','prone','lateral decubitus','Trendelenburg','lithotomy',
  /* Body Planes & Regions */
  'sagittal','coronal','transverse','epigastric','umbilical','suprapubic','periumbilical',
  /* Spinal & Skeletal */
  'cervical spine','thoracic spine','lumbar spine','sacrum','coccyx','vertebra','vertebrae',
  'intervertebral disc','sternum','clavicle','scapula','humerus','radius','ulna',
  'femur','tibia','fibula','patella','pelvis','iliac crest','acetabulum','calcaneus',
  'metatarsal','phalanx','phalanges','costochondral',
  /* Organs & Organ Systems */
  'pericardium','myocardium','endocardium','epicardium','aorta','vena cava',
  'peritoneum','retroperitoneum','mesentery','omentum','diaphragm','pleura',
  'mediastinum','esophagus','duodenum','jejunum','ileum','cecum','appendix',
  'ascending colon','transverse colon','descending colon','sigmoid colon','rectum',
  'pancreas','spleen','gallbladder','common bile duct','hepatic duct','adrenal gland',
  'thyroid gland','parathyroid gland','pituitary gland','hypothalamus','thalamus',
  'cerebrum','cerebellum','brainstem','frontal lobe','temporal lobe','parietal lobe',
  'occipital lobe',
  /* Soft Tissue */
  'fascia','tendon','ligament','cartilage','bursa','synovium','meniscus',
  'mucosa','serosa','subcutaneous','dermis','epidermis','meninges',
  'dura mater','arachnoid','pia mater','periosteum','endothelium'
];

/* ── Dental Terminology ── */

const DENTAL_CONDITIONS = [
  /* Caries & Tooth Pathology */
  'dental caries','incipient caries','recurrent caries','rampant caries','root caries',
  'cracked tooth syndrome','tooth erosion','tooth abrasion','tooth attrition','abfraction',
  'dental abscess','periapical abscess','pulpitis','reversible pulpitis','irreversible pulpitis',
  'pulp necrosis','periapical granuloma','periapical cyst','radicular cyst',
  'internal resorption','external resorption','dentin hypersensitivity',
  'amelogenesis imperfecta','dentinogenesis imperfecta',
  /* Periodontal */
  'gingivitis','periodontitis','chronic periodontitis','aggressive periodontitis',
  'localized periodontitis','generalized periodontitis','gingival recession',
  'gingival hyperplasia','periodontal pocket','furcation involvement',
  'tooth mobility','gingival abscess','periodontal abscess',
  'necrotizing ulcerative gingivitis','necrotizing ulcerative periodontitis',
  'peri-implantitis','peri-implant mucositis',
  /* Oral Pathology */
  'oral candidiasis','oral leukoplakia','oral erythroplakia','oral lichen planus',
  'aphthous ulcer','herpetic stomatitis','angular cheilitis',
  'oral squamous cell carcinoma','mucocele','ranula','fibroma',
  'pyogenic granuloma','epulis','odontoma','ameloblastoma',
  'dentigerous cyst','keratocystic odontogenic tumor','burning mouth syndrome',
  /* Occlusion & TMJ */
  'malocclusion','overbite','overjet','crossbite','open bite','crowding','diastema',
  'temporomandibular disorder','TMJ dysfunction','TMJ disc displacement',
  'bruxism','trismus','myofascial pain dysfunction',
  /* Other */
  'impacted tooth','supernumerary tooth','hyperdontia','anodontia','hypodontia',
  'pericoronitis','dry socket','alveolar osteitis','torus palatinus','torus mandibularis',
  'exostosis','xerostomia','sialolithiasis','sialadenitis','dental ankylosis'
];

const DENTAL_PROCEDURES = [
  /* Diagnostic */
  'comprehensive oral evaluation','periodic oral evaluation','oral cancer screening',
  'caries risk assessment','pulp vitality testing',
  /* Preventive */
  'dental prophylaxis','fluoride varnish','dental sealant','space maintainer',
  'oral hygiene instructions',
  /* Restorative */
  'amalgam filling','composite filling','composite resin filling','dental inlay','dental onlay',
  'porcelain crown','zirconia crown','core buildup','post and core','dental veneer',
  'porcelain veneer','recementation',
  /* Endodontic */
  'pulp cap','direct pulp cap','indirect pulp cap','pulpotomy',
  'root canal therapy','root canal retreatment','apicoectomy','apical surgery',
  'pulp debridement',
  /* Periodontal */
  'scaling and root planing','full mouth debridement','periodontal maintenance',
  'gingivectomy','gingival flap','osseous surgery','bone graft',
  'guided tissue regeneration','soft tissue graft','connective tissue graft',
  'crown lengthening','frenectomy',
  /* Prosthodontic */
  'complete denture','immediate denture','partial denture','denture reline',
  'dental bridge','fixed partial denture','overdenture',
  /* Oral Surgery */
  'simple extraction','surgical extraction','impaction removal',
  'alveoloplasty','incision and drainage','oral biopsy','operculectomy','coronectomy',
  /* Implant */
  'dental implant','implant placement','implant abutment','implant-supported crown',
  'sinus lift','sinus augmentation','socket preservation','ridge augmentation',
  /* Orthodontic */
  'orthodontic treatment','clear aligners','palatal expander',
  /* Adjunctive */
  'occlusal adjustment','occlusal guard','night guard','dental splint',
  'tooth whitening','dental bleaching'
];

const DENTAL_ANATOMY = [
  /* Tooth Surfaces */
  'mesial','distal','buccal','labial','facial','lingual','palatal',
  'occlusal','incisal','proximal','interproximal',
  /* Combined Surfaces */
  'mesio-occlusal','disto-occlusal','mesio-occluso-distal',
  'mesio-buccal','disto-buccal','mesio-lingual','disto-lingual',
  /* Tooth Structure */
  'enamel','dentin','cementum','pulp','pulp chamber','root canal',
  'apex','apical foramen','cemento-enamel junction',
  'furcation','cusp','fossa','central fossa','pit','fissure',
  'marginal ridge','triangular ridge','oblique ridge','transverse ridge',
  'cingulum','mamelons',
  /* Oral Structures */
  'maxilla','maxillary','mandibular','alveolar bone','alveolar ridge',
  'alveolus','gingiva','free gingiva','attached gingiva','gingival sulcus',
  'gingival margin','interdental papilla','mucogingival junction',
  'hard palate','soft palate','vestibule','frenulum',
  'retromolar area','tuberosity','condyle','ramus','mental foramen',
  'inferior alveolar nerve','lingual nerve','buccal nerve',
  /* Tooth Types */
  'molar','premolar','bicuspid','canine','cuspid','lateral incisor','central incisor',
  'wisdom tooth','deciduous tooth','primary dentition','permanent dentition',
  /* Periodontal */
  'periodontal ligament','probing depth','clinical attachment level',
  'bleeding on probing','gutta percha',
  /* Materials (commonly spoken in clinical context) */
  'amalgam','composite resin','glass ionomer','zirconia','lithium disilicate',
  'porcelain','dental cement'
];

/* ── Regex Utility ── */

function _escRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── Build Term Map + Compiled Regex (single-pass highlighting) ── */

const _termMap = new Map();

// Add terms in priority order: medications first (most specific), then conditions, procedures, anatomy
// Later categories won't overwrite if a term already exists
function _addTerms(arr, cls) {
  for (const t of arr) {
    const key = t.toLowerCase();
    if (!_termMap.has(key)) _termMap.set(key, cls);
  }
}

_addTerms(MEDICATIONS_GENERIC, 'medication-term');
_addTerms(MEDICATIONS_BRAND, 'medication-term');
_addTerms(MED_CONDITIONS, 'medical-term');
_addTerms(MED_PROCEDURES, 'procedure-term');
_addTerms(MED_ANATOMY, 'anatomy-term');
_addTerms(DENTAL_CONDITIONS, 'dental-term');
_addTerms(DENTAL_PROCEDURES, 'dental-term');
_addTerms(DENTAL_ANATOMY, 'dental-term');

// Build single regex: sort by length (longest first) to prevent partial matches
const _allTermsSorted = [..._termMap.keys()].sort((a, b) => b.length - a.length);
const _allRegex = new RegExp('\\b(' + _allTermsSorted.map(_escRegex).join('|') + ')\\b', 'gi');

/* ── Highlight Function (single-pass, all categories) ── */

export function hlTerms(text) {
  return text.replace(_allRegex, (match) => {
    const cls = _termMap.get(match.toLowerCase());
    return cls ? `<span class="${cls}">${match}</span>` : match;
  });
}

/* ── Backward-Compatible Exports ── */

export const MED_TERMS = MED_CONDITIONS;
export const MED_RX = MEDICATIONS_GENERIC;
