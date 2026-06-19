/* Shared partner allowlist — add new partners here as you onboard. */
const PARTNERS = {
  comfi: { name: "Comfi", zohoId: "COMFI" },
  apex: { name: "Apex Advisory", zohoId: "APEX" },
};

function getPartnerConfig(slug) {
  if (!slug) return null;
  return PARTNERS[String(slug).toLowerCase()] || null;
}

function normalizePartnerSlug(input) {
  return String(input || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}
