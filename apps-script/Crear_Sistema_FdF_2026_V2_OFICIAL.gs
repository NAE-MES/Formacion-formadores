function crearGoogleFormFdF_V2() {
  const ss = SpreadsheetApp.getActive();
  const formularioConfig = ss.getSheetByName("13_Formulario_Config");
  const datos = formularioConfig.getDataRange().getValues();
  const form = FormApp.create("Formación de Formadores FdF 2026");

  form.setProgressBar(true);

  let seccionActual = "";

  datos.slice(1).forEach((fila) => {
    const [, seccion, pregunta, tipo, opciones, , requerida] = fila;

    if (!pregunta) {
      return;
    }

    if (seccion !== seccionActual) {
      seccionActual = seccion;
      form.addPageBreakItem().setTitle("Sección " + seccion);
    }

    const esRequerida = String(requerida).toLowerCase() === "sí";
    const valoresOpciones = String(opciones || "")
      .split(";")
      .map((opcion) => opcion.trim())
      .filter(Boolean);

    if (tipo === "Respuesta corta") {
      form.addTextItem().setTitle(pregunta).setRequired(esRequerida);
    } else if (tipo === "Párrafo") {
      form.addParagraphTextItem().setTitle(pregunta).setRequired(esRequerida);
    } else if (tipo === "Opción múltiple") {
      form
        .addMultipleChoiceItem()
        .setTitle(pregunta)
        .setChoiceValues(valoresOpciones)
        .setRequired(esRequerida);
    } else if (tipo === "Casillas") {
      form
        .addCheckboxItem()
        .setTitle(pregunta)
        .setChoiceValues(valoresOpciones)
        .setRequired(esRequerida);
    } else if (tipo === "Carga de archivo") {
      form
        .addParagraphTextItem()
        .setTitle("[CONFIGURAR CARGA DE ARCHIVO] " + pregunta)
        .setRequired(false);
    }
  });

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  ss.getSheetByName("11_Config")
    .getRange("E1:F4")
    .setValues([
      ["Recurso", "Valor"],
      ["Formulario_ID", form.getId()],
      ["Edición", form.getEditUrl()],
      ["Público", form.getPublishedUrl()],
    ]);

  SpreadsheetApp.getUi().alert(
    "Formulario V2 creado. Configure manualmente carta aval y CV como carga de archivo antes de publicar."
  );
}
