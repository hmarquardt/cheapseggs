const id = "00000000-0000-4000-8000-000000000000";
export const CHEMISTRY_GATE_PATHS = [
  "",
  "/status",
  "/assessments",
  `/assessments/${id}`,
  `/assessments/${id}/draft`,
  `/assessments/${id}/submission`,
  `/assessments/${id}/approval`,
  `/assessments/${id}/release`,
  `/assessments/${id}/report`,
  `/assessments/${id}/withdraw`,
  `/assessments/${id}/decline`,
  `/assessments/${id}/invitation/revoke`,
  "/invitations/accept",
].map((path) => `/api/v1/chemistry-check${path}`);
export const CHEMISTRY_GATE_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
