class MemoryRepository {
  constructor() {
    this.candidates = new Map();
    this.submissions = new Map();
    this.raws = new Map();
    this.responses = new Map();
    this.documents = new Map();
    this.issues = new Map();
    this.auditEvents = new Map();
  }

  async saveImportedSubmission(imported) {
    if (this.submissions.has(imported.submission?.submission_id || imported.submission_id)) {
      return { status: 'REIMPORTED', imported };
    }

    if (imported.candidate) this.candidates.set(imported.candidate.candidate_id, imported.candidate);
    if (imported.submission) this.submissions.set(imported.submission.submission_id, imported.submission);
    if (imported.raw) this.raws.set(imported.raw.submission_raw_id, imported.raw);
    for (const response of imported.responses || []) this.responses.set(response.candidate_response_id, response);
    for (const document of imported.documents || []) this.documents.set(document.document_id, document);
    for (const issue of imported.issues || []) this.issues.set(issue.normalization_issue_id, issue);
    for (const event of imported.auditEvents || []) this.auditEvents.set(event.audit_event_id, event);

    return { status: imported.status, imported };
  }
}

module.exports = {
  MemoryRepository,
};
