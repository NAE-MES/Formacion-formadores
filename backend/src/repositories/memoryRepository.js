class MemoryRepository {
  constructor() {
    this.candidates = new Map();
    this.submissions = new Map();
    this.raws = new Map();
    this.responses = new Map();
    this.documents = new Map();
    this.issues = new Map();
    this.auditEvents = new Map();
    this.eligibilityAssessments = new Map();
    this.criterionEvaluations = new Map();
    this.evaluationResults = new Map();
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
      eligibility_assessments: this.eligibilityAssessments.size,
      eligibility_ready: Array.from(this.eligibilityAssessments.values())
        .filter(item => item.status === 'READY_FOR_TECHNICAL_REVIEW').length,
      eligibility_blocked: Array.from(this.eligibilityAssessments.values())
        .filter(item => item.status === 'BLOCKED_BY_MISSING_REQUIREMENTS').length,
      eligibility_review: Array.from(this.eligibilityAssessments.values())
        .filter(item => item.status === 'REQUIRES_MANUAL_REVIEW').length,
      evaluation_completed: Array.from(this.evaluationResults.values())
        .filter(item => item.status === 'COMPLETED').length,
      evaluation_in_progress: Array.from(this.evaluationResults.values())
        .filter(item => item.status === 'IN_PROGRESS').length,
      evaluation_needs_review: Array.from(this.evaluationResults.values())
        .filter(item => item.status === 'NEEDS_REVIEW').length,
      documents_needs_review: Array.from(this.documents.values())
        .filter(item => item.status === 'NEEDS_REVIEW').length,
      documents_rejected: Array.from(this.documents.values())
        .filter(item => item.status === 'REJECTED').length,
      open_issues: Array.from(this.issues.values())
        .filter(item => ['OPEN', 'NEEDS_SOURCE_REVIEW'].includes(item.review_status || 'OPEN')).length,
    };
  }

  async ensureBootstrapAdminUser({ username, password, role }) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (this.adminUsers.has(normalizedUsername)) return;
    const user = {
      admin_user_id: `admin_${normalizedUsername}`,
      username: normalizedUsername,
      password_hash: `plain:${password}`,
      role: role || 'ADMIN',
      active: true,
    };
    this.adminUsers.set(user.username, user);
  }

  async findAdminUserByUsername(username) {
    return this.adminUsers.get(String(username || '').toLowerCase()) || null;
  }

  async listAdminUsers() {
    return Array.from(this.adminUsers.values())
      .sort((a, b) => a.username.localeCompare(b.username))
      .map(sanitizeAdminUser);
  }

  async createAdminUser({ username, password, role, actor, reason }) {
    validateAdminRole(role);
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!normalizedUsername || !password) {
      const error = new Error('Username and password are required.');
      error.statusCode = 400;
      error.code = 'INVALID_ADMIN_USER';
      throw error;
    }
    if (this.adminUsers.has(normalizedUsername)) {
      const error = new Error('Admin username already exists.');
      error.statusCode = 409;
      error.code = 'ADMIN_USER_EXISTS';
      throw error;
    }
    const now = new Date().toISOString();
    const user = {
      admin_user_id: `admin_${normalizedUsername}`,
      username: normalizedUsername,
      password_hash: `plain:${password}`,
      role,
      active: true,
      created_at: now,
      updated_at: now,
    };
    this.adminUsers.set(user.username, user);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent('ADMIN_USER_CREATED', 'AdminUser', user.admin_user_id, actor, null, sanitizeAdminUser(user), reason),
    );
    return sanitizeAdminUser(user);
  }

  async updateAdminUser(username, { password, role, active, actor, reason }) {
    if (role !== undefined) validateAdminRole(role);
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const current = this.adminUsers.get(normalizedUsername);
    if (!current) {
      const error = new Error('Admin user not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    const updated = {
      ...current,
      role: role === undefined ? current.role : role,
      active: active === undefined ? current.active : !!active,
      password_hash: password ? `plain:${password}` : current.password_hash,
      updated_at: new Date().toISOString(),
    };
    this.adminUsers.set(normalizedUsername, updated);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent('ADMIN_USER_UPDATED', 'AdminUser', updated.admin_user_id, actor, sanitizeAdminUser(current), sanitizeAdminUser(updated), reason),
    );
    return sanitizeAdminUser(updated);
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
        const eligibility = latestEligibility(
          Array.from(this.eligibilityAssessments.values())
            .filter(item => item.submission_id === submission.submission_id)
        );
        const evaluationResult = latestEvaluationResult(
          Array.from(this.evaluationResults.values())
            .filter(item => item.submission_id === submission.submission_id)
        );
        const documentStatuses = Array.from(new Set(documents.map(document => document.status))).sort();
        const openIssueCount = issues.filter(issue =>
          ['OPEN', 'NEEDS_SOURCE_REVIEW'].includes(issue.review_status || 'OPEN')
        ).length;

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
          eligibility_status: eligibility?.status || '',
          evaluation_status: evaluationResult?.status || 'NOT_STARTED',
          document_statuses: documentStatuses.join(','),
          open_issue_count: openIssueCount,
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
    const eligibility = latestEligibility(
      Array.from(this.eligibilityAssessments.values())
        .filter(item => item.submission_id === submissionId)
    );
    const criterionEvaluations = Array.from(this.criterionEvaluations.values())
      .filter(item => item.submission_id === submissionId)
      .sort((a, b) => a.criterion_id.localeCompare(b.criterion_id));
    const evaluationResult = latestEvaluationResult(
      Array.from(this.evaluationResults.values())
        .filter(item => item.submission_id === submissionId)
    );
    const entityIds = new Set([
      submissionId,
      ...documents.map(document => document.document_id),
      ...issues.map(issue => issue.normalization_issue_id),
      ...(eligibility ? [eligibility.eligibility_assessment_id] : []),
      ...criterionEvaluations.map(item => item.criterion_evaluation_id),
      ...(evaluationResult ? [evaluationResult.evaluation_result_id] : []),
    ]);
    const auditEvents = Array.from(this.auditEvents.values())
      .filter(event => entityIds.has(event.entity_id))
      .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

    return {
      submission,
      candidate,
      responses,
      documents,
      issues,
      eligibility_assessment: eligibility || null,
      criterion_evaluations: criterionEvaluations,
      evaluation_result: evaluationResult || null,
      audit_events: auditEvents,
    };
  }

  async getSubmission(submissionId) {
    return this.submissions.get(submissionId) || null;
  }

  async listCriterionEvaluations(submissionId) {
    return Array.from(this.criterionEvaluations.values())
      .filter(item => item.submission_id === submissionId)
      .sort((a, b) => a.criterion_id.localeCompare(b.criterion_id));
  }

  async saveCriterionEvaluation(evaluation, result, { actor, reason } = {}) {
    const previous = this.criterionEvaluations.get(evaluation.criterion_evaluation_id);
    this.criterionEvaluations.set(evaluation.criterion_evaluation_id, evaluation);
    this.evaluationResults.set(result.evaluation_result_id, result);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent(
        'CRITERION_EVALUATION_UPDATED',
        'CriterionEvaluation',
        evaluation.criterion_evaluation_id,
        actor || evaluation.evaluated_by,
        previous ? sanitizeCriterionEvaluationAuditValue(previous) : null,
        sanitizeCriterionEvaluationAuditValue(evaluation),
        reason,
      ),
    );
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent(
        'EVALUATION_RESULT_UPDATED',
        'EvaluationResult',
        result.evaluation_result_id,
        actor || result.calculated_by,
        null,
        sanitizeEvaluationResultAuditValue(result),
        'Operational evaluation summary refreshed.',
      ),
    );
    return { criterion_evaluation: evaluation, evaluation_result: result };
  }

  async getEligibilityInput(submissionId) {
    const detail = await this.getAdminSubmissionDetail(submissionId);
    if (!detail) return null;
    return {
      submission: detail.submission,
      candidate: detail.candidate,
      responses: Object.fromEntries((detail.responses || []).map(response => [response.field_code, response.value])),
      documents: detail.documents || [],
    };
  }

  async saveEligibilityAssessment(assessment, { actor, reason } = {}) {
    const previous = this.eligibilityAssessments.get(assessment.eligibility_assessment_id);
    this.eligibilityAssessments.set(assessment.eligibility_assessment_id, assessment);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent(
        'ELIGIBILITY_ASSESSED',
        'EligibilityAssessment',
        assessment.eligibility_assessment_id,
        actor || assessment.assessed_by,
        previous ? sanitizeEligibilityAuditValue(previous) : null,
        sanitizeEligibilityAuditValue(assessment),
        reason,
      ),
    );
    return assessment;
  }

  async updateEligibilityReview(assessmentId, { status, note, actor, reason }) {
    const allowed = new Set([
      'READY_FOR_TECHNICAL_REVIEW',
      'BLOCKED_BY_MISSING_REQUIREMENTS',
      'REQUIRES_MANUAL_REVIEW',
    ]);
    if (!allowed.has(status)) {
      const error = new Error('Invalid eligibility status.');
      error.statusCode = 400;
      error.code = 'INVALID_ELIGIBILITY_STATUS';
      throw error;
    }

    const current = this.eligibilityAssessments.get(assessmentId);
    if (!current) {
      const error = new Error('Eligibility assessment not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const updated = {
      ...current,
      status,
      manual_status: status,
      manual_note: String(note || ''),
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor || 'ADMIN',
    };
    this.eligibilityAssessments.set(assessmentId, updated);
    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent(
        'ELIGIBILITY_REVIEW_UPDATED',
        'EligibilityAssessment',
        assessmentId,
        actor,
        sanitizeEligibilityAuditValue(current),
        sanitizeEligibilityAuditValue(updated),
        reason,
      ),
    );
    return updated;
  }

  async recordDocumentOpen(documentId, { actor, reason }) {
    const current = this.documents.get(documentId);
    if (!current) {
      const error = new Error('Document not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    this.auditEvents.set(
      `audit_${this.auditEvents.size + 1}`,
      auditEvent('DOCUMENT_OPENED', 'Document', documentId, actor || 'ADMIN', null, sanitizeDocumentAuditValue(current), reason),
    );
    return { status: 'ok' };
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

function sanitizeEligibilityAuditValue(assessment) {
  return {
    eligibility_assessment_id: assessment.eligibility_assessment_id,
    candidate_id: assessment.candidate_id,
    submission_id: assessment.submission_id,
    status: assessment.status,
    rule_version: assessment.rule_version,
    assessed_at: assessment.assessed_at || null,
    assessed_by: assessment.assessed_by || '',
    manual_status: assessment.manual_status || '',
    manual_note: assessment.manual_note || '',
    reviewed_at: assessment.reviewed_at || null,
    reviewed_by: assessment.reviewed_by || '',
  };
}

function sanitizeCriterionEvaluationAuditValue(evaluation) {
  return {
    criterion_evaluation_id: evaluation.criterion_evaluation_id,
    candidate_id: evaluation.candidate_id,
    submission_id: evaluation.submission_id,
    criterion_id: evaluation.criterion_id,
    status: evaluation.status,
    score: evaluation.score,
    evaluated_at: evaluation.evaluated_at || null,
    evaluated_by: evaluation.evaluated_by || '',
  };
}

function sanitizeEvaluationResultAuditValue(result) {
  return {
    evaluation_result_id: result.evaluation_result_id,
    candidate_id: result.candidate_id,
    submission_id: result.submission_id,
    status: result.status,
    completed_criteria: result.completed_criteria,
    total_criteria: result.total_criteria,
    calculated_at: result.calculated_at || null,
    calculated_by: result.calculated_by || '',
  };
}

function latestEligibility(items) {
  return items.sort((a, b) => String(b.assessed_at).localeCompare(String(a.assessed_at)))[0] || null;
}

function latestEvaluationResult(items) {
  return items.sort((a, b) => String(b.calculated_at).localeCompare(String(a.calculated_at)))[0] || null;
}

function sanitizeAdminUser(user) {
  return {
    admin_user_id: user.admin_user_id,
    username: user.username,
    role: user.role,
    active: !!user.active,
    created_at: user.created_at || '',
    updated_at: user.updated_at || '',
  };
}

function validateAdminRole(role) {
  if (!['ADMIN', 'REVIEWER', 'INTAKE', 'VIEWER'].includes(role)) {
    const error = new Error('Invalid admin role.');
    error.statusCode = 400;
    error.code = 'INVALID_ADMIN_ROLE';
    throw error;
  }
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
