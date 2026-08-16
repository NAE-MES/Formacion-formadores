class MemoryRepository {
  constructor() {
    this.candidates = new Map();
    this.submissions = new Map();
    this.raws = new Map();
    this.responses = new Map();
    this.documents = new Map();
    this.issues = new Map();
    this.auditEvents = new Map();
    this.adminUsers = new Map();
    this.adminSessions = new Map();
  }

  async saveImportedSubmission(imported) {
    const sameReference = Array.from(this.submissions.values()).find(submission =>
      imported.submission &&
      submission.source_channel === imported.submission.source_channel &&
      submission.source_reference === imported.submission.source_reference &&
      submission.submission_id !== imported.submission.submission_id
    );
    if (sameReference) {
      const rebound = rebindImportedSubmission(imported, sameReference.submission_id);
      if (rebound.candidate) this.candidates.set(rebound.candidate.candidate_id, rebound.candidate);
      if (rebound.submission) this.submissions.set(rebound.submission.submission_id, rebound.submission);
      if (rebound.raw) this.raws.set(rebound.raw.submission_raw_id, rebound.raw);
      for (const response of Array.from(this.responses.values())) {
        if (response.submission_id === rebound.submission.submission_id) {
          this.responses.delete(response.candidate_response_id);
        }
      }
      for (const issue of Array.from(this.issues.values())) {
        if (issue.submission_id === rebound.submission.submission_id) {
          this.issues.delete(issue.normalization_issue_id);
        }
      }
      for (const response of rebound.responses || []) this.responses.set(response.candidate_response_id, response);
      for (const document of rebound.documents || []) this.documents.set(document.document_id, document);
      for (const issue of rebound.issues || []) this.issues.set(issue.normalization_issue_id, issue);
      this.auditEvents.set(
        `audit_${this.auditEvents.size + 1}`,
        auditEvent('SUBMISSION_REPROCESSED', 'Submission', rebound.submission.submission_id, 'API', null, {
          normalization_status: rebound.submission.normalization_status,
        }, 'Same source reference reprocessed with updated payload.'),
      );
      return { status: 'REPROCESSED', imported: rebound };
    }

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

  async ensureBootstrapAdminUser({ username, password, role }) {
    const user = {
      admin_user_id: `admin_${username.toLowerCase()}`,
      username: username.toLowerCase(),
      password_hash: `plain:${password}`,
      role: role || 'ADMIN',
      active: true,
    };
    this.adminUsers.set(user.username, user);
  }

  async findAdminUserByUsername(username) {
    return this.adminUsers.get(String(username || '').toLowerCase()) || null;
  }

  async createAdminSession(adminUserId, tokenHash, expiresAt) {
    const session = {
      admin_session_id: `sess_${this.adminSessions.size + 1}`,
      admin_user_id: adminUserId,
      session_token_hash: tokenHash,
      expires_at: expiresAt,
      revoked_at: null,
    };
    this.adminSessions.set(tokenHash, session);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent('ADMIN_LOGIN', 'AdminSession', session.admin_session_id, adminUserId, null, { admin_user_id: adminUserId }, ''),
    );
    return session;
  }

  async findAdminSessionByTokenHash(tokenHash) {
    const session = this.adminSessions.get(tokenHash);
    if (!session) return null;
    const user = Array.from(this.adminUsers.values()).find(item => item.admin_user_id === session.admin_user_id);
    return {
      ...session,
      username: user?.username || '',
      role: user?.role || '',
      active: !!user?.active,
    };
  }

  async revokeAdminSession(tokenHash, actor) {
    const session = this.adminSessions.get(tokenHash);
    if (!session || session.revoked_at) return null;
    session.revoked_at = new Date().toISOString();
    this.adminSessions.set(tokenHash, session);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent('ADMIN_LOGOUT', 'AdminSession', session.admin_session_id, actor || session.admin_user_id, null, { revoked_at: session.revoked_at }, ''),
    );
    return session;
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

  async updateDocumentStatus(documentId, { status, actor, reason }) {
    const allowed = new Set(['RECEIVED', 'VALIDATED', 'REJECTED', 'NEEDS_REVIEW']);
    if (!allowed.has(status)) {
      const error = new Error('Invalid document status.');
      error.statusCode = 400;
      error.code = 'INVALID_DOCUMENT_STATUS';
      throw error;
    }

    const current = this.documents.get(documentId);
    if (!current) {
      const error = new Error('Document not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const previousValue = sanitizeDocumentAuditValue(current);
    const updated = {
      ...current,
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor || 'ADMIN',
    };
    this.documents.set(documentId, updated);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent('DOCUMENT_STATUS_UPDATED', 'Document', documentId, actor, previousValue, sanitizeDocumentAuditValue(updated), reason),
    );
    return updated;
  }

  async updateNormalizationIssueReview(issueId, { reviewStatus, reviewNote, actor, reason }) {
    const allowed = new Set(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'NEEDS_SOURCE_REVIEW']);
    if (!allowed.has(reviewStatus)) {
      const error = new Error('Invalid issue review status.');
      error.statusCode = 400;
      error.code = 'INVALID_ISSUE_STATUS';
      throw error;
    }

    const current = this.issues.get(issueId);
    if (!current) {
      const error = new Error('Normalization issue not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const previousValue = sanitizeIssueAuditValue(current);
    const updated = {
      ...current,
      review_status: reviewStatus,
      review_note: String(reviewNote || ''),
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor || 'ADMIN',
    };
    this.issues.set(issueId, updated);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent('NORMALIZATION_ISSUE_REVIEW_UPDATED', 'NormalizationIssue', issueId, actor, previousValue, sanitizeIssueAuditValue(updated), reason),
    );
    return updated;
  }
}

function auditEvent(action, entityType, entityId, actor, previousValue, newValue, reason) {
  return {
    audit_event_id: `audit_${action}_${entityId}_${Date.now()}`,
    action,
    entity_type: entityType,
    entity_id: entityId,
    occurred_at: new Date().toISOString(),
    source_channel: 'ADMIN_UI',
    actor: actor || 'ADMIN',
    previous_value: previousValue || null,
    new_value: newValue || null,
    reason: reason || '',
  };
}

function sanitizeDocumentAuditValue(document) {
  return {
    document_id: document.document_id,
    candidate_id: document.candidate_id,
    document_type: document.document_type,
    status: document.status,
    reviewed_at: document.reviewed_at || null,
    reviewed_by: document.reviewed_by || '',
  };
}

function sanitizeIssueAuditValue(issue) {
  return {
    normalization_issue_id: issue.normalization_issue_id,
    submission_id: issue.submission_id,
    candidate_id: issue.candidate_id,
    field_code: issue.field_code,
    code: issue.code,
    severity: issue.severity,
    review_status: issue.review_status || 'OPEN',
    review_note: issue.review_note || '',
    reviewed_at: issue.reviewed_at || null,
    reviewed_by: issue.reviewed_by || '',
  };
}

function rebindImportedSubmission(imported, submissionId) {
  const rawHash = imported.raw?.raw_hash || JSON.stringify(imported.raw?.raw_payload || {});
  return {
    ...imported,
    submission: {
      ...imported.submission,
      submission_id: submissionId,
    },
    raw: imported.raw ? {
      ...imported.raw,
      submission_raw_id: `raw_${submissionId}_${rawHash}`,
      submission_id: submissionId,
    } : null,
    responses: (imported.responses || []).map(response => ({
      ...response,
      candidate_response_id: `resp_${submissionId}_${response.field_code}`,
      submission_id: submissionId,
    })),
    issues: (imported.issues || []).map(issue => ({
      ...issue,
      normalization_issue_id: `issue_${submissionId}_${issue.code}_${issue.field_code}`,
      submission_id: submissionId,
    })),
  };
}

module.exports = {
  MemoryRepository,
};
