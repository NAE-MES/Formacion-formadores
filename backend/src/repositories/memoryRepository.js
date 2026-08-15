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

  async getAdminSummary() {
    return {
      candidates: this.candidates.size,
      submissions: this.submissions.size,
      documents: this.documents.size,
      normalization_issues: this.issues.size,
    };
  }

  async listAdminSubmissions() {
    return Array.from(this.submissions.values())
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
      .map(submission => {
        const candidate = this.candidates.get(submission.candidate_id) || {};
        const issues = Array.from(this.issues.values())
          .filter(issue => issue.submission_id === submission.submission_id);
        const documents = Array.from(this.documents.values())
          .filter(document => document.candidate_id === submission.candidate_id);

        return {
          submission_id: submission.submission_id,
          candidate_id: submission.candidate_id,
          full_name: [
            candidate.first_name,
            candidate.second_name,
            candidate.first_surname,
            candidate.second_surname,
          ].filter(Boolean).join(' '),
          email: candidate.email || '',
          province: candidate.province || '',
          source_channel: submission.source_channel,
          source_reference: submission.source_reference,
          received_at: submission.received_at,
          normalization_status: submission.normalization_status,
          issue_count: issues.length,
          document_count: documents.length,
        };
      });
  }

  async getAdminSubmissionDetail(submissionId) {
    const submission = this.submissions.get(submissionId);
    if (!submission) return null;

    const candidate = this.candidates.get(submission.candidate_id) || {};
    const responses = Array.from(this.responses.values())
      .filter(response => response.submission_id === submissionId)
      .sort((a, b) => a.field_code.localeCompare(b.field_code));
    const documents = Array.from(this.documents.values())
      .filter(document => document.candidate_id === submission.candidate_id);
    const issues = Array.from(this.issues.values())
      .filter(issue => issue.submission_id === submissionId);

    return { submission, candidate, responses, documents, issues };
  }
}

module.exports = {
  MemoryRepository,
};
