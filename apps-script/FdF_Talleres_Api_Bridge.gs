/**
 * FdF 2026 - Puente API para el formulario de registro de talleres.
 *
 * Este archivo NO crea formularios. Uselo en el formulario/hoja existente.
 *
 * Script Properties requeridas:
 * - FDF_API_URL: por ejemplo https://fdf-nae.mes.gob.cu
 * - FDF_API_TOKEN: token bearer configurado en el servidor
 */

function instalarTriggerApiRegistroTallerFdF2026() {
  const form = FormApp.getActiveForm();
  if (!form) {
    SpreadsheetApp.getUi().alert('Abra este script desde el formulario de registro para instalar el trigger.');
    return;
  }

  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'enviarRegistroTallerFdF2026Api')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('enviarRegistroTallerFdF2026Api')
    .forForm(form)
    .onFormSubmit()
    .create();

  SpreadsheetApp.getUi().alert('Trigger instalado. Las nuevas respuestas se enviaran a la API de talleres.');
}

function reenviarRegistrosExistentesTallerFdF2026() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = buscarHojaRespuestasRegistroTaller_(ss);
  if (!source) {
    SpreadsheetApp.getUi().alert('No se encontro la hoja de respuestas del formulario.');
    return;
  }

  const values = source.getDataRange().getValues();
  if (values.length < 2) {
    SpreadsheetApp.getUi().alert('No hay respuestas para reenviar.');
    return;
  }

  const headers = values[0].map(String);
  let ok = 0;
  let failed = 0;
  values.slice(1).forEach((row, index) => {
    const responses = {};
    headers.forEach((header, col) => {
      responses[header] = row[col];
    });
    const payload = {
      sourceReference: responses['ID de respuesta'] || 'sheet-row-' + (index + 2) + '|' + (responses['Marca temporal'] || ''),
      registeredAt: responses['Marca temporal'] || new Date().toISOString(),
      responses: responses,
    };
    try {
      const result = enviarPayloadRegistroTaller_(payload);
      registrarEnvioApiRegistroTaller_(payload, result.code, result.body);
      if (result.code >= 200 && result.code < 300) ok += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      registrarEnvioApiRegistroTaller_(payload, 0, error.message);
    }
  });

  SpreadsheetApp.getUi().alert('Reenvio terminado.\nOK: ' + ok + '\nCon error: ' + failed);
}

function enviarRegistroTallerFdF2026Api(e) {
  const payload = payloadRegistroTallerDesdeEvento_(e);
  const result = enviarPayloadRegistroTaller_(payload);
  registrarEnvioApiRegistroTaller_(payload, result.code, result.body);
  if (result.code < 200 || result.code >= 300) {
    throw new Error('La API de talleres respondio HTTP ' + result.code + ': ' + result.body);
  }
}

function probarConexionApiRegistroTallerFdF2026() {
  const runtime = leerConfigApiRegistroTaller_();
  const response = UrlFetchApp.fetch(runtime.apiUrl.replace(/\/$/, '') + '/health', {
    method: 'get',
    muteHttpExceptions: true,
  });
  SpreadsheetApp.getUi().alert('Respuesta API: HTTP ' + response.getResponseCode() + '\n' + response.getContentText());
}

function enviarPayloadRegistroTaller_(payload) {
  const runtime = leerConfigApiRegistroTaller_();
  const response = UrlFetchApp.fetch(
    runtime.apiUrl.replace(/\/$/, '') + '/api/workshop-registrations/google-form',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + runtime.apiToken,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );
  return {
    code: response.getResponseCode(),
    body: response.getContentText(),
  };
}

function payloadRegistroTallerDesdeEvento_(e) {
  const formResponse = e && e.response;
  const responses = {};
  if (formResponse) {
    formResponse.getItemResponses().forEach(itemResponse => {
      responses[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
    });
    return {
      sourceReference: formResponse.getId(),
      registeredAt: formResponse.getTimestamp().toISOString(),
      responses: responses,
    };
  }

  const namedValues = e && e.namedValues ? e.namedValues : {};
  Object.keys(namedValues).forEach(key => {
    responses[key] = Array.isArray(namedValues[key]) ? namedValues[key].join(', ') : namedValues[key];
  });
  return {
    sourceReference: responses['ID de respuesta'] || [responses['Correo electrónico'], responses['Marca temporal']].filter(Boolean).join('|'),
    registeredAt: responses['Marca temporal'] || new Date().toISOString(),
    responses: responses,
  };
}

function leerConfigApiRegistroTaller_() {
  const props = PropertiesService.getScriptProperties();
  const apiUrl = props.getProperty('FDF_API_URL');
  const apiToken = props.getProperty('FDF_API_TOKEN');
  if (!apiUrl) throw new Error('Falta configurar Script Property FDF_API_URL.');
  if (!apiToken) throw new Error('Falta configurar Script Property FDF_API_TOKEN.');
  return { apiUrl: apiUrl, apiToken: apiToken };
}

function registrarEnvioApiRegistroTaller_(payload, code, body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  const sheetName = 'API_Registro_Taller_Log';
  let sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 1, 6).setValues([[
      'Fecha',
      'HTTP',
      'Origen',
      'Correo',
      'Talleres',
      'Respuesta',
    ]]);
  }
  const r = payload.responses || {};
  const talleres = ['Habana', 'Occidente', 'Centro', 'Oriente']
    .filter(taller => ['Presencial', 'Virtual'].indexOf(String(r['Participación en el taller ' + taller] || '').trim()) !== -1)
    .join(', ');
  sh.appendRow([
    new Date(),
    code,
    payload.sourceReference || '',
    r['Correo electrónico'] || '',
    talleres,
    String(body || '').slice(0, 500),
  ]);
}

function buscarHojaRespuestasRegistroTaller_(ss) {
  const excluded = ['00_Instrucciones', 'Listado - Habana', 'Listado - Occidente', 'Listado - Centro', 'Listado - Oriente', 'API_Registro_Taller_Log'];
  const sheets = ss.getSheets().filter(sh => excluded.indexOf(sh.getName()) === -1);
  return sheets.find(sh => {
    const headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    return headers.indexOf('Participación en el taller Habana') !== -1;
  }) || sheets[0] || null;
}
