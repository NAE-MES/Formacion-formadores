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

  async getAdminSummary() {
    const result = await this.pool.query(`
      select
        (select count(*)::int from candidates) as candidates,
        (select count(*)::int from submissions) as submissions,
        (select count(*)::int from documents) as documents,
        (select count(*)::int from normalization_issues) as normalization_issues
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
        count(distinct ni.normalization_issue_id)::int as issue_count,
        count(distinct d.document_id)::int as document_count
      from submissions s
      left join candidates c on c.candidate_id = s.candidate_id
      left join normalization_issues ni on ni.submission_id = s.submission_id
      left join documents d on d.candidate_id = s.candidate_id
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
        s.normalization_status
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
        original_name, storage_reference, received_at, status
       from documents
       where candidate_id = $1
       order by received_at desc`,
      [submission.rows[0].candidate_id],
    );
    const issues = await this.pool.query(
      `select normalization_issue_id, submission_id, candidate_id, field_code,
        code, severity, message, created_at
       from normalization_issues
       where submission_id = $1
       order by created_at desc`,
      [submissionId],
    );

    return {
      submission: submission.rows[0],
      candidate: candidate.rows[0] || {},
      responses: responses.rows,
      documents: documents.rows,
      issues: issues.rows,
    };
  }
}

module.exports = {
  PostgresRepository,
};
