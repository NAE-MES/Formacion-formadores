const crypto = require('node:crypto');

class PostgresRepository {
  constructor(databaseUrl) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgresRepository.');
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async saveImportedSubmission(imported) {
    const submissionId = imported.submission?.submission_id || imported.submission_id;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (imported.submission) {
        const existingByReference = await client.query(
          `select submission_id
           from submissions
           where source_channel = $1 and source_reference = $2`,
          [imported.submission.source_channel, imported.submission.source_reference],
        );
        if (existingByReference.rowCount > 0 && existingByReference.rows[0].submission_id !== submissionId) {
          const rebound = rebindImportedSubmission(imported, existingByReference.rows[0].submission_id);
          await replaceImportedSubmission(client, rebound);
          await client.query('COMMIT');
          return { status: 'REPROCESSED', imported: rebound };
        }
      }

      const existing = await client.query(
        'select submission_id from submissions where submission_id = $1',
        [submissionId],
      );
      if (existing.rowCount > 0) {
        await client.query('COMMIT');
        return { status: 'REIMPORTED', imported };
      }

      if (imported.candidate) {
        await client.query(
          `insert into candidates (
            candidate_id, first_name, second_name, first_surname, second_surname,
            identification_number, email, province, created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          on conflict (candidate_id) do update set
            updated_at = excluded.updated_at`,
          [
            imported.candidate.candidate_id,
            imported.candidate.first_name,
            imported.candidate.second_name,
            imported.candidate.first_surname,
            imported.candidate.second_surname,
            imported.candidate.identification_number,
            imported.candidate.email,
            imported.candidate.province,
            imported.candidate.created_at,
            imported.candidate.updated_at,
          ],
        );
      }

      if (imported.submission) {
        await client.query(
          `insert into submissions (
            submission_id, candidate_id, source_channel, source_reference,
            received_at, normalization_status, created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            imported.submission.submission_id,
            imported.submission.candidate_id,
            imported.submission.source_channel,
            imported.submission.source_reference,
            imported.submission.received_at,
            imported.submission.normalization_status,
            imported.submission.created_at,
            imported.submission.updated_at,
          ],
        );
      }

      if (imported.raw) {
        await client.query(
          `insert into submission_raws (
            submission_raw_id, submission_id, source_channel, raw_payload,
            raw_hash, received_at
          ) values ($1,$2,$3,$4,$5,$6)
          on conflict (submission_raw_id) do nothing`,
          [
            imported.raw.submission_raw_id,
            imported.raw.submission_id,
            imported.raw.source_channel,
            JSON.stringify(imported.raw.raw_payload),
            imported.raw.raw_hash,
            imported.raw.received_at,
          ],
        );
      }

      for (const response of imported.responses || []) {
        await client.query(
          `insert into candidate_responses (
            candidate_response_id, candidate_id, submission_id, field_code, value
          ) values ($1,$2,$3,$4,$5)
          on conflict (candidate_response_id) do nothing`,
          [
            response.candidate_response_id,
            response.candidate_id,
            response.submission_id,
            response.field_code,
            JSON.stringify(response.value),
          ],
        );
      }

      for (const document of imported.documents || []) {
        await client.query(
          `insert into documents (
            document_id, candidate_id, document_type, source_channel,
            original_name, storage_reference, received_at, status
          ) values ($1,$2,$3,$4,$5,$6,$7,$8)
          on conflict (document_id) do nothing`,
          [
            document.document_id,
            document.candidate_id,
            document.document_type,
            document.source_channel,
            document.original_name,
            document.storage_reference,
            document.received_at,
            document.status,
          ],
        );
      }

      for (const issue of imported.issues || []) {
        await client.query(
          `insert into normalization_issues (
            normalization_issue_id, submission_id, candidate_id, field_code,
            code, severity, message, created_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8)
          on conflict (normalization_issue_id) do nothing`,
          [
            issue.normalization_issue_id,
            issue.submission_id,
            issue.candidate_id,
            issue.field_code,
            issue.code,
            issue.severity,
            issue.message,
            issue.created_at,
          ],
        );
      }

      for (const event of imported.auditEvents || []) {
        await client.query(
          `insert into audit_events (
            audit_event_id, action, entity_type, entity_id, occurred_at,
            source_channel, actor, previous_value, new_value, reason
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          on conflict (audit_event_id) do nothing`,
          [
            event.audit_event_id,
            event.action,
            event.entity_type,
            event.entity_id,
            event.occurred_at,
            event.source_channel,
            event.actor,
            event.previous_value ? JSON.stringify(event.previous_value) : null,
            event.new_value ? JSON.stringify(event.new_value) : null,
            event.reason,
          ],
        );
      }

      await client.query('COMMIT');
      return { status: imported.status, imported };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  async ensureBootstrapAdminUser({ username, password, role }) {
    const now = new Date().toISOString();
    const adminUserId = `admin_${hash(`admin-user|${normalizeUsername(username)}`)}`;
    const passwordHash = hashPassword(password);
    await this.pool.query(
      `insert into admin_users (
        admin_user_id, username, password_hash, role, active, created_at, updated_at
      ) values ($1,$2,$3,$4,true,$5,$5)
      on conflict (username) do update set
        password_hash = excluded.password_hash,
        role = excluded.role,
        active = true,
        updated_at = excluded.updated_at`,
      [adminUserId, normalizeUsername(username), passwordHash, role || 'ADMIN', now],
    );
  }

  async findAdminUserByUsername(username) {
    const result = await this.pool.query(
      `select admin_user_id, username, password_hash, role, active
       from admin_users where username = $1`,
      [normalizeUsername(username)],
    );
    return result.rows[0] || null;
  }

  async listAdminUsers() {
    const result = await this.pool.query(
      `select admin_user_id, username, role, active, created_at, updated_at
       from admin_users
       order by username`,
    );
    return result.rows;
  }

  async createAdminUser({ username, password, role, actor, reason }) {
    validateAdminRole(role);
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername || !password) {
      const error = new Error('Username and password are required.');
      error.statusCode = 400;
      error.code = 'INVALID_ADMIN_USER';
      throw error;
    }

    const now = new Date().toISOString();
    const adminUserId = `admin_${hash(`admin-user|${normalizedUsername}`)}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query(
        `insert into admin_users (
          admin_user_id, username, password_hash, role, active, created_at, updated_at
        ) values ($1,$2,$3,$4,true,$5,$5)
        returning admin_user_id, username, role, active, created_at, updated_at`,
        [adminUserId, normalizedUsername, hashPassword(password), role, now],
      );
      await insertAuditEvent(client, {
        action: 'ADMIN_USER_CREATED',
        entityType: 'AdminUser',
        entityId: adminUserId,
        actor,
        previousValue: null,
        newValue: sanitizeAdminUserAuditValue(created.rows[0]),
        reason,
      });
      await client.query('COMMIT');
      return created.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        const conflict = new Error('Admin username already exists.');
        conflict.statusCode = 409;
        conflict.code = 'ADMIN_USER_EXISTS';
        throw conflict;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAdminUser(username, { password, role, active, actor, reason }) {
    if (role !== undefined) validateAdminRole(role);
    const normalizedUsername = normalizeUsername(username);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `select admin_user_id, username, role, active, created_at, updated_at
         from admin_users
         where username = $1
         for update`,
        [normalizedUsername],
      );
      if (current.rowCount === 0) {
        const error = new Error('Admin user not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      const nextRole = role === undefined ? current.rows[0].role : role;
      const nextActive = active === undefined ? current.rows[0].active : !!active;
      const now = new Date().toISOString();
      const updated = await client.query(
        `update admin_users
         set role = $2,
           active = $3,
           password_hash = case when $4 = '' then password_hash else $4 end,
           updated_at = $5
         where username = $1
         returning admin_user_id, username, role, active, created_at, updated_at`,
        [normalizedUsername, nextRole, nextActive, password ? hashPassword(password) : '', now],
      );
      await insertAuditEvent(client, {
        action: 'ADMIN_USER_UPDATED',
        entityType: 'AdminUser',
        entityId: updated.rows[0].admin_user_id,
        actor,
        previousValue: sanitizeAdminUserAuditValue(current.rows[0]),
        newValue: sanitizeAdminUserAuditValue(updated.rows[0]),
        reason,
      });
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createAdminSession(adminUserId, tokenHash, expiresAt) {
    const now = new Date().toISOString();
    const sessionId = `sess_${hash(`session|${adminUserId}|${tokenHash}|${now}`)}`;
    await this.pool.query(
      `insert into admin_sessions (
        admin_session_id, admin_user_id, session_token_hash, created_at, expires_at
      ) values ($1,$2,$3,$4,$5)`,
      [sessionId, adminUserId, tokenHash, now, expiresAt],
    );
    await this.pool.query(
      `insert into audit_events (
        audit_event_id, action, entity_type, entity_id, occurred_at,
        source_channel, actor, previous_value, new_value, reason
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        `audit_${hash(`ADMIN_LOGIN|${sessionId}|${now}`)}`,
        'ADMIN_LOGIN',
        'AdminSession',
        sessionId,
        now,
        'ADMIN_UI',
        adminUserId,
        null,
        JSON.stringify({ admin_user_id: adminUserId }),
        '',
      ],
    );
    return { admin_session_id: sessionId, admin_user_id: adminUserId, expires_at: expiresAt };
  }

  async findAdminSessionByTokenHash(tokenHash) {
    const result = await this.pool.query(
      `select
        s.admin_session_id,
        s.admin_user_id,
        s.expires_at,
        s.revoked_at,
        u.username,
        u.role,
        u.active
       from admin_sessions s
       join admin_users u on u.admin_user_id = s.admin_user_id
       where s.session_token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] || null;
  }

  async revokeAdminSession(tokenHash, actor) {
    const now = new Date().toISOString();
    const updated = await this.pool.query(
      `update admin_sessions
       set revoked_at = $2
       where session_token_hash = $1 and revoked_at is null
       returning admin_session_id, admin_user_id`,
      [tokenHash, now],
    );
    if (updated.rowCount === 0) return null;
    await this.pool.query(
      `insert into audit_events (
        audit_event_id, action, entity_type, entity_id, occurred_at,
        source_channel, actor, previous_value, new_value, reason
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        `audit_${hash(`ADMIN_LOGOUT|${updated.rows[0].admin_session_id}|${now}`)}`,
        'ADMIN_LOGOUT',
        'AdminSession',
        updated.rows[0].admin_session_id,
        now,
        'ADMIN_UI',
        actor || updated.rows[0].admin_user_id,
        null,
        JSON.stringify({ revoked_at: now }),
        '',
      ],
    );
    return updated.rows[0];
  }

  async getAdminSummary() {
    const result = await this.pool.query(`
      select
        (select count(*)::int from candidates) as candidates,
        (select count(*)::int from submissions) as submissions,
        (select count(*)::int from documents) as documents,
        (select count(*)::int from normalization_issues) as normalization_issues,
        (select count(*)::int from eligibility_assessments) as eligibility_assessments,
        (select count(*)::int from eligibility_assessments where status = 'READY_FOR_TECHNICAL_REVIEW') as eligibility_ready,
        (select count(*)::int from eligibility_assessments where status = 'BLOCKED_BY_MISSING_REQUIREMENTS') as eligibility_blocked,
        (select count(*)::int from eligibility_assessments where status = 'REQUIRES_MANUAL_REVIEW') as eligibility_review,
        (select count(*)::int from documents where status = 'NEEDS_REVIEW') as documents_needs_review,
        (select count(*)::int from documents where status = 'REJECTED') as documents_rejected,
        (select count(*)::int from normalization_issues where review_status in ('OPEN', 'NEEDS_SOURCE_REVIEW')) as open_issues
    `);
    return result.rows[0];
  }

  async listAdminSubmissions() {
    const result = await this.pool.query(`
      select
        s.submission_id,
        s.candidate_id,
        trim(concat_ws(' ',
          c.first_name,
          nullif(c.second_name, ''),
          c.first_surname,
          nullif(c.second_surname, '')
        )) as full_name,
        c.email,
        c.province,
        s.source_channel,
        s.source_reference,
        s.received_at,
        s.normalization_status,
        ea.status as eligibility_status,
        string_agg(distinct d.status, ',' order by d.status) as document_statuses,
        count(distinct case when ni.review_status in ('OPEN', 'NEEDS_SOURCE_REVIEW') then ni.normalization_issue_id end)::int as open_issue_count,
        count(distinct ni.normalization_issue_id)::int as issue_count,
        count(distinct d.document_id)::int as document_count
      from submissions s
      left join candidates c on c.candidate_id = s.candidate_id
      left join normalization_issues ni on ni.submission_id = s.submission_id
      left join documents d on d.candidate_id = s.candidate_id
      left join lateral (
        select status
        from eligibility_assessments
        where submission_id = s.submission_id
        order by assessed_at desc
        limit 1
      ) ea on true
      group by
        s.submission_id,
        s.candidate_id,
        c.first_name,
        c.second_name,
        c.first_surname,
        c.second_surname,
        c.email,
        c.province,
        s.source_channel,
        s.source_reference,
        s.received_at,
        s.normalization_status,
        ea.status
      order by s.received_at desc
      limit 500
    `);
    return result.rows;
  }

  async getAdminSubmissionDetail(submissionId) {
    const submission = await this.pool.query(
      `select * from submissions where submission_id = $1`,
      [submissionId],
    );
    if (submission.rowCount === 0) return null;

    const candidate = await this.pool.query(
      `select * from candidates where candidate_id = $1`,
      [submission.rows[0].candidate_id],
    );
    const responses = await this.pool.query(
      `select candidate_response_id, candidate_id, submission_id, field_code, value
       from candidate_responses
       where submission_id = $1
       order by field_code`,
      [submissionId],
    );
    const documents = await this.pool.query(
      `select document_id, candidate_id, document_type, source_channel,
        original_name, storage_reference, received_at, status, reviewed_at, reviewed_by
       from documents
       where candidate_id = $1
       order by received_at desc`,
      [submission.rows[0].candidate_id],
    );
    const issues = await this.pool.query(
      `select normalization_issue_id, submission_id, candidate_id, field_code,
        code, severity, message, created_at, review_status, review_note, reviewed_at, reviewed_by
       from normalization_issues
       where submission_id = $1
       order by created_at desc`,
      [submissionId],
    );
    const eligibility = await this.pool.query(
      `select eligibility_assessment_id, candidate_id, submission_id, assessment_scope,
        rule_version, status, check_results, assessed_at, assessed_by,
        manual_status, manual_note, reviewed_at, reviewed_by
       from eligibility_assessments
       where submission_id = $1
       order by assessed_at desc
       limit 1`,
      [submissionId],
    );
    const auditEvents = await this.pool.query(
      `select audit_event_id, action, entity_type, entity_id, occurred_at,
        source_channel, actor, reason
       from audit_events
       where entity_id = any($1)
       order by occurred_at desc
       limit 100`,
      [[
        submissionId,
        ...documents.rows.map(document => document.document_id),
        ...issues.rows.map(issue => issue.normalization_issue_id),
        ...eligibility.rows.map(item => item.eligibility_assessment_id),
      ]],
    );

    return {
      submission: submission.rows[0],
      candidate: candidate.rows[0] || {},
      responses: responses.rows,
      documents: documents.rows,
      issues: issues.rows,
      eligibility_assessment: eligibility.rows[0] || null,
      audit_events: auditEvents.rows,
    };
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `select eligibility_assessment_id, candidate_id, submission_id, status,
          rule_version, assessed_at, assessed_by, manual_status, manual_note,
          reviewed_at, reviewed_by
         from eligibility_assessments
         where eligibility_assessment_id = $1
         for update`,
        [assessment.eligibility_assessment_id],
      );
      const previousValue = current.rows[0] ? sanitizeEligibilityAuditValue(current.rows[0]) : null;
      const saved = await client.query(
        `insert into eligibility_assessments (
          eligibility_assessment_id, candidate_id, submission_id, assessment_scope,
          rule_version, status, check_results, assessed_at, assessed_by,
          manual_status, manual_note, reviewed_at, reviewed_by
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (eligibility_assessment_id) do update set
          status = excluded.status,
          check_results = excluded.check_results,
          assessed_at = excluded.assessed_at,
          assessed_by = excluded.assessed_by,
          manual_status = '',
          manual_note = '',
          reviewed_at = null,
          reviewed_by = ''
        returning eligibility_assessment_id, candidate_id, submission_id, assessment_scope,
          rule_version, status, check_results, assessed_at, assessed_by,
          manual_status, manual_note, reviewed_at, reviewed_by`,
        [
          assessment.eligibility_assessment_id,
          assessment.candidate_id,
          assessment.submission_id,
          assessment.assessment_scope,
          assessment.rule_version,
          assessment.status,
          JSON.stringify(assessment.check_results),
          assessment.assessed_at,
          assessment.assessed_by,
          assessment.manual_status || '',
          assessment.manual_note || '',
          assessment.reviewed_at || null,
          assessment.reviewed_by || '',
        ],
      );

      await insertAuditEvent(client, {
        action: 'ELIGIBILITY_ASSESSED',
        entityType: 'EligibilityAssessment',
        entityId: saved.rows[0].eligibility_assessment_id,
        actor: actor || assessment.assessed_by,
        previousValue,
        newValue: sanitizeEligibilityAuditValue(saved.rows[0]),
        reason: reason || '',
      });

      await client.query('COMMIT');
      return saved.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `select eligibility_assessment_id, candidate_id, submission_id, status,
          rule_version, assessed_at, assessed_by, manual_status, manual_note,
          reviewed_at, reviewed_by
         from eligibility_assessments
         where eligibility_assessment_id = $1
         for update`,
        [assessmentId],
      );
      if (current.rowCount === 0) {
        const error = new Error('Eligibility assessment not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      const reviewedAt = new Date().toISOString();
      const updated = await client.query(
        `update eligibility_assessments
         set status = $2, manual_status = $2, manual_note = $3,
           reviewed_at = $4, reviewed_by = $5
         where eligibility_assessment_id = $1
         returning eligibility_assessment_id, candidate_id, submission_id, assessment_scope,
           rule_version, status, check_results, assessed_at, assessed_by,
           manual_status, manual_note, reviewed_at, reviewed_by`,
        [assessmentId, status, String(note || ''), reviewedAt, actor],
      );

      await insertAuditEvent(client, {
        action: 'ELIGIBILITY_REVIEW_UPDATED',
        entityType: 'EligibilityAssessment',
        entityId: assessmentId,
        actor,
        previousValue: sanitizeEligibilityAuditValue(current.rows[0]),
        newValue: sanitizeEligibilityAuditValue(updated.rows[0]),
        reason,
      });

      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordDocumentOpen(documentId, { actor, reason }) {
    const current = await this.pool.query(
      `select document_id, candidate_id, document_type, status
       from documents where document_id = $1`,
      [documentId],
    );
    if (current.rowCount === 0) {
      const error = new Error('Document not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await insertAuditEvent(client, {
        action: 'DOCUMENT_OPENED',
        entityType: 'Document',
        entityId: documentId,
        actor,
        previousValue: null,
        newValue: sanitizeDocumentAuditValue(current.rows[0]),
        reason,
      });
      await client.query('COMMIT');
      return { status: 'ok' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDocumentStatus(documentId, { status, actor, reason }) {
    const allowed = new Set(['RECEIVED', 'VALIDATED', 'REJECTED', 'NEEDS_REVIEW']);
    if (!allowed.has(status)) {
      const error = new Error('Invalid document status.');
      error.statusCode = 400;
      error.code = 'INVALID_DOCUMENT_STATUS';
      throw error;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `select document_id, candidate_id, document_type, status, reviewed_at, reviewed_by
         from documents where document_id = $1 for update`,
        [documentId],
      );
      if (current.rowCount === 0) {
        const error = new Error('Document not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      const reviewedAt = new Date().toISOString();
      const updated = await client.query(
        `update documents
         set status = $2, reviewed_at = $3, reviewed_by = $4
         where document_id = $1
         returning document_id, candidate_id, document_type, source_channel,
           original_name, storage_reference, received_at, status, reviewed_at, reviewed_by`,
        [documentId, status, reviewedAt, actor],
      );

      await insertAuditEvent(client, {
        action: 'DOCUMENT_STATUS_UPDATED',
        entityType: 'Document',
        entityId: documentId,
        actor,
        previousValue: sanitizeDocumentAuditValue(current.rows[0]),
        newValue: sanitizeDocumentAuditValue(updated.rows[0]),
        reason,
      });

      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateNormalizationIssueReview(issueId, { reviewStatus, reviewNote, actor, reason }) {
    const allowed = new Set(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'NEEDS_SOURCE_REVIEW']);
    if (!allowed.has(reviewStatus)) {
      const error = new Error('Invalid issue review status.');
      error.statusCode = 400;
      error.code = 'INVALID_ISSUE_STATUS';
      throw error;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `select normalization_issue_id, submission_id, candidate_id, field_code,
          code, severity, review_status, review_note, reviewed_at, reviewed_by
         from normalization_issues where normalization_issue_id = $1 for update`,
        [issueId],
      );
      if (current.rowCount === 0) {
        const error = new Error('Normalization issue not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      const reviewedAt = new Date().toISOString();
      const updated = await client.query(
        `update normalization_issues
         set review_status = $2, review_note = $3, reviewed_at = $4, reviewed_by = $5
         where normalization_issue_id = $1
         returning normalization_issue_id, submission_id, candidate_id, field_code,
           code, severity, message, created_at, review_status, review_note, reviewed_at, reviewed_by`,
        [issueId, reviewStatus, String(reviewNote || ''), reviewedAt, actor],
      );

      await insertAuditEvent(client, {
        action: 'NORMALIZATION_ISSUE_REVIEW_UPDATED',
        entityType: 'NormalizationIssue',
        entityId: issueId,
        actor,
        previousValue: sanitizeIssueAuditValue(current.rows[0]),
        newValue: sanitizeIssueAuditValue(updated.rows[0]),
        reason,
      });

      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function replaceImportedSubmission(client, imported) {
  if (imported.candidate) {
    await client.query(
      `insert into candidates (
        candidate_id, first_name, second_name, first_surname, second_surname,
        identification_number, email, province, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (candidate_id) do update set
        first_name = excluded.first_name,
        second_name = excluded.second_name,
        first_surname = excluded.first_surname,
        second_surname = excluded.second_surname,
        identification_number = excluded.identification_number,
        email = excluded.email,
        province = excluded.province,
        updated_at = excluded.updated_at`,
      [
        imported.candidate.candidate_id,
        imported.candidate.first_name,
        imported.candidate.second_name,
        imported.candidate.first_surname,
        imported.candidate.second_surname,
        imported.candidate.identification_number,
        imported.candidate.email,
        imported.candidate.province,
        imported.candidate.created_at,
        imported.candidate.updated_at,
      ],
    );
  }

  await client.query(
    `update submissions
     set candidate_id = $2, received_at = $3, normalization_status = $4, updated_at = $5
     where submission_id = $1`,
    [
      imported.submission.submission_id,
      imported.submission.candidate_id,
      imported.submission.received_at,
      imported.submission.normalization_status,
      imported.submission.updated_at,
    ],
  );

  if (imported.raw) {
    await client.query(
      `insert into submission_raws (
        submission_raw_id, submission_id, source_channel, raw_payload,
        raw_hash, received_at
      ) values ($1,$2,$3,$4,$5,$6)
      on conflict (submission_raw_id) do nothing`,
      [
        imported.raw.submission_raw_id,
        imported.raw.submission_id,
        imported.raw.source_channel,
        JSON.stringify(imported.raw.raw_payload),
        imported.raw.raw_hash,
        imported.raw.received_at,
      ],
    );
  }

  await client.query(`delete from candidate_responses where submission_id = $1`, [imported.submission.submission_id]);
  for (const response of imported.responses || []) {
    await client.query(
      `insert into candidate_responses (
        candidate_response_id, candidate_id, submission_id, field_code, value
      ) values ($1,$2,$3,$4,$5)`,
      [
        response.candidate_response_id,
        response.candidate_id,
        response.submission_id,
        response.field_code,
        JSON.stringify(response.value),
      ],
    );
  }

  for (const document of imported.documents || []) {
    await client.query(
      `insert into documents (
        document_id, candidate_id, document_type, source_channel,
        original_name, storage_reference, received_at, status
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (document_id) do nothing`,
      [
        document.document_id,
        document.candidate_id,
        document.document_type,
        document.source_channel,
        document.original_name,
        document.storage_reference,
        document.received_at,
        document.status,
      ],
    );
  }

  await client.query(`delete from normalization_issues where submission_id = $1`, [imported.submission.submission_id]);
  for (const issue of imported.issues || []) {
    await client.query(
      `insert into normalization_issues (
        normalization_issue_id, submission_id, candidate_id, field_code,
        code, severity, message, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (normalization_issue_id) do nothing`,
      [
        issue.normalization_issue_id,
        issue.submission_id,
        issue.candidate_id,
        issue.field_code,
        issue.code,
        issue.severity,
        issue.message,
        issue.created_at,
      ],
    );
  }

  await insertAuditEvent(client, {
    action: 'SUBMISSION_REPROCESSED',
    entityType: 'Submission',
    entityId: imported.submission.submission_id,
    actor: 'API',
    previousValue: null,
    newValue: {
      candidate_id: imported.submission.candidate_id,
      normalization_status: imported.submission.normalization_status,
    },
    reason: 'Same source reference reprocessed with updated payload.',
  });
}

function rebindImportedSubmission(imported, submissionId) {
  const rawHash = imported.raw?.raw_hash || hash(JSON.stringify(imported.raw?.raw_payload || {}));
  return {
    ...imported,
    submission: {
      ...imported.submission,
      submission_id: submissionId,
    },
    raw: imported.raw ? {
      ...imported.raw,
      submission_raw_id: `raw_${hash(`raw|${submissionId}|${rawHash}`)}`,
      submission_id: submissionId,
    } : null,
    responses: (imported.responses || []).map(response => ({
      ...response,
      candidate_response_id: `resp_${hash(`response|${submissionId}|${response.field_code}`)}`,
      submission_id: submissionId,
    })),
    issues: (imported.issues || []).map(issue => ({
      ...issue,
      normalization_issue_id: `issue_${hash(`issue|${submissionId}|${issue.code}|${issue.field_code}|${issue.message}`)}`,
      submission_id: submissionId,
    })),
    auditEvents: imported.auditEvents || [],
  };
}

async function insertAuditEvent(client, event) {
  const occurredAt = new Date().toISOString();
  const auditEvent = {
    audit_event_id: `audit_${hash(`${event.action}|${event.entityType}|${event.entityId}|${occurredAt}`)}`,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    occurred_at: occurredAt,
    source_channel: 'ADMIN_UI',
    actor: event.actor || 'ADMIN',
    previous_value: event.previousValue || null,
    new_value: event.newValue || null,
    reason: event.reason || '',
  };

  await client.query(
    `insert into audit_events (
      audit_event_id, action, entity_type, entity_id, occurred_at,
      source_channel, actor, previous_value, new_value, reason
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      auditEvent.audit_event_id,
      auditEvent.action,
      auditEvent.entity_type,
      auditEvent.entity_id,
      auditEvent.occurred_at,
      auditEvent.source_channel,
      auditEvent.actor,
      auditEvent.previous_value ? JSON.stringify(auditEvent.previous_value) : null,
      auditEvent.new_value ? JSON.stringify(auditEvent.new_value) : null,
      auditEvent.reason,
    ],
  );
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
    review_status: issue.review_status,
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

function sanitizeAdminUserAuditValue(user) {
  return {
    admin_user_id: user.admin_user_id,
    username: user.username,
    role: user.role,
    active: !!user.active,
    updated_at: user.updated_at || null,
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

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 210000;
  const derived = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${derived}`;
}

module.exports = {
  PostgresRepository,
};
