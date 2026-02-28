import { describe, it, expect } from 'vitest';
import { TEMPLATE_CATEGORIES, TEMPLATES, getTemplateRegistry, CODING_PROMPT } from '../src/templates.js';

describe('TEMPLATE_CATEGORIES', () => {
  it('has 5 categories', () => {
    expect(TEMPLATE_CATEGORIES).toHaveLength(5);
  });
  it('includes general, behavioral, specialty, dental, custom', () => {
    const ids = TEMPLATE_CATEGORIES.map(c => c.id);
    expect(ids).toContain('general');
    expect(ids).toContain('behavioral');
    expect(ids).toContain('specialty');
    expect(ids).toContain('dental');
    expect(ids).toContain('custom');
  });
});

describe('TEMPLATES', () => {
  const ids = Object.keys(TEMPLATES);

  it('has at least 15 built-in templates', () => {
    expect(ids.length).toBeGreaterThanOrEqual(15);
  });

  it('includes the 3 original formats', () => {
    expect(TEMPLATES.soap).toBeDefined();
    expect(TEMPLATES.hpi).toBeDefined();
    expect(TEMPLATES.problem).toBeDefined();
  });

  it('includes specialty templates', () => {
    expect(TEMPLATES.dap).toBeDefined();
    expect(TEMPLATES.birp).toBeDefined();
    expect(TEMPLATES.cardiology).toBeDefined();
    expect(TEMPLATES.emergency).toBeDefined();
  });

  it('every template has required fields', () => {
    for (const [id, tmpl] of Object.entries(TEMPLATES)) {
      expect(tmpl.id, `${id} missing id`).toBe(id);
      expect(tmpl.label, `${id} missing label`).toBeTruthy();
      expect(tmpl.category, `${id} missing category`).toBeTruthy();
      expect(tmpl.sections, `${id} missing sections`).toBeInstanceOf(Array);
      expect(tmpl.sections.length, `${id} needs >=2 sections`).toBeGreaterThanOrEqual(2);
      expect(tmpl.noteTitle, `${id} missing noteTitle`).toBeTruthy();
      expect(tmpl.prompt, `${id} missing prompt`).toBeTruthy();
    }
  });

  it('every template category matches a valid category', () => {
    const validCats = TEMPLATE_CATEGORIES.map(c => c.id);
    for (const [id, tmpl] of Object.entries(TEMPLATES)) {
      expect(validCats, `${id} has invalid category "${tmpl.category}"`).toContain(tmpl.category);
    }
  });

  it('prompts contain **HEADER** markers matching sections', () => {
    for (const [id, tmpl] of Object.entries(TEMPLATES)) {
      for (const section of tmpl.sections) {
        expect(tmpl.prompt, `${id} prompt missing **${section.toUpperCase()}**`).toContain(`**${section.toUpperCase()}`);
      }
    }
  });
});

describe('getTemplateRegistry', () => {
  it('returns all built-in templates when no custom templates exist', () => {
    const mockCfg = { get: () => '[]' };
    const registry = getTemplateRegistry(mockCfg);
    expect(Object.keys(registry).length).toBeGreaterThanOrEqual(15);
    expect(registry.soap).toBeDefined();
  });

  it('merges custom templates into registry', () => {
    const custom = [{ id: 'custom_test', label: 'Test', category: 'custom', sections: ['A', 'B'], noteTitle: 'Test Note', prompt: '**A**\n**B**' }];
    const mockCfg = { get: () => JSON.stringify(custom) };
    const registry = getTemplateRegistry(mockCfg);
    expect(registry.custom_test).toBeDefined();
    expect(registry.custom_test.label).toBe('Test');
  });

  it('handles malformed custom templates JSON gracefully', () => {
    const mockCfg = { get: () => 'not json' };
    const registry = getTemplateRegistry(mockCfg);
    expect(Object.keys(registry).length).toBeGreaterThanOrEqual(15);
  });

  it('handles missing cfg gracefully', () => {
    const registry = getTemplateRegistry(null);
    expect(Object.keys(registry).length).toBeGreaterThanOrEqual(15);
  });
});

describe('CODING_PROMPT', () => {
  it('contains {{NOTE_TEXT}} placeholder', () => {
    expect(CODING_PROMPT).toContain('{{NOTE_TEXT}}');
  });
  it('mentions ICD-10', () => {
    expect(CODING_PROMPT).toContain('ICD-10');
  });
  it('mentions CPT', () => {
    expect(CODING_PROMPT).toContain('CPT');
  });
  it('mentions E&M or E/M', () => {
    expect(CODING_PROMPT.includes('E&M') || CODING_PROMPT.includes('E/M')).toBe(true);
  });
});
