const fs = require('node:fs');
const path = require('node:path');

const WORKSHOP_IDS = ['habana', 'occidente', 'centro', 'oriente'];
const BIBLIOGRAPHY_ROOT = path.join(__dirname, '..', 'public', 'talleres', 'bibliografia');

const REGIONAL_AGENDA = [
  {
    time_range: '8:00 - 8:15',
    title: 'Bienvenida y apertura',
    description: 'Presentación del objetivo de la jornada, metodología de trabajo, agenda y orientaciones generales.',
  },
  {
    time_range: '8:15 - 10:15',
    title: 'Módulo 1. Ingeniería de la formación y facilitación de personas adultas',
    description: 'Metodologías activas, facilitación, comunicación, gestión de dinámicas grupales y microfacilitación.',
  },
  {
    time_range: '10:15 - 10:30',
    title: 'Pausa - Merienda',
    description: '',
  },
  {
    time_range: '10:30 - 11:30',
    title: 'Módulo 2. Diagnóstico empresarial integral de los NAE',
    description: 'Clínica práctica de diagnóstico: identificación de problemas, análisis causal, priorización de necesidades y selección de modalidades de acompañamiento.',
  },
  {
    time_range: '11:30 - 12:30',
    title: 'Módulo 3. Diseño de planes de mejora empresarial',
    description: 'Del diagnóstico al Plan de Mejora: objetivos, acciones, responsables, plazos, recursos e indicadores.',
  },
  {
    time_range: '12:30 - 12:45',
    title: 'Módulo 4. Implementación, mentoría y seguimiento - Parte I',
    description: 'Introducción al acompañamiento y transición del Plan de Mejora hacia la mentoría: roles, acuerdos y límites del acompañamiento.',
  },
  {
    time_range: '12:45 - 13:30',
    title: 'Almuerzo',
    description: '',
  },
  {
    time_range: '13:30 - 14:45',
    title: 'Módulo 4. Implementación, mentoría y seguimiento - Parte II',
    description: 'Práctica de mentoría empresarial mediante simulación: escucha activa, preguntas reflexivas, retroalimentación, autonomía, acuerdos y compromisos.',
  },
  {
    time_range: '14:45 - 15:15',
    title: 'Módulo 5. Evaluación del acompañamiento y mejora continua',
    description: 'Revisión de indicadores y evidencias, análisis de avances y toma de decisiones de mejora.',
  },
  {
    time_range: '15:15 - 15:45',
    title: 'Módulo 6. Elementos transversales, articulación territorial y transferencia metodológica',
    description: 'Género, inclusión, sostenibilidad, ética y orientaciones para la multiplicación territorial.',
  },
  {
    time_range: '15:45 - 16:00',
    title: 'Cierre y evaluación de la jornada',
    description: 'Síntesis de aprendizajes, orientaciones para las actividades virtuales, compromisos y evaluación breve de satisfacción.',
  },
];

const HABANA_AGENDA = [
  {
    time_range: '8:30 - 9:00',
    title: 'Café de bienvenida',
    description: '',
  },
  {
    time_range: '9:00 - 9:15',
    title: 'Bienvenida y contextualización',
    description: 'Encuadre del taller.',
  },
  {
    time_range: '9:15 - 10:00',
    title: 'Presentación del Programa de FdF',
    description: 'Socialización de experiencias previas e intercambio sobre saberes previos, expectativas y criterios de los participantes.',
  },
  {
    time_range: '10:00 - 11:00',
    title: 'Bloque 1. Arquitectura curricular y flujo del programa',
    description: 'Herramientas prácticas de facilitación y dinámicas grupales.',
  },
  {
    time_range: '11:00 - 11:15',
    title: 'Pausa - Merienda',
    description: '',
  },
  {
    time_range: '11:15 - 12:30',
    title: 'Bloque 2. Integración de herramientas metodológicas',
    description: 'Enfoques transversales en la facilitación e intercambio sobre su contextualización territorial.',
  },
  {
    time_range: '12:30 - 13:30',
    title: 'Bloque 3. Estrategia de evaluación y certificación',
    description: 'Intercambio sobre su aplicación en el proceso formativo.',
  },
  {
    time_range: '13:30 - 14:00',
    title: 'Síntesis, próximos pasos y compromisos',
    description: 'Evaluación del taller.',
  },
  {
    time_range: '14:00 - 15:00',
    title: 'Almuerzo',
    description: '',
  },
  {
    time_range: '15:00 - 16:00',
    title: 'Coworking',
    description: '',
  },
];

const DEFAULT_WORKSHOPS = [
  {
    workshop_id: 'habana',
    title: 'Taller FdF La Habana',
    region: 'Habana',
    venue: 'Hotel Parque Central, La Habana',
    room: 'Sin precisar aún',
    starts_at: '2026-09-15T08:30:00-04:00',
    ends_at: '2026-09-15T16:00:00-04:00',
    timezone: 'America/Havana',
    modality: 'Presencial y virtual',
    meet_url: 'https://meet.google.com/skt-dtcg-tac',
    general_info: 'Taller nacional de intercambio y preparación para la implementación del Programa de Formación de Formadores para el acompañamiento a los NAE. Modalidad mixta, presencial y a distancia.',
    agenda: HABANA_AGENDA,
  },
  {
    workshop_id: 'occidente',
    title: 'Taller FdF Región Occidente',
    region: 'Occidente',
    venue: 'Universidad de Matanzas Camilo Cienfuegos',
    room: 'Sin precisar aún',
    starts_at: '2026-09-17T08:30:00-04:00',
    ends_at: '2026-09-17T16:00:00-04:00',
    timezone: 'America/Havana',
    modality: 'Presencial y virtual',
    meet_url: 'https://meet.google.com/qee-sdvb-oyo',
    general_info: 'Taller regional de Occidente. Agenda inicial tomada del programa tipo de talleres regionales V3.',
    agenda: REGIONAL_AGENDA,
  },
  {
    workshop_id: 'centro',
    title: 'Taller FdF Región Centro',
    region: 'Centro',
    venue: 'Universidad de Ciego de Ávila Máximo Gómez Báez, Sede Central',
    room: 'Salón Rosa Elena Simeón Negrín',
    starts_at: '2026-09-22T08:30:00-04:00',
    ends_at: '2026-09-22T16:00:00-04:00',
    timezone: 'America/Havana',
    modality: 'Presencial y virtual',
    meet_url: 'https://meet.google.com/vuy-rpnc-rwp',
    general_info: 'Taller regional de Centro. Agenda inicial tomada del programa tipo de talleres regionales V3.',
    agenda: REGIONAL_AGENDA,
  },
  {
    workshop_id: 'oriente',
    title: 'Taller FdF Región Oriente',
    region: 'Oriente',
    venue: 'Universidad de Guantánamo',
    room: 'Sala de videoconferencias',
    starts_at: '2026-09-24T08:30:00-04:00',
    ends_at: '2026-09-24T16:00:00-04:00',
    timezone: 'America/Havana',
    modality: 'Presencial y virtual',
    meet_url: 'https://meet.google.com/fto-fpji-dsi',
    general_info: 'Taller regional de Oriente. Agenda inicial tomada del programa tipo de talleres regionales V3.',
    agenda: REGIONAL_AGENDA,
  },
];

const DEFAULT_MATERIALS = [
  {
    title: 'Programa tipo de talleres regionales V3',
    description: 'Documento base para los talleres regionales de Occidente, Centro y Oriente.',
    material_type: 'DOCX',
    url: '',
    visible: true,
    position: 1,
  },
  ...bibliographyMaterials(),
];

const REGISTRATION_FIELDS = {
  data_consent: 'Consentimiento para el tratamiento de datos personales',
  first_name: 'Nombre',
  last_names: 'Apellidos',
  gender: 'Género',
  age_range: 'Rango de edad',
  phone: 'Teléfono',
  email: 'Correo electrónico',
  institution: 'Nombre de la institución, organización o empresa',
  position_title: 'Cargo',
  province: 'Provincia',
  participant_type: 'Tipo de participante',
  image_consent: 'Consentimiento para el tratamiento de imagen personal',
};

const WORKSHOP_PARTICIPATION_FIELDS = {
  habana: 'Participación en el taller Habana',
  occidente: 'Participación en el taller Occidente',
  centro: 'Participación en el taller Centro',
  oriente: 'Participación en el taller Oriente',
};

function sanitizeWorkshopPayload(payload = {}) {
  return {
    title: bounded(payload.title, 180),
    region: bounded(payload.region, 80),
    venue: bounded(payload.venue, 220),
    room: bounded(payload.room, 160),
    starts_at: payload.starts_at || null,
    ends_at: payload.ends_at || null,
    timezone: bounded(payload.timezone || 'America/Havana', 80),
    modality: bounded(payload.modality || 'Presencial y virtual', 80),
    meet_url: bounded(payload.meet_url, 400),
    general_info: bounded(payload.general_info, 3000),
  };
}

function sanitizeAgendaPayload(items = []) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).map((item, index) => ({
    agenda_item_id: item.agenda_item_id || '',
    position: Number.isInteger(Number(item.position)) ? Number(item.position) : index + 1,
    time_range: bounded(item.time_range, 80),
    title: bounded(item.title, 220),
    description: bounded(item.description, 2000),
  })).filter(item => item.title);
}

function sanitizeMaterialPayload(payload = {}) {
  return {
    material_id: payload.material_id || '',
    title: bounded(payload.title, 220),
    description: bounded(payload.description, 1200),
    material_type: bounded(payload.material_type, 80),
    url: bounded(payload.url, 800),
    visible: payload.visible !== false,
    position: Number.isInteger(Number(payload.position)) ? Number(payload.position) : 0,
  };
}

function normalizeWorkshopRegistrationPayload(payload = {}) {
  const responses = normalizeResponseMap(payload.responses || payload.respuestas || payload.namedValues || payload);
  const registeredAt = payload.registeredAt || payload.registered_at || payload.timestamp || responses['Marca temporal'] || new Date().toISOString();
  const sourceReference = bounded(
    payload.sourceReference ||
    payload.source_reference ||
    responses.__source_reference ||
    responses['ID de respuesta'] ||
    [responses[REGISTRATION_FIELDS.email], registeredAt].filter(Boolean).join('|'),
    420,
  );
  const registration = {
    source_channel: 'GOOGLE_FORM',
    source_reference: sourceReference,
    raw_payload: payload,
    registered_at: toIso(registeredAt),
    first_name: valueFor(responses, REGISTRATION_FIELDS.first_name),
    last_names: valueFor(responses, REGISTRATION_FIELDS.last_names),
    gender: valueFor(responses, REGISTRATION_FIELDS.gender),
    age_range: valueFor(responses, REGISTRATION_FIELDS.age_range),
    phone: valueFor(responses, REGISTRATION_FIELDS.phone),
    email: valueFor(responses, REGISTRATION_FIELDS.email).toLowerCase(),
    institution: valueFor(responses, REGISTRATION_FIELDS.institution),
    position_title: valueFor(responses, REGISTRATION_FIELDS.position_title),
    province: valueFor(responses, REGISTRATION_FIELDS.province),
    participant_type: valueFor(responses, REGISTRATION_FIELDS.participant_type),
    data_consent: valueFor(responses, REGISTRATION_FIELDS.data_consent),
    image_consent: valueFor(responses, REGISTRATION_FIELDS.image_consent),
  };
  const participations = Object.entries(WORKSHOP_PARTICIPATION_FIELDS)
    .map(([workshop_id, field]) => ({
      workshop_id,
      modality: valueFor(responses, field),
    }))
    .filter(item => ['Presencial', 'Virtual'].includes(item.modality));
  const issues = [];
  for (const [key, label] of Object.entries(REGISTRATION_FIELDS)) {
    if (!registration[key]) issues.push(`Falta ${label}.`);
  }
  if (!participations.length) issues.push('No selecciono participacion presencial o virtual en ningun taller.');
  return { registration, participations, issues };
}

function normalizeResponseMap(source = {}) {
  const responses = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (Array.isArray(value)) {
      responses[key] = value.join(', ');
    } else {
      responses[key] = value == null ? '' : String(value).trim();
    }
  }
  return responses;
}

function valueFor(responses, label) {
  return bounded(responses[label] || responses[withoutAccents(label)] || '', 600);
}

function withoutAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toIso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function bounded(value, max) {
  return String(value || '').trim().slice(0, max);
}

function bibliographyMaterials() {
  if (!fs.existsSync(BIBLIOGRAPHY_ROOT)) return [];
  return walkBibliography(BIBLIOGRAPHY_ROOT)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((relativePath, index) => {
      const segments = relativePath.split(path.sep);
      const filename = segments.at(-1);
      const folder = segments.slice(0, -1).join(' / ');
      return {
        title: filename.replace(/\.[^.]+$/, ''),
        description: folder ? `Bibliografía común - ${folder}` : 'Bibliografía común',
        material_type: materialType(filename),
        url: `/talleres/bibliografia/${segments.map(segment => encodeURIComponent(segment)).join('/')}`,
        visible: true,
        position: 100 + index,
      };
    });
}

function walkBibliography(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkBibliography(fullPath).map(child => path.join(entry.name, child));
    }
    if (!entry.isFile()) return [];
    return [entry.name];
  });
}

function materialType(filename) {
  const extension = path.extname(filename).slice(1).toUpperCase();
  if (extension === 'PDF') return 'PDF';
  if (extension === 'DOC' || extension === 'DOCX') return 'DOCX';
  if (extension === 'XLS' || extension === 'XLSX') return 'XLSX';
  if (extension === 'PPT' || extension === 'PPTX') return 'PPTX';
  return extension || 'Archivo';
}

module.exports = {
  DEFAULT_MATERIALS,
  DEFAULT_WORKSHOPS,
  WORKSHOP_IDS,
  sanitizeAgendaPayload,
  sanitizeMaterialPayload,
  sanitizeWorkshopPayload,
  normalizeWorkshopRegistrationPayload,
};
