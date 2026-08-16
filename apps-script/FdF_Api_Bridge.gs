/**
 * FdF 2026 - Google Form to API bridge.
 *
 * This file does not create, edit, regenerate or publish the Google Form.
 * It only sends submitted responses to the backend API from an installable
 * on form submit trigger.
 *
 * Required Script Properties:
 * - FDF_API_URL: base URL, for example https://fdf.example.org
 * - FDF_API_TOKEN: bearer token configured on the backend
 */

function FdF_onFormSubmitToApi(e) {
  return FdF_withApiBridgeLock_(function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = FdF_buildApiBridgePublicConfig_(ss);
    const namedValues = e && e.namedValues ? e.namedValues : {};
    const responses = FdF_mergeObjects_(
      FdF_mapNamedValuesToFdfCodes_(namedValues, config),
      FdF_mapEventRowToFdfCodes_(e, config)
    );
    const documents = FdF_documentsFromMappedResponses_(responses);
    const sourceReference = FdF_formSubmitSourceReference_(e, responses);

    return FdF_postGoogleSubmission_(ss, sourceReference, {
      sourceReference: sourceReference,
      submittedAt: new Date().toISOString(),
      responses: responses,
      documents: documents,
    });
  });
}

function FdF_reenviarFilaActivaAApi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  if (row <= 1) {
    throw new Error('Seleccione una fila de respuesta, no el encabezado.');
  }
  return FdF_sendSheetRowToApi_(ss, sheet, row);
}

function FdF_reenviarUltimaRespuestaAApi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = FdF_buildApiBridgePublicConfig_(ss);
  const sheet = FdF_getLikelyResponseSheet_(ss, config);
  const row = sheet.getLastRow();
  if (row <= 1) {
    throw new Error('No hay filas de respuesta para reenviar.');
  }
  return FdF_sendSheetRowToApi_(ss, sheet, row);
}

function FdF_verificarApiBridgeConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const runtime = FdF_apiBridgeRuntime_();
  const config = FdF_buildApiBridgePublicConfig_(ss);
  const responseSheet = FdF_getLikelyResponseSheet_(ss, config);
  const result = {
    api_url_configurada: !!runtime.apiUrl,
    api_token_configurado: !!runtime.apiToken,
    campos_publicos: config.fields.length,
    hoja_respuestas_detectada: responseSheet.getName(),
    filas_respuestas: Math.max(0, responseSheet.getLastRow() - 1),
  };
  FdF_alertOrLog_(JSON.stringify(result, null, 2));
  return result;
}

function FdF_probarConexionApi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const runtime = FdF_apiBridgeRuntime_();
  const response = UrlFetchApp.fetch(
    runtime.apiUrl.replace(/\/$/, '') + '/health',
    {
      method: 'get',
      muteHttpExceptions: true,
    }
  );
  const code = response.getResponseCode();
  const body = response.getContentText();
  FdF_logApiBridge_(ss, 'health-check', code, body, null);
  if (code < 200 || code >= 300) {
    throw new Error('FDF API health returned HTTP ' + code + ': ' + body);
  }
  FdF_alertOrLog_('Conexion API OK: HTTP ' + code);
  return body;
}

function FdF_instalarTriggerApiBridge() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === 'FdF_onFormSubmitToApi') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('FdF_onFormSubmitToApi')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
  FdF_alertOrLog_('Trigger instalado: FdF_onFormSubmitToApi');
}

function FdF_reenviarErroresApiBridge() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = FdF_buildApiBridgePublicConfig_(ss);
  const responseSheet = FdF_getLikelyResponseSheet_(ss, config);
  const log = ss.getSheetByName('23_API_Bridge_Log');
  if (!log || log.getLastRow() <= 1) {
    throw new Error('No hay registros de log para revisar.');
  }

  const headers = log.getRange(1, 1, 1, log.getLastColumn()).getValues()[0]
    .map(function(header) { return String(header || '').trim(); });
  const rows = log.getRange(2, 1, log.getLastRow() - 1, log.getLastColumn()).getValues();
  const refs = {};
  rows.forEach(function(row) {
    const status = FdF_logCell_(row, headers, 'status', '');
    const sourceReference = FdF_logCell_(row, headers, 'source_reference', row[1] || '');
    const httpStatus = Number(FdF_logCell_(row, headers, 'http_status', row[2] || 0));
    if (status === 'OK' || (httpStatus >= 200 && httpStatus < 300)) {
      return;
    }
    if (sourceReference.indexOf('google-form-row-') === 0) {
      refs[sourceReference] = true;
    }
  });

  const resent = [];
  Object.keys(refs).slice(0, 25).forEach(function(sourceReference) {
    const row = Number(sourceReference.replace('google-form-row-', ''));
    if (row > 1 && row <= responseSheet.getLastRow()) {
      FdF_sendSheetRowToApi_(ss, responseSheet, row);
      resent.push(sourceReference);
    }
  });
  FdF_alertOrLog_('Reenvios ejecutados: ' + resent.length);
  return resent;
}

function FdF_buildApiBridgePublicConfig_(ss) {
  const sh = ss.getSheetByName('13_Formulario_Publico');
  if (!sh) {
    throw new Error('No existe 13_Formulario_Publico.');
  }
  const rows = sh.getDataRange().getValues();
  const fields = rows.slice(1)
    .filter(row => row[0])
    .map(row => ({
      code: String(row[0]),
      question: String(row[3]),
      type: String(row[4]),
    }));

  const questionToCode = {};
  const normalizedQuestionToCode = {};
  fields.forEach(field => {
    questionToCode[field.question] = field.code;
    normalizedQuestionToCode[FdF_normalizeHeader_(field.question)] = field.code;
  });
  return {
    fields: fields,
    questionToCode: questionToCode,
    normalizedQuestionToCode: normalizedQuestionToCode,
  };
}

function FdF_mapNamedValuesToFdfCodes_(namedValues, config) {
  const responses = {};
Object.keys(namedValues || {}).forEach(question => {
    const code = FdF_codeForQuestion_(question, config);
    if (!code) {
      return;
    }
    const values = namedValues[question] || [];
    const field = config.fields.find(item => item.code === code);
    if (field && field.type === 'Casillas') {
      responses[code] = values.length === 1
        ? String(values[0]).split(/,\s*/).filter(Boolean)
        : values;
    } else {
      responses[code] = values.length > 1 ? values.join(', ') : String(values[0] || '');
    }
  });
  return responses;
}

function FdF_mapEventRowToFdfCodes_(e, config) {
  if (!e || !e.range) {
    return {};
  }
  const sheet = e.range.getSheet();
  return FdF_mapSheetRowToFdfCodes_(sheet, e.range.getRow(), config);
}

function FdF_mapSheetRowToFdfCodes_(sheet, row, config) {
  if (!sheet || row <= 1) {
    return {};
  }
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const values = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];
  const responses = {};

  headers.forEach((header, index) => {
    const code = FdF_codeForQuestion_(String(header || ''), config);
    if (!code) {
      return;
    }
    const field = config.fields.find(item => item.code === code);
    responses[code] = FdF_normalizeBridgeValue_(values[index], field);
  });

  return responses;
}

function FdF_codeForQuestion_(question, config) {
  if (config.questionToCode[question]) {
    return config.questionToCode[question];
  }

  const normalized = FdF_normalizeHeader_(question);
  if (config.normalizedQuestionToCode[normalized]) {
    return config.normalizedQuestionToCode[normalized];
  }

  if (FdF_containsAll_(normalized, ['adjunte', 'carta', 'aval'])) {
    return 'FDF-17';
  }
  if (FdF_containsAll_(normalized, ['curriculum', 'vitae'])) {
    return 'FDF-27';
  }
  return '';
}

function FdF_normalizeBridgeValue_(value, field) {
  if (field && field.type === 'Casillas') {
    return Array.isArray(value)
      ? value
      : String(value || '').split(/,\s*/).map(item => item.trim()).filter(Boolean);
  }
  return String(value || '').trim();
}

function FdF_documentsFromMappedResponses_(responses) {
  const docs = [];
  if (responses['FDF-17']) {
    docs.push({
      document_type: 'CARTA_AVAL',
      original_name: FdF_bridgeOriginalName_(responses['FDF-17'], 'carta-aval'),
      storage_reference: String(responses['FDF-17']),
      status: 'RECEIVED',
    });
  }
  if (responses['FDF-27']) {
    docs.push({
      document_type: 'CURRICULUM_VITAE',
      original_name: FdF_bridgeOriginalName_(responses['FDF-27'], 'curriculum-vitae'),
      storage_reference: String(responses['FDF-27']),
      status: 'RECEIVED',
    });
  }
  return docs;
}

function FdF_sendSheetRowToApi_(ss, sheet, row) {
  const config = FdF_buildApiBridgePublicConfig_(ss);
  const responses = FdF_mapSheetRowToFdfCodes_(sheet, row, config);
  const documents = FdF_documentsFromMappedResponses_(responses);
  const sourceReference = 'google-form-row-' + row;

  return FdF_postGoogleSubmission_(ss, sourceReference, {
    sourceReference: sourceReference,
    submittedAt: new Date().toISOString(),
    responses: responses,
    documents: documents,
  });
}

function FdF_postGoogleSubmission_(ss, sourceReference, payload) {
  const runtime = FdF_apiBridgeRuntime_();

  const response = UrlFetchApp.fetch(
    runtime.apiUrl.replace(/\/$/, '') + '/api/submissions/google-form',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + runtime.apiToken,
      },
      muteHttpExceptions: true,
      payload: JSON.stringify(payload),
    }
  );

  const code = response.getResponseCode();
  const body = response.getContentText();
  FdF_logApiBridge_(ss, sourceReference, code, body, payload);

  if (code < 200 || code >= 300) {
    throw new Error('FDF API returned HTTP ' + code + ': ' + body);
  }

  return body;
}

function FdF_apiBridgeRuntime_() {
  const props = PropertiesService.getScriptProperties();
  const apiUrl = props.getProperty('FDF_API_URL');
  const apiToken = props.getProperty('FDF_API_TOKEN');

  if (!apiUrl) {
    throw new Error('Missing Script Property FDF_API_URL.');
  }
  if (!apiToken) {
    throw new Error('Missing Script Property FDF_API_TOKEN.');
  }
  return {
    apiUrl: apiUrl,
    apiToken: apiToken,
  };
}

function FdF_bridgeOriginalName_(reference, fallback) {
  const clean = String(reference || '').trim();
  if (!clean) {
    return fallback;
  }
  const parts = clean.split(/[\\/]/);
  return parts[parts.length - 1] || fallback;
}

function FdF_formSubmitSourceReference_(e, responses) {
  if (e && e.range) {
    return 'google-form-row-' + e.range.getRow();
  }
  if (e && e.response && e.response.getId) {
    return 'google-form-response-' + e.response.getId();
  }
  return 'google-form-' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(responses)
    )
  );
}

function FdF_logApiBridge_(ss, sourceReference, httpStatus, responseBody, payload) {
  const sheetName = '23_API_Bridge_Log';
  const sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      'timestamp',
      'status',
      'source_reference',
      'http_status',
      'candidate_id',
      'submission_id',
      'eligibility_status',
      'normalization_status',
      'response_body',
      'payload_hash',
    ]);
  }
  const parsed = FdF_parseJsonSafe_(responseBody);
  sh.appendRow([
    new Date().toISOString(),
    httpStatus >= 200 && httpStatus < 300 ? 'OK' : 'ERROR',
    sourceReference,
    httpStatus,
    parsed && parsed.candidate_id ? parsed.candidate_id : '',
    parsed && parsed.submission_id ? parsed.submission_id : '',
    parsed && parsed.eligibility_status ? parsed.eligibility_status : '',
    parsed && parsed.normalization_status ? parsed.normalization_status : '',
    responseBody,
    payload ? FdF_payloadHash_(payload) : '',
  ]);
}

function FdF_getLikelyResponseSheet_(ss, config) {
  const active = ss.getActiveSheet();
  if (FdF_isLikelyResponseSheet_(active, config)) {
    return active;
  }
  const sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (FdF_isLikelyResponseSheet_(sheets[i], config)) {
      return sheets[i];
    }
  }
  throw new Error('No se pudo detectar una hoja de respuestas del Google Form.');
}

function FdF_isLikelyResponseSheet_(sheet, config) {
  if (!sheet || sheet.getLastRow() <= 1 || sheet.getLastColumn() <= 1) {
    return false;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const mapped = headers.filter(function(header) {
    return !!FdF_codeForQuestion_(String(header || ''), config);
  }).length;
  return mapped >= 10;
}

function FdF_mergeObjects_(primary, secondary) {
  const out = {};
  Object.keys(primary || {}).forEach(key => out[key] = primary[key]);
  Object.keys(secondary || {}).forEach(key => {
    if (!FdF_bridgeHasValue_(out[key]) && FdF_bridgeHasValue_(secondary[key])) {
      out[key] = secondary[key];
    }
  });
  return out;
}

function FdF_bridgeHasValue_(value) {
  return Array.isArray(value)
    ? value.length > 0
    : String(value || '').trim() !== '';
}

function FdF_normalizeHeader_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function FdF_containsAll_(value, words) {
  return words.every(word => value.indexOf(word) !== -1);
}

function FdF_parseJsonSafe_(value) {
  try {
    return JSON.parse(String(value || '{}'));
  } catch (error) {
    return null;
  }
}

function FdF_logCell_(row, headers, name, fallback) {
  const index = headers.indexOf(name);
  return index === -1 ? fallback : row[index];
}

function FdF_payloadHash_(payload) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(payload)
    )
  );
}

function FdF_withApiBridgeLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function FdF_alertOrLog_(message) {
  try {
    SpreadsheetApp.getUi().alert(String(message));
  } catch (error) {
    Logger.log(String(message));
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    FdF_mapNamedValuesToFdfCodes_,
    FdF_mapSheetRowToFdfCodes_,
    FdF_documentsFromMappedResponses_,
    FdF_bridgeOriginalName_,
    FdF_mergeObjects_,
    FdF_normalizeHeader_,
    FdF_containsAll_,
    FdF_parseJsonSafe_,
  };
}
