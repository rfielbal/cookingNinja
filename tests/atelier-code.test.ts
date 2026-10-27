import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ATELIER_SLIDES } from '../src/atelierSlides';

test('les extraits réels de l’atelier restent présents dans les fichiers indiqués', async () => {
  for (const slide of ATELIER_SLIDES.filter((item) => item.codeKind === 'extrait')) {
    const source = await readFile(slide.sourceFile, 'utf8');
    for (const line of slide.code
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)) {
      assert.ok(
        source.includes(line),
        `${slide.id} : ligne absente de ${slide.sourceFile} : ${line}`,
      );
    }
  }
});

test('chaque étape du lecteur pointe des lignes existantes et non vides', () => {
  for (const slide of ATELIER_SLIDES) {
    const lines = slide.code.split('\n');
    assert.equal(slide.codeSteps.length, 3);
    for (const step of slide.codeSteps) {
      assert.ok(step.lines.length > 0, step.label);
      for (const number of step.lines) {
        assert.ok(
          Number.isInteger(number) && number > 0 && lines[number - 1]?.trim(),
          `${slide.id} : ligne ${number}`,
        );
      }
    }
  }
});
