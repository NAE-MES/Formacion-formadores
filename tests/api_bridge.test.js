const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bridgeSource = fs.readFileSync(path.join(root, 'apps-script', 'FdF_Api_Bridge.gs'), 'utf8');
const publicSchema = JSON.parse(fs.readFileSync(path.join(root, 'config', 'fdf-2026-public-schema.json'), 'utf8'));

const sandbox = {
  module: { exports: {} },
  console,
  Date,
  JSON,
  Object,
  String,
  Array,
};
vm.createContext(sandbox);
vm.runInContext(bridgeSource, sandbox, { filename: 'FdF_Api_Bridge.gs' });

const bridge = sandbox.module.exports;

function configFromPublicSchema() {
  const fields = publicSchema.fields.map(field => ({
    code: field.code,
    question: field.question,
    type: field.type,
  }));
  const questionToCode = {};
  const normalizedQuestionToCode = {};
  fields.forEach(field => {
    questionToCode[field.question] = field.code;
    normalizedQuestionToCode[bridge.FdF_normalizeHeader_(field.question)] = field.code;
  });
  return { fields, questionToCode, normalizedQuestionToCode };
}

function fakeSheet(headers, values) {
  return {
    getLastColumn() {
      return headers.length;
    },
    getRange(row) {
      return {
        getValues() {
          return [row === 1 ? headers : values];
        },
      };
    },
  };
}

test('maps Google named values to official FDF codes', () => {
  const config = configFromPublicSchema();
  const question = publicSchema.fields.find(field => field.code === 'FDF-01').question;
  const responses = bridge.FdF_mapNamedValuesToFdfCodes_({
    [question]: ['Ana'],
  }, config);

  assert.equal(responses['FDF-01'], 'Ana');
});

test('maps Google file upload headers to document fields using fuzzy fallback', () => {
  const config = configFromPublicSchema();
  const sheet = fakeSheet(
    [
      'Marca temporal',
      'Adjunte la carta aval institucional en formato PDF',
      'Adjunte su currículum vitae actualizado',
    ],
    [
      '2026-08-15 10:00:00',
      'https://drive.example.test/carta.pdf',
      'https://drive.example.test/cv.pdf',
    ],
  );

  const responses = bridge.FdF_mapSheetRowToFdfCodes_(sheet, 2, config);
  const documents = bridge.FdF_documentsFromMappedResponses_(responses);

  assert.equal(responses['FDF-17'], 'https://drive.example.test/carta.pdf');
  assert.equal(responses['FDF-27'], 'https://drive.example.test/cv.pdf');
  assert.equal(documents.length, 2);
  assert.equal(documents[0].document_type, 'CARTA_AVAL');
  assert.equal(documents[1].document_type, 'CURRICULUM_VITAE');
});

test('keeps named value unless row mapping provides a missing value', () => {
  const merged = bridge.FdF_mergeObjects_(
    { 'FDF-01': 'Ana', 'FDF-17': '' },
    { 'FDF-01': 'Otra', 'FDF-17': 'https://drive.example.test/carta.pdf' },
  );

  assert.equal(merged['FDF-01'], 'Ana');
  assert.equal(merged['FDF-17'], 'https://drive.example.test/carta.pdf');
});
