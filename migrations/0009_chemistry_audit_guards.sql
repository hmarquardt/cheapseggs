-- Serialize the pending-invitation budget at the write, including competing creates.
CREATE TRIGGER chemistry_invitation_capacity
BEFORE INSERT ON chemistry_invitations
WHEN NEW.state = 'pending' AND (
  SELECT count(*) FROM chemistry_invitations
  WHERE created_by = NEW.created_by AND state = 'pending' AND expires_at > NEW.created_at
) >= 3
BEGIN
  SELECT RAISE(ABORT, 'invitation capacity reached');
END;

-- Bound cleanup scans by expiry/status, including abandoned invitations with saved drafts.
CREATE INDEX chemistry_assessments_expiry ON chemistry_assessments(status, assessment_expires_at);
CREATE INDEX chemistry_reports_expiry ON chemistry_assessments(status, report_expires_at);
CREATE INDEX chemistry_invitations_expiry ON chemistry_invitations(state, expires_at);
CREATE INDEX chemistry_pair_releases_expiry ON chemistry_pair_releases(last_released_at);
