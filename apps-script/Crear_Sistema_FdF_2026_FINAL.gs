/**
 * FdF 2026 - FINAL
 * Archivo base asociado: Sistema_FdF_2026_FINAL.xlsx
 *
 * REGLAS NO NEGOCIABLES
 * ---------------------
 * 1) El formulario público se genera EXCLUSIVAMENTE desde 13_Formulario_Publico.
 * 2) No se muestran puntos, "No puntúa", atributos ni ponderaciones.
 * 3) FDF-22 es PÁRRAFO. NO sube archivos.
 * 4) Las ÚNICAS cargas de archivo son:
 *      FDF-17 Carta aval
 *      FDF-27 Currículum vitae
 * 5) Cada código FDF puede existir una sola vez.
 * 6) No se añade descripción propia al formulario.
 *
 * IMPORTANTE SOBRE LAS CARGAS:
 * FormApp no permite crear directamente preguntas FILE_UPLOAD.
 * Para evitar marcadores duplicados, FINAL crea FDF-17 y FDF-27
 * como preguntas de PÁRRAFO EN SU POSICIÓN CORRECTA.
 *
 * Después de generar el formulario:
 *   - cambia FDF-17 de "Párrafo" a "Subir archivos" y márcala obligatoria;
 *   - cambia FDF-27 de "Párrafo" a "Subir archivos" y márcala obligatoria;
 *   - máximo 1 archivo en cada una.
 *
 * NO añadas preguntas nuevas. Solo cambia el tipo de esas dos preguntas.
 */

const FINAL_PUBLIC_SHEET = '13_Formulario_Publico';
const FINAL_CONFIG_SHEET = '11_Config';
const FINAL_LOG_SHEET = '12_Log';

function crearGoogleFormFdF_FINAL() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = leerConfigFINAL_();
  const source = leerFuentePublicaFINAL_();

  validarFuenteFINAL_(source);

  const titulo = cfg.Titulo_Formulario || 'Anexo 2. Formulario de postulación para programa FdF.';
  const form = FormApp.create(titulo, false);

  form.setProgressBar(true);
  form.setShuffleQuestions(false);

  let seccionActual = '';
  const seen = new Set();

  source.forEach(r => {
    if (seen.has(r.codigo)) {
      throw new Error('Código duplicado durante generación: ' + r.codigo);
    }
    seen.add(r.codigo);

    if (r.seccion !== seccionActual) {
      if (seccionActual === '') {
        form.addSectionHeaderItem().setTitle(r.tituloSeccion);
      } else {
        form.addPageBreakItem().setTitle(r.tituloSeccion);
      }
      seccionActual = r.seccion;
    }

    if (r.codigo === 'FDF-17' || r.codigo === 'FDF-27') {
      form.addParagraphTextItem()
        .setTitle(r.pregunta)
        .setRequired(true);
      return;
    }

    agregarPreguntaFINAL_(form, r);
  });

  verificarEstructuraCreadaFINAL_(form, source);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  form.setPublished(false);

  guardarFormularioFINAL_(ss, form);

  logFINAL_(
    'CREAR_FORMULARIO_FINAL',
    '',
    'Formulario creado sin publicar. FDF-17 y FDF-27 deben cambiarse de Párrafo a Subir archivos.',
    'OK'
  );

  SpreadsheetApp.getUi().alert(
    'FORMULARIO FINAL CREADO SIN PUBLICAR.\n\n' +
    'SOLO HAZ DOS CAMBIOS MANUALES:\n\n' +
    '1. Busca "Adjunte carta aval institucional..." (FDF-17) y cambia su tipo de Párrafo a "Subir archivos". Obligatoria. Máximo 1 archivo.\n\n' +
    '2. Busca "Adjunte su currículum vitae actualizado" (FDF-27) y cambia su tipo de Párrafo a "Subir archivos". Obligatoria. Máximo 1 archivo.\n\n' +
    'NO crees preguntas nuevas. NO borres ni copies esas preguntas.\n\n' +
    'Después ejecuta auditarGoogleFormFdF_FINAL().'
  );
}

function validarFuenteFINAL_(rows) {
  const seen = new Set();

  rows.forEach(r => {
    if (seen.has(r.codigo)) {
      throw new Error('Fuente inválida: código duplicado ' + r.codigo);
    }
    seen.add(r.codigo);
  });

  const byCode = {};
  rows.forEach(r => byCode[r.codigo] = r);

  ['FDF-17','FDF-22','FDF-27'].forEach(c => {
    if (!byCode[c]) throw new Error('Fuente inválida: falta ' + c);
  });

  if (byCode['FDF-17'].tipo !== 'Carga de archivo') {
    throw new Error('FDF-17 debe ser Carga de archivo en la fuente.');
  }
  if (byCode['FDF-22'].tipo !== 'Párrafo') {
    throw new Error('FDF-22 debe ser Párrafo. NO puede subir archivos.');
  }
  if (byCode['FDF-27'].tipo !== 'Carga de archivo') {
    throw new Error('FDF-27 debe ser Carga de archivo en la fuente.');
  }

  const uploadCodes = rows
    .filter(r => r.tipo === 'Carga de archivo')
    .map(r => r.codigo)
    .sort();

  if (uploadCodes.join(',') !== 'FDF-17,FDF-27') {
    throw new Error(
      'Solo FDF-17 y FDF-27 pueden ser cargas de archivo. Detectado: ' +
      uploadCodes.join(',')
    );
  }

  rows.forEach(r => {
    const visible = (r.pregunta || '') + '\n' + (r.opciones || '');

    if (/\b(10|5|0)\s+puntos?\b/i.test(visible)) {
      throw new Error('La fuente pública contiene puntuaciones visibles: ' + r.codigo);
    }
    if (/No puntúa/i.test(visible)) {
      throw new Error('La fuente pública contiene "No puntúa": ' + r.codigo);
    }
  });
}

function agregarPreguntaFINAL_(form, r) {
  const opciones = String(r.opciones || '')
    .split(';')
    .map(x => x.trim())
    .filter(Boolean);

  switch (r.tipo) {
    case 'Respuesta corta':
      form.addTextItem().setTitle(r.pregunta).setRequired(r.obligatoria);
      break;
    case 'Párrafo':
      form.addParagraphTextItem().setTitle(r.pregunta).setRequired(r.obligatoria);
      break;
    case 'Opción múltiple':
      form.addMultipleChoiceItem().setTitle(r.pregunta).setChoiceValues(opciones).setRequired(r.obligatoria);
      break;
    case 'Casillas':
      form.addCheckboxItem().setTitle(r.pregunta).setChoiceValues(opciones).setRequired(r.obligatoria);
      break;
    case 'Carga de archivo':
      throw new Error('Carga inesperada en ' + r.codigo + '.');
    default:
      throw new Error('Tipo no soportado: ' + r.tipo + ' / ' + r.codigo);
  }
}

function verificarEstructuraCreadaFINAL_(form, source) {
  const items = form.getItems();

  const questionItems = items.filter(i =>
    [
      FormApp.ItemType.TEXT,
      FormApp.ItemType.PARAGRAPH_TEXT,
      FormApp.ItemType.MULTIPLE_CHOICE,
      FormApp.ItemType.CHECKBOX
    ].includes(i.getType())
  );

  if (questionItems.length !== source.length) {
    throw new Error(
      'Generación incompleta o duplicada. Esperadas=' + source.length +
      ', creadas=' + questionItems.length
    );
  }

  for (let i = 0; i < source.length; i++) {
    if (
      normalizarFINAL_(questionItems[i].getTitle()) !==
      normalizarFINAL_(source[i].pregunta)
    ) {
      throw new Error(
        'La pregunta #' + (i + 1) + ' no coincide con ' + source[i].codigo
      );
    }
  }

  const titles = questionItems.map(i => normalizarFINAL_(i.getTitle()));
  const f17 = source.find(r => r.codigo === 'FDF-17');
  const f27 = source.find(r => r.codigo === 'FDF-27');

  const count17 = titles.filter(t => t === normalizarFINAL_(f17.pregunta)).length;
  const count27 = titles.filter(t => t === normalizarFINAL_(f27.pregunta)).length;

  if (count17 !== 1 || count27 !== 1) {
    throw new Error(
      'Duplicación detectada. FDF-17=' + count17 + ', FDF-27=' + count27
    );
  }
}

function auditarGoogleFormFdF_FINAL() {
  const form = FormApp.openById(obtenerFormularioIdFINAL_());
  const source = leerFuentePublicaFINAL_();
  const errors = [];
  const warnings = [];

  const items = form.getItems();

  const forbiddenQuestion =
    '¿Su participación contribuiría a la representación de su provincia, municipio o institución dentro de la cohorte regional?';

  items.forEach(item => {
    const title = String(item.getTitle ? item.getTitle() : '');
    const help = String(item.getHelpText ? item.getHelpText() : '');
    const visible = title + '\n' + help;

    if (/\b(10|5|0)\s+puntos?\b/i.test(visible)) {
      errors.push('Puntuación visible: ' + title);
    }
    if (/No puntúa/i.test(visible)) {
      errors.push('"No puntúa" visible: ' + title);
    }
    if (normalizarFINAL_(title) === normalizarFINAL_(forbiddenQuestion)) {
      errors.push('Aparece la pregunta eliminada de la sección 6.');
    }
  });

  const inst = items.find(i =>
    i.getType() === FormApp.ItemType.MULTIPLE_CHOICE &&
    normalizarFINAL_(i.getTitle()) === normalizarFINAL_('Tipo de institución')
  );

  if (!inst) {
    errors.push('No se encontró Tipo de institución.');
  } else {
    const choices = inst.asMultipleChoiceItem().getChoices().map(c => c.getValue());
    if (choices.some(c => normalizarFINAL_(c) === 'inaene')) {
      errors.push('INAENE aparece en Tipo de institución.');
    }
  }

  const uploads = items.filter(i => i.getType() === FormApp.ItemType.FILE_UPLOAD);
  if (uploads.length !== 2) {
    errors.push('Deben existir exactamente 2 cargas de archivo. Detectadas: ' + uploads.length);
  }

  const expected17 = source.find(r => r.codigo === 'FDF-17').pregunta;
  const expected27 = source.find(r => r.codigo === 'FDF-27').pregunta;
  const uploadTitles = uploads.map(i => normalizarFINAL_(i.getTitle()));

  if (!uploadTitles.includes(normalizarFINAL_(expected17))) {
    errors.push('FDF-17 no está configurada correctamente como carga.');
  }
  if (!uploadTitles.includes(normalizarFINAL_(expected27))) {
    errors.push('FDF-27 no está configurada correctamente como carga.');
  }

  const f22 = source.find(r => r.codigo === 'FDF-22').pregunta;
  const f22Item = items.find(i => normalizarFINAL_(i.getTitle()) === normalizarFINAL_(f22));

  if (!f22Item) {
    errors.push('No se encontró FDF-22.');
  } else if (f22Item.getType() !== FormApp.ItemType.PARAGRAPH_TEXT) {
    errors.push('FDF-22 debe ser Párrafo y NO una carga de archivo.');
  }

  source.forEach(r => {
    const n = items.filter(i =>
      i.getTitle &&
      normalizarFINAL_(i.getTitle()) === normalizarFINAL_(r.pregunta)
    ).length;

    if (n !== 1) {
      errors.push(r.codigo + ' aparece ' + n + ' veces.');
    }
  });

  warnings.push('Verificar visualmente FDF-17: obligatoria y máximo 1 archivo.');
  warnings.push('Verificar visualmente FDF-27: obligatoria y máximo 1 archivo.');
  warnings.push('Verificar que el guardado automático de borradores no esté desactivado.');

  const ok = errors.length === 0;

  let msg = 'AUDITORÍA FINAL\n\n';
  msg += ok ? 'ESTRUCTURA: OK\n\n' : 'NO PUBLICAR.\n\n';

  if (errors.length) {
    msg += 'ERRORES:\n- ' + errors.join('\n- ') + '\n\n';
  }

  msg += 'VERIFICACIONES MANUALES:\n- ' + warnings.join('\n- ');

  logFINAL_(
    'AUDITORIA_FINAL',
    '',
    'Errores=' + errors.length,
    ok ? 'OK' : 'ERROR'
  );

  SpreadsheetApp.getUi().alert(msg);
}

function publicarGoogleFormFdF_FINAL() {
  const form = FormApp.openById(obtenerFormularioIdFINAL_());
  const items = form.getItems();

  const uploads = items.filter(i => i.getType() === FormApp.ItemType.FILE_UPLOAD);
  if (uploads.length !== 2) {
    throw new Error('NO PUBLICADO: deben existir exactamente 2 cargas de archivo.');
  }

  form.setPublished(true);

  logFINAL_('PUBLICAR_FINAL','',form.getPublishedUrl(),'OK');

  SpreadsheetApp.getUi().alert(
    'Formulario publicado correctamente.\n\n' + form.getPublishedUrl()
  );
}

function leerFuentePublicaFINAL_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FINAL_PUBLIC_SHEET);

  if (!sh) throw new Error('No existe ' + FINAL_PUBLIC_SHEET + '.');

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(x => String(x || '').trim());

  const idx = {
    codigo: headers.indexOf('Código'),
    seccion: headers.indexOf('Sección'),
    tituloSeccion: headers.indexOf('Título de sección'),
    pregunta: headers.indexOf('Pregunta visible'),
    tipo: headers.indexOf('Tipo en Google Forms'),
    opciones: headers.indexOf('Opciones visibles'),
    obligatoria: headers.indexOf('Obligatoria')
  };

  Object.keys(idx).forEach(k => {
    if (idx[k] < 0) throw new Error('Falta columna: ' + k);
  });

  return data.slice(1)
    .filter(r => String(r[idx.codigo] || '').trim())
    .map(r => ({
      codigo: String(r[idx.codigo]).trim(),
      seccion: String(r[idx.seccion]).trim(),
      tituloSeccion: String(r[idx.tituloSeccion]).trim(),
      pregunta: String(r[idx.pregunta]).trim(),
      tipo: String(r[idx.tipo]).trim(),
      opciones: String(r[idx.opciones] || '').trim(),
      obligatoria: String(r[idx.obligatoria] || '').trim().toLowerCase() === 'sí'
    }));
}

function leerConfigFINAL_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FINAL_CONFIG_SHEET);
  if (!sh || sh.getLastRow() < 2) return {};

  const data = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  const out = {};

  data.forEach(r => {
    if (r[0] !== '') out[String(r[0])] = r[1];
  });

  return out;
}

function guardarFormularioFINAL_(ss, form) {
  const sh = ss.getSheetByName(FINAL_CONFIG_SHEET);
  if (!sh) return;

  sh.getRange('E1:F7').setValues([
    ['Formulario FINAL','Valor'],
    ['Formulario_ID',form.getId()],
    ['Formulario_edicion',form.getEditUrl()],
    ['Formulario_publico',form.getPublishedUrl()],
    ['Estado','NO PUBLICADO'],
    ['Cargas esperadas','FDF-17; FDF-27'],
    ['FDF-22','PÁRRAFO - SIN ARCHIVO']
  ]);
}

function obtenerFormularioIdFINAL_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FINAL_CONFIG_SHEET);
  if (!sh) throw new Error('No existe ' + FINAL_CONFIG_SHEET + '.');

  const vals = sh.getRange('E1:F20').getValues();
  for (let i=0; i<vals.length; i++) {
    if (String(vals[i][0]) === 'Formulario_ID' && vals[i][1]) {
      return String(vals[i][1]);
    }
  }

  throw new Error('No se encontró Formulario_ID. Ejecuta crearGoogleFormFdF_FINAL().');
}

function normalizarFINAL_(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

function logFINAL_(accion,idPostulante,detalle,resultado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FINAL_LOG_SHEET);
  if (!sh) return;

  sh.appendRow([
    new Date(),
    Session.getActiveUser().getEmail(),
    accion,
    idPostulante,
    detalle,
    resultado
  ]);
}
