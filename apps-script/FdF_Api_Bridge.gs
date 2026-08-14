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
  const props = PropertiesService.getScriptProperties();
  const apiUrl = props.getProperty('FDF_API_URL');
  const apiToken = props.getProperty('FDF_API_TOKEN');

  if (!apiUrl) {
    throw new Error('Missing Script Property FDF_API_URL.');
  }
  if (!apiToken) {
    throw new Error('Missing Script Property FDF_API_TOKEN.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = FdF_buildApiBridgePublicConfig_(ss);
  const namedValues = e && e.namedValues ? e.namedValues : {};
  const responses = FdF_mapNamedValuesToFdfCodes_(namedValues, config);
  const documents = FdF_documentsFromMappedResponses_(responses);
  const sourceReference = FdF_formSubmitSourceReference_(e, responses);

  const payload = {
    sourceReference: sourceReference,
    submittedAt: new Date().toISOString(),
    responses: responses,
    documents: documents,
  };

  const response = UrlFetchApp.fetch(
    apiUrl.replace(/\/$/, '') + '/api/submissions/google-form',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + apiToken,
      },
      muteHttpExceptions: true,
      payload: JSON.stringify(payload),
    }
  );

  const code = response.getResponseCode();
  const body = response.getContentText();
  FdF_logApiBridge_(ss, sourceReference, code, body);

  if (code < 200 || code >= 300) {
    throw new Error('FDF API returned HTTP ' + code + ': ' + body);
  }

  return body;
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
  fields.forEach(field => questionToCode[field.question] = field.code);
  return { fields: fields, questionToCode: questionToCode };
}

function FdF_mapNamedValuesToFdfCodes_(namedValues, config) {
  const responses = {};
  Object.keys(namedValues || {}).forEach(question => {
    const code = config.questionToCode[question];
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

function FdF_logApiBridge_(ss, sourceReference, httpStatus, responseBody) {
  const sheetName = '23_API_Bridge_Log';
  const sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['timestamp', 'source_reference', 'http_status', 'response_body']);
  }
  sh.appendRow([
    new Date().toISOString(),
    sourceReference,
    httpStatus,
    responseBody,
  ]);
}
