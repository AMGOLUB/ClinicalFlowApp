/* ============================================================
   CLINICALFLOW — Dental Extras
   Documentation completeness scoring, insurance narrative gen
   ============================================================ */
import { App, cfg, getAbortCtrl, setAbortCtrl, GENERATION_TIMEOUT_MS } from './state.js';
import { toast, esc, updStatus } from './ui.js';
import { formatDentalChartForPrompt, isDentalTemplate } from './dental-chart.js';

/* ── Documentation Completeness Scoring ── */

const SCORING_RULES = {
  _general: [
    { label: 'Chief complaint documented', test: t => /chief\s*complaint|reason\s*for\s*visit|presents?\s*with|presenting\s*complaint|CC:/i.test(t) },
    { label: 'Informed consent mentioned', test: t => /informed\s*consent|consent\s*(was\s*)?(obtained|given|signed)|risks.*benefits.*alternatives|agreed\s*to\s*treatment|verbal\s*consent/i.test(t) },
    { label: 'Treatment plan present', test: t => /treatment\s*plan|plan\s*of\s*care|plan:|recommended\s*treatment|proposed\s*treatment/i.test(t) },
    { label: 'Medical history reviewed', test: t => /medical\s*history|PMH|past\s*medical|medications?\s*reviewed|allergies?\s*(reviewed|noted|NKDA)|health\s*history/i.test(t) },
  ],
  dental_periodontal: [
    { label: 'Probing depths documented', test: t => /probing\s*depth|pocket\s*depth|\d+[\s-]*mm\s*(pocket|depth)|PD[\s:]+\d|depth.*\d+\s*mm/i.test(t) },
    { label: 'BOP documented', test: t => /bleed(?:ing)?\s*on\s*probing|BOP[\s:]+\d|BOP\s*(%|percent)|sites?\s*bleed/i.test(t) },
    { label: 'Bone loss mentioned', test: t => /bone\s*loss|alveolar\s*(bone\s*)?resorption|radiographic.*bone\s*(loss|level)|vertical\s*defect|horizontal\s*bone\s*loss|osseous\s*defect/i.test(t) },
    { label: 'AAP staging/grading', test: t => /stage\s*(?:I{1,3}V?|[1-4])\b|grade\s*[A-Ca-c]\b|AAP\s*(classif|stage|grade)|generalized\s*stage|localized\s*stage/i.test(t) },
    { label: 'Perio chart data recorded', test: (t, c) => { const teeth = Object.values(c.teeth || {}); const withDepths = teeth.filter(x => x.perio?.depths?.some(d => d > 0)); return withDepths.length >= 4; } },
    { label: 'Home care instructions', test: t => /home\s*care|oral\s*hygiene\s*instruction|brushing|flossing|interproximal\s*(brush|clean)|Waterpik|irrigation|post[\s-]*op(erative)?\s*instruction/i.test(t) },
    { label: 'Calculus/plaque documented', test: t => /calculus|plaque\s*(index|score|deposit|accumul)|supra[\s-]*gingival|sub[\s-]*gingival\s*(calculus|deposit)/i.test(t) },
    { label: 'Tissue description', test: t => /gingiv(al|a)\s*(tissue|appear|color|erythema|edema|inflam|recession|bleed)|tissue\s*(is|was|appears?)\s*(erythematous|edematous|inflam|healthy|pink)/i.test(t) },
  ],
  dental_endodontic: [
    { label: 'Pulp testing documented', test: t => /cold\s*test|EPT|electric\s*pulp\s*test|thermal\s*test|percussion\s*test|palpation\s*test|vitality\s*test|cold\s*(positive|negative|lingering)/i.test(t) },
    { label: 'Working length', test: t => /working\s*length|WL[\s:]+\d|apex\s*locator|electronic\s*length/i.test(t) },
    { label: 'Radiograph referenced', test: t => /pre[\s-]*op(erative)?\s*(radiograph|film|image|x[\s-]*ray)|periapical\s*(radiograph|film|x[\s-]*ray|image)|PA\s*(film|radiograph|x[\s-]*ray)|radiograph/i.test(t) },
    { label: 'Pulpal diagnosis', test: t => /irreversible\s*pulpitis|reversible\s*pulpitis|pulp\s*necrosis|normal\s*pulp|previously\s*(treated|initiated)|symptomatic\s*irreversible/i.test(t) },
    { label: 'Periapical diagnosis', test: t => /symptomatic\s*apical\s*periodontitis|asymptomatic\s*apical\s*periodontitis|acute\s*apical\s*abscess|chronic\s*apical\s*abscess|normal\s*apical\s*tissues|condensing\s*osteitis/i.test(t) },
    { label: 'Tooth identified', test: t => /tooth\s*#?\s*\d{1,2}\b|#\d{1,2}\b|\b(upper|lower|maxillary|mandibular)\s*(right|left)?\s*(first|second|third)?\s*(molar|premolar|bicuspid|canine|incisor)/i.test(t) },
    { label: 'Anesthesia documented', test: t => /anesth|lidocaine|articaine|local\s*(anesthetic|infiltrat)|nerve\s*block|inferior\s*alveolar|PSA|MSA|mental\s*block/i.test(t) },
    { label: 'Obturation method', test: t => /obturat|gutta[\s-]*percha|lateral\s*condensation|vertical\s*condensation|backfill|sealer/i.test(t) },
  ],
  dental_oral_surgery: [
    { label: 'Extraction technique', test: t => /surgical\s*extract|simple\s*extract|elevat(or|ed|ion)|forcep|section(ed|ing)?|flap\s*(raised|elevat|reflect)|luxat/i.test(t) },
    { label: 'Anesthesia documented', test: t => /anesth|lidocaine|articaine|nerve\s*block|infiltrat|IAN\s*block|local\s*anesthetic|bupivacaine/i.test(t) },
    { label: 'Complications/outcome', test: t => /complication|uneventful|without\s*(incident|complication)|hemorrhage|paresthesia|dry\s*socket|no\s*(adverse|complication)|procedure\s*tolerated\s*well/i.test(t) },
    { label: 'Hemostasis achieved', test: t => /hemostasis\s*(achieved|obtained|confirmed)|bleeding\s*control|gauze\s*(pressure|bite|pack)|sutur(e|ed|ing)|gelfoam|collagen\s*plug|surgicel/i.test(t) },
    { label: 'Post-op instructions', test: t => /post[\s-]*op(erative)?\s*instruction|discharge\s*instruction|follow[\s-]*up|return\s*if|prescri(bed|ption)|antibiot|analges|ice\s*pack|soft\s*diet/i.test(t) },
    { label: 'Tooth/site identified', test: t => /tooth\s*#?\s*\d{1,2}\b|#\d{1,2}\b|third\s*molar|wisdom\s*tooth|site\s*#?\s*\d/i.test(t) },
  ],
  dental_prosthodontic: [
    { label: 'Abutment/tooth assessment', test: t => /abutment|Kennedy\s*class|remaining\s*tooth\s*structure|crown[\s-]*to[\s-]*root\s*ratio|retainer|preparation\s*design|ferrule/i.test(t) },
    { label: 'Occlusion evaluated', test: t => /occlus(ion|al)|bite\s*(registration|check|adjustment)|centric\s*(relation|occlusion)|vertical\s*dimension|articulating\s*paper|lateral\s*excursion/i.test(t) },
    { label: 'Material selection', test: t => /porcelain|ceramic|zirconia|PFM|acrylic|e[\s.]?max|lithium\s*disilicate|gold|noble\s*metal|composite\s*resin|PMMA|monolithic/i.test(t) },
    { label: 'Shade selection', test: t => /shade\s*(select|match|guide|tab)|VITA\b|[A-D][1-4]\b|bleach\s*shade|stump\s*shade|custom\s*shade/i.test(t) },
    { label: 'Impression/scan taken', test: t => /impression|digital\s*scan|PVS|polyvinyl|alginate|intraoral\s*scan|iTero|CEREC|final\s*impression|bite\s*registration/i.test(t) },
    { label: 'Margins documented', test: t => /margin(s|al)?|subgingival|supragingival|equigingival|chamfer|shoulder\s*prep|finish\s*line|cord\s*pack/i.test(t) },
  ],
  dental_general: [
    { label: 'Extraoral exam', test: t => /extraoral\s*(exam|findings)|TMJ|lymph\s*(node|adenopathy)|facial\s*symmetry|head\s*and\s*neck|cervical\s*lymph|temporomandibular/i.test(t) },
    { label: 'Intraoral exam', test: t => /intraoral\s*(exam|findings)|soft\s*tissue\s*(exam|normal|WNL)|gingiv(a|al)|oral\s*mucosa|hard\s*palate|tongue\s*(exam|normal)|floor\s*of\s*mouth|buccal\s*mucosa/i.test(t) },
    { label: 'Radiographic findings', test: t => /radiograph(ic)?\s*(findings|review|exam|reveal)|x[\s-]*ray\s*(findings|review)|bitewing|periapical|panoramic|CBCT|FMX|radiolucen|radiopaq/i.test(t) },
    { label: 'Caries risk assessment', test: t => /caries\s*risk\s*(assessment|level|category)|low[\s-]*risk|moderate[\s-]*risk|high[\s-]*risk|CAMBRA|caries\s*management/i.test(t) },
    { label: 'Oral cancer screening', test: t => /oral\s*cancer\s*screen|cancer\s*screen|lesion|suspicious\s*(area|finding)|biopsy|no\s*(lesion|suspicious|abnormal)|WNL|within\s*normal\s*limits/i.test(t) },
    { label: 'Existing restorations noted', test: t => /existing\s*restoration|existing\s*(crown|filling|bridge|implant|denture)|restoration\s*(intact|defective|satisfactory)|previously\s*restored/i.test(t) },
  ],
};

export function scoreDocumentation(noteSections, templateId, dentalChart) {
  const fullText = noteSections.sections.map(s => {
    const el = document.getElementById(`section-${s.key}`);
    const body = el ? el.innerText : s.content;
    return (s.title ? s.title + ':\n' : '') + body;
  }).join('\n');
  const rules = [...(SCORING_RULES._general || []), ...(SCORING_RULES[templateId] || [])];
  if (rules.length === 0) return null;
  const items = rules.map(r => ({ label: r.label, present: r.test(fullText, dentalChart) }));
  const score = Math.round((items.filter(i => i.present).length / items.length) * 100);
  return { score, items, level: score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red' };
}

export function renderDocScore(result) {
  const p = document.getElementById('docScorePanel');
  if (!p || !result) return;
  p.style.display = 'block';
  const colors = { green: '#34D399', yellow: '#FBBF24', red: '#F87171' };
  p.innerHTML = `<div class="doc-score-header"><span class="doc-score-badge" style="background:${colors[result.level]}">${result.score}%</span><span class="doc-score-title">Documentation Completeness</span></div><div class="doc-score-checklist">${result.items.map(i => `<div class="doc-score-item ${i.present ? 'doc-score-present' : 'doc-score-missing'}"><span class="doc-score-icon">${i.present ? '\u2713' : '\u2717'}</span> ${esc(i.label)}</div>`).join('')}</div>`;
}

/* ── Insurance Narrative Generation ── */

const NARRATIVE_PROMPT = `You are a dental insurance narrative specialist. Write a 3-7 sentence professional narrative justifying medical necessity for the documented procedures.

RULES:
- Reference SPECIFIC clinical data: exact probing depths, BOP percentage, radiographic bone loss, tooth diagnoses
- Use proper dental terminology and CDT/ICD-10 references where applicable
- Vary by procedure type: SRP -> cite pockets/BOP/bone loss; Crown -> structural compromise; Endo -> pulpal diagnosis; Extraction -> surgical indications
- Do NOT include patient name — use "[Patient]" placeholder
- Output ONLY the narrative text, no headers or formatting

DENTAL CHART DATA:
{{DENTAL_CHART}}

CLINICAL NOTE:
{{NOTE_TEXT}}`;

export async function generateInsuranceNarrative() {
  if (!App.noteSections?.sections) { toast('Generate a note first.', 'warning'); return; }

  const noteText = App.noteSections.sections.map(s => {
    const el = document.getElementById(`section-${s.key}`);
    return s.title + ':\n' + (el ? el.innerText : s.content);
  }).join('\n\n');

  const chartData = formatDentalChartForPrompt();
  const prompt = NARRATIVE_PROMPT
    .replace('{{DENTAL_CHART}}', chartData || '[No dental chart findings]')
    .replace('{{NOTE_TEXT}}', noteText);

  const panel = document.getElementById('narrativePanel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = '<div class="narrative-header"><span class="narrative-title">Insurance Narrative</span></div><div class="narrative-body" style="opacity:0.5;">Generating narrative...</div>';
  updStatus('generating', 'Narrative');

  let text = '';
  try {
    if (App.claudeKey) {
      text = await _streamClaude(prompt, 0.3, 1024);
    } else if (App.ollamaConnected) {
      text = await _streamOllama(prompt, 0.3, 4096);
    } else {
      toast('No AI engine available — configure Claude or Ollama in Settings.', 'error');
      panel.style.display = 'none';
      updStatus('ready');
      return;
    }
  } catch (e) {
    toast('Narrative generation failed: ' + e.message, 'error');
    panel.style.display = 'none';
    updStatus('ready');
    return;
  }

  App.insuranceNarrative = text;
  renderNarrativePanel(text);
  updStatus('ready');
  toast('Insurance narrative generated', 'success');
}

export function renderNarrativePanel(text) {
  const p = document.getElementById('narrativePanel');
  if (!p) return;
  p.style.display = 'block';
  p.innerHTML = `<div class="narrative-header"><span class="narrative-title">Insurance Narrative</span><button class="icon-btn" id="copyNarrativeBtn" data-tooltip="Copy"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div><div class="narrative-body">${esc(text).replace(/\n/g, '<br>')}</div>`;
  document.getElementById('copyNarrativeBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(() => toast('Narrative copied', 'success'));
  });
}

/* ── Lightweight AI Helpers (reuse same engines as notes.js) ── */

async function _streamOllama(prompt, temperature, numCtx) {
  const r = await fetch(App.ollamaUrl + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: App.ollamaModel, prompt, stream: false, options: { temperature, num_ctx: numCtx || 4096 } })
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const j = await r.json();
  return j.response || '';
}

async function _streamClaude(prompt, temperature, maxTokens) {
  if (!App.claudeKey) throw new Error('No API key');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': App.claudeKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: App.cloudModel || 'claude-haiku-4-5-20251001', max_tokens: maxTokens || 1024, temperature, messages: [{ role: 'user', content: prompt }] })
  });
  if (!r.ok) throw new Error(`Claude ${r.status}`);
  const j = await r.json();
  return j.content?.[0]?.text || '';
}
