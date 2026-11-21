-- C1.1 invitation identity confirmation. The creator records a minimal chosen label so a
-- forwarded capability cannot be accepted without confirming who it was addressed to.
-- No account lookup, email address or profile data is stored.
ALTER TABLE chemistry_invitations ADD COLUMN invitee_label TEXT;

CREATE TRIGGER chemistry_invitation_label_shape
BEFORE INSERT ON chemistry_invitations
WHEN NEW.invitee_label IS NOT NULL
 AND (length(trim(NEW.invitee_label)) < 1 OR length(NEW.invitee_label) > 40)
BEGIN
  SELECT RAISE(ABORT, 'invitation label must be 1-40 characters');
END;

CREATE TRIGGER chemistry_invitation_label_shape_update
BEFORE UPDATE OF invitee_label ON chemistry_invitations
WHEN NEW.invitee_label IS NOT NULL
 AND (length(trim(NEW.invitee_label)) < 1 OR length(NEW.invitee_label) > 40)
BEGIN
  SELECT RAISE(ABORT, 'invitation label must be 1-40 characters');
END;
