const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'Lista de participantes_plantilla.xlsx');
const SHEET_PATH = 'xl/worksheets/sheet1.xml';

const HEADER_MERGES = [
  'I5:I6',
  'J5:J6',
  'K5:K6',
  'L5:L6',
  'B1:L1',
  'B2:L2',
  'B3:C3',
  'D3:I3',
  'B4:L4',
  'B5:B6',
  'C5:C6',
  'D5:D6',
  'E5:E6',
  'F5:G5',
  'H5:H6',
];

function workshopParticipantsWorkbook({ workshop, registrations }) {
  if (!workshop) {
    const error = new Error('WORKSHOP_NOT_FOUND');
    error.statusCode = 404;
    throw error;
  }

  const participants = workshopParticipants(workshop.workshop_id, registrations);
  const zip = new AdmZip(fs.readFileSync(TEMPLATE_PATH));
  const sheetEntry = zip.getEntry(SHEET_PATH);
  if (!sheetEntry) throw new Error('WORKSHOP_PARTICIPANTS_TEMPLATE_SHEET_NOT_FOUND');

  const sheetXml = sheetEntry.getData().toString('utf8');
  const nextSheetXml = buildSheetXml(sheetXml, workshop, participants);
  zip.updateFile(SHEET_PATH, Buffer.from(nextSheetXml, 'utf8'));
  return zip.toBuffer();
}

function workshopParticipants(workshopId, registrations) {
  return (registrations || [])
    .map(registration => ({
      registration,
      participation: (registration.participations || []).find(item => item.workshop_id === workshopId),
    }))
    .filter(item => item.participation)
    .sort((a, b) => participantSortKey(a.registration).localeCompare(participantSortKey(b.registration), 'es'));
}

function buildSheetXml(templateXml, workshop, participants) {
  const sheetDataMatch = templateXml.match(/<sheetData>[\s\S]*?<\/sheetData>/);
  if (!sheetDataMatch) throw new Error('WORKSHOP_PARTICIPANTS_TEMPLATE_SHEET_DATA_NOT_FOUND');

  const prefix = templateXml.slice(0, sheetDataMatch.index).replace(/<dimension ref="[^"]+"\/>/, dimension(participants));
  let suffix = templateXml.slice(sheetDataMatch.index + sheetDataMatch[0].length);
  suffix = replaceMergeCells(suffix, footerRowNumber(participants));

  const rows = [
    rowFromTemplate(templateXml, 1),
    rowFromTemplate(templateXml, 2),
    infoRow(workshop),
    rowFromTemplate(templateXml, 4),
    rowFromTemplate(templateXml, 5),
    rowFromTemplate(templateXml, 6),
    ...participantRows(participants),
    footerRow(footerRowNumber(participants)),
  ].join('');

  return `${prefix}<sheetData>${rows}</sheetData>${suffix}`;
}

function rowFromTemplate(xml, rowNumber) {
  const match = xml.match(new RegExp(`<row r="${rowNumber}"[\\s\\S]*?<\\/row>`));
  if (!match) throw new Error(`WORKSHOP_PARTICIPANTS_TEMPLATE_ROW_${rowNumber}_NOT_FOUND`);
  return match[0];
}

function infoRow(workshop) {
  return `<row r="3" spans="1:26" ht="30" customHeight="1" x14ac:dyDescent="0.25">`
    + blankCell('A', 3, 1)
    + inlineCell('B', 3, 42, `Fecha: ${formatWorkshopDate(workshop.starts_at)}`)
    + blankCell('C', 3, 37)
    + inlineCell('D', 3, 43, `Actividad: ${workshop.title || ''}`)
    + blankCell('E', 3, 44)
    + blankCell('F', 3, 44)
    + blankCell('G', 3, 44)
    + blankCell('H', 3, 44)
    + blankCell('I', 3, 44)
    + inlineCell('J', 3, 2, `Lugar: ${workshopLocation(workshop)}`)
    + sharedCell('K', 3, 3, 4)
    + blankCell('L', 3, 4)
    + blankTail(3)
    + '</row>';
}

function participantRows(participants) {
  const visibleParticipants = participants.length ? participants : [{ registration: {}, participation: {} }];
  return visibleParticipants.map((item, index) => participantRow(7 + index, index + 1, item.registration)).join('');
}

function participantRow(rowNumber, number, registration) {
  const age = ageMarks(registration.age_range);
  return `<row r="${rowNumber}" spans="1:26" ht="30" customHeight="1" x14ac:dyDescent="0.25">`
    + blankCell('A', rowNumber, 1)
    + numericCell('B', rowNumber, 16, number)
    + inlineCell('C', rowNumber, 17, registration.first_name || '')
    + inlineCell('D', rowNumber, 18, registration.last_names || '')
    + inlineCell('E', rowNumber, 19, genderMark(registration.gender))
    + inlineCell('F', rowNumber, 19, age.young)
    + inlineCell('G', rowNumber, 20, age.older)
    + inlineCell('H', rowNumber, 21, registration.phone || '')
    + inlineCell('I', rowNumber, 20, registration.institution || '')
    + inlineCell('J', rowNumber, 20, registration.position_title || '')
    + inlineCell('K', rowNumber, 22, registration.province || '')
    + blankCell('L', rowNumber, 23)
    + blankTail(rowNumber)
    + '</row>';
}

function footerRow(rowNumber) {
  return `<row r="${rowNumber}" spans="1:26" ht="19.5" customHeight="1" x14ac:dyDescent="0.25">`
    + blankCell('A', rowNumber, 1)
    + sharedCell('B', rowNumber, 34, 18)
    + blankCell('C', rowNumber, 35)
    + blankCell('D', rowNumber, 35)
    + ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(column => blankCell(column, rowNumber, 1)).join('')
    + blankTail(rowNumber)
    + '</row>';
}

function replaceMergeCells(suffix, footerRow) {
  const mergeCells = `<mergeCells count="${HEADER_MERGES.length + 1}">`
    + HEADER_MERGES.map(ref => `<mergeCell ref="${ref}"/>`).join('')
    + `<mergeCell ref="B${footerRow}:D${footerRow}"/>`
    + '</mergeCells>';
  if (/<mergeCells[\s\S]*?<\/mergeCells>/.test(suffix)) {
    return suffix.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeCells);
  }
  return suffix.replace('<printOptions', `${mergeCells}<printOptions`);
}

function dimension(participants) {
  return `<dimension ref="A1:Z${footerRowNumber(participants)}"/>`;
}

function footerRowNumber(participants) {
  return 7 + Math.max(participants.length, 1);
}

function inlineCell(column, row, style, value) {
  const text = String(value || '');
  if (!text) return blankCell(column, row, style);
  return `<c r="${column}${row}" s="${style}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
}

function sharedCell(column, row, style, sharedStringIndex) {
  return `<c r="${column}${row}" s="${style}" t="s"><v>${sharedStringIndex}</v></c>`;
}

function numericCell(column, row, style, value) {
  return `<c r="${column}${row}" s="${style}"><v>${Number(value) || 0}</v></c>`;
}

function blankCell(column, row, style) {
  return `<c r="${column}${row}" s="${style}"/>`;
}

function blankTail(row) {
  return ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
    .map(column => blankCell(column, row, 1))
    .join('');
}

function formatWorkshopDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-CU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function workshopLocation(workshop) {
  return [workshop.venue, workshop.room].filter(Boolean).join(' - ');
}

function genderMark(value) {
  const normalized = normalize(value);
  if (normalized.includes('femenino') || normalized.includes('mujer')) return 'F';
  if (normalized.includes('masculino') || normalized.includes('hombre')) return 'M';
  if (normalized) return 'O';
  return '';
}

function ageMarks(value) {
  const normalized = normalize(value);
  if (!normalized) return { young: '', older: '' };
  if (normalized.includes('18') && normalized.includes('35')) return { young: 'X', older: '' };
  return { young: '', older: 'X' };
}

function participantSortKey(registration) {
  return normalize(`${registration.last_names || ''} ${registration.first_name || ''} ${registration.email || ''}`);
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  workshopParticipantsWorkbook,
};
