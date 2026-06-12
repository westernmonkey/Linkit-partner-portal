/* ===================================================================
   Linkit Partner Portal
   -------------------------------------------------------------------
   URLs:
     /partnerportal-comfi/              → Overview
     /partnerportal-comfi/submitlead    → Submit a Lead
     /partnerportal-comfi/leads         → My Leads
     /partnerportal-comfi/commissions   → Commissions

   n8n reads the Referer header on submit (same webhook as FB ads page):
     • referer contains "fb-leads"         → Facebook lead
     • referer contains "partnerportal-"  → regex extracts partner (e.g. comfi → COMFI)
   =================================================================== */

const STATUSES = ["New", "In Review", "Approved", "Rejected", "Disbursed"];

const BADGE_CLASS = {
  "New": "badge-new",
  "In Review": "badge-review",
  "Approved": "badge-approved",
  "Rejected": "badge-rejected",
  "Disbursed": "badge-disbursed",
};

const TAB_TO_PATH = {
  overview: "",
  submit: "submitlead",
  leads: "leads",
  commissions: "commissions",
};

const PATH_TO_TAB = {
  "": "overview",
  overview: "overview",
  submitlead: "submit",
  leads: "leads",
  commissions: "commissions",
};

let config = null;
let leads = [];
let activeFilter = "all";
let searchQuery = "";
let isLoading = false;

/* ------------------------- helpers ------------------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fmtAED = (n) =>
  "AED " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const vatLabel = { yes: "Yes", no: "No", idk: "Unknown" };

function showToast(msg, type = "success") {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setLoading(on) {
  isLoading = on;
  $("#loadingOverlay")?.classList.toggle("active", on);
  updateFormState();
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------- config & partner URL ------------------------- */

const DEFAULT_WEBHOOK = "https://vineethapadma.app.n8n.cloud/webhook/loan-form";
const PARTNER_RE = /partnerportal-([A-Za-z0-9_-]+)/i;

function extractPartnerSlug() {
  const match = `${location.hostname}${location.pathname}`.match(PARTNER_RE);
  return match ? match[1].toUpperCase() : "";
}

function getPartnerBasePath() {
  const slug = config?.partner?.slug;
  return slug ? `/partnerportal-${slug.toLowerCase()}` : "";
}

function tabFromPath() {
  const parts = location.pathname.split("/").filter(Boolean);
  const last = (parts[parts.length - 1] || "").toLowerCase();
  if (PATH_TO_TAB[last] !== undefined) return PATH_TO_TAB[last];
  if (parts.some((p) => PARTNER_RE.test(p))) return "overview";
  return null;
}

async function loadConfig() {
  let fileConfig = {};
  try {
    const res = await fetch("config.json", { cache: "no-store" });
    if (res.ok) fileConfig = await res.json();
  } catch {
    /* config.json optional */
  }

  const params = new URLSearchParams(location.search);
  const slug = extractPartnerSlug() || (params.get("partner") || "").toUpperCase();

  config = {
    partner: {
      slug,
      portalPath: slug ? `partnerportal-${slug.toLowerCase()}` : "",
    },
    submitWebhookUrl: fileConfig.submitWebhookUrl || DEFAULT_WEBHOOK,
    leadsFeedUrl: fileConfig.leadsFeedUrl || "",
  };

  return config;
}

function canSubmit() {
  return Boolean(config?.partner?.slug && config?.submitWebhookUrl);
}

function hasLeadsFeed() {
  return Boolean(config?.leadsFeedUrl && config?.partner?.slug);
}

function updateSetupBanner() {
  const banner = $("#setupBanner");
  if (!banner) return;

  const notes = [];

  if (!config?.partner?.slug) {
    notes.push(
      "Open at <code>/partnerportal-YOURNAME/</code> (e.g. <code>/partnerportal-comfi/submitlead</code>). " +
      "n8n reads the Referer header to tag the partner in Zoho."
    );
  }
  if (!config?.submitWebhookUrl) {
    notes.push("Set <code>submitWebhookUrl</code> in <code>config.json</code>.");
  }
  if (!hasLeadsFeed()) {
    notes.push("Dashboard needs <code>leadsFeedUrl</code> in config (optional — submit still works).");
  }

  if (!notes.length) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  banner.innerHTML = notes.map((n) => `<p>${n}</p>`).join("");
}

function applyPartnerUI() {
  const { slug, portalPath } = config.partner;
  $("#partnerName").textContent = slug || "—";
  $("#partnerId").textContent = portalPath || "—";
  $("#partnerAvatar").textContent = slug ? slug.slice(0, 2) : "—";
  $("#overviewPartnerFirst").textContent = slug || "Partner";
}

/* ------------------------- lead normalization ------------------------- */

function mapVatToPortal(vat) {
  const v = String(vat).toLowerCase();
  if (v === "yes" || v.startsWith("y")) return "yes";
  if (v === "no" || v.startsWith("n")) return "no";
  return "idk";
}

function mapVatToWebhook(vat) {
  return { yes: "Yes", no: "No", idk: "Not Sure" }[vat] || "Not Sure";
}

function buildSubmitPayload() {
  return {
    full_name: $("#leadName").value.trim(),
    company_name: $("#companyName").value.trim(),
    mobile_whatsapp: $("#mobile").value.trim(),
    turnover_sales: $("#turnover").value.trim(),
    vat_registered: mapVatToWebhook(selectedVat),
    business_location: $("#business_location").value.trim(),
  };
}

function normalizeLead(raw) {
  const vat = raw.vat ?? raw.vatRegistered ?? raw.vat_registered ?? raw.VAT ?? "";
  const vatNorm = mapVatToPortal(vat);
  const paid = raw.paidOut ?? raw.commissionPaid ?? raw.paid ?? false;

  let status = raw.status ?? raw.leadStatus ?? raw.Lead_Status ?? "New";
  if (!STATUSES.includes(status)) status = "New";

  return {
    id: String(raw.id ?? raw.leadId ?? raw.recordId ?? ""),
    leadName: raw.leadName ?? raw.full_name ?? raw.name ?? raw.Full_Name ?? "",
    companyName: raw.companyName ?? raw.company_name ?? raw.company ?? raw.Company ?? "",
    mobile: raw.mobile ?? raw.mobile_whatsapp ?? raw.phone ?? raw.Mobile ?? "",
    vat: vatNorm,
    turnover: Number(raw.turnover ?? raw.turnover_sales ?? raw.annualTurnover ?? raw.Turnover ?? 0),
    status,
    commission: Number(raw.commission ?? raw.commissionAmount ?? 0),
    paidOut: paid === true || paid === "true" || paid === 1 || paid === "1",
    submittedAt: (raw.submittedAt ?? raw.createdAt ?? raw.Created_Time ?? "").slice(0, 10),
    disbursedAt: (raw.disbursedAt ?? raw.disbursedOn ?? "").slice(0, 10),
  };
}

/* ------------------------- data loading ------------------------- */

async function loadLeads() {
  if (!hasLeadsFeed()) {
    leads = [];
    return;
  }

  setLoading(true);
  try {
    const url = new URL(config.leadsFeedUrl);
    url.searchParams.set("partner", config.partner.slug);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Lead feed returned ${res.status}`);

    const data = await res.json();
    const rows = Array.isArray(data) ? data : data.leads ?? data.data ?? [];
    leads = rows.map(normalizeLead).filter((l) => l.leadName || l.companyName);
  } catch (err) {
    console.error("Lead feed failed:", err);
    leads = [];
    showToast("Could not load leads — check your connection", "error");
  } finally {
    setLoading(false);
  }
}

/* ------------------------- derived stats ------------------------- */

function computeStats() {
  const by = (s) => leads.filter((l) => l.status === s);
  const disbursed = by("Disbursed");
  const earned = disbursed.reduce((sum, l) => sum + (l.commission || 0), 0);
  const paid = disbursed.filter((l) => l.paidOut).reduce((s, l) => s + (l.commission || 0), 0);
  return {
    total: leads.length,
    approved: by("Approved").length,
    rejected: by("Rejected").length,
    disbursedCount: disbursed.length,
    inPipeline: by("New").length + by("In Review").length,
    earned,
    paid,
    due: earned - paid,
    disbursed,
  };
}

/* ------------------------- renderers ------------------------- */

function renderOverview() {
  const s = computeStats();

  $("#statTotal").textContent = s.total;
  $("#statTotalFoot").textContent = s.inPipeline
    ? `${s.inPipeline} currently in pipeline`
    : "no leads in pipeline";
  $("#statEarned").textContent = fmtAED(s.earned);
  $("#statApproved").textContent = s.approved;
  $("#statRejected").textContent = s.rejected;
  $("#statRejectedFoot").textContent = s.total
    ? `${Math.round((s.rejected / s.total) * 100)}% of all leads`
    : "no leads yet";
  $("#statDisbursed").textContent = s.disbursedCount;
  $("#statPaid").textContent = fmtAED(s.paid);
  $("#statBalanceFoot").textContent = `${fmtAED(s.due)} balance due`;
  $("#navLeadCount").textContent = s.total;

  const colors = {
    "New": "var(--teal)",
    "In Review": "#e0a83c",
    "Approved": "var(--green)",
    "Rejected": "var(--red)",
    "Disbursed": "var(--blue)",
  };
  const max = Math.max(1, ...STATUSES.map((st) => leads.filter((l) => l.status === st).length));

  $("#funnel").innerHTML = STATUSES.map((st) => {
    const count = leads.filter((l) => l.status === st).length;
    return `
      <div class="funnel-row">
        <span class="funnel-label">${st}</span>
        <div class="funnel-track"><div class="funnel-fill" style="width:${(count / max) * 100}%;background:${colors[st]}"></div></div>
        <span class="funnel-num">${count}</span>
      </div>`;
  }).join("");

  const recent = [...leads]
    .sort((a, b) => (b.disbursedAt || b.submittedAt || "").localeCompare(a.disbursedAt || a.submittedAt || ""))
    .slice(0, 6);

  $("#activityList").innerHTML = recent.length
    ? recent.map((l) => {
        const verb = {
          "New": "was submitted",
          "In Review": "is in eligibility review",
          "Approved": "was approved",
          "Rejected": "was rejected",
          "Disbursed": `was disbursed — ${fmtAED(l.commission)} commission`,
        }[l.status];
        return `
          <li>
            <span class="activity-dot" style="background:${colors[l.status]}"></span>
            <span class="activity-text"><strong>${esc(l.companyName)}</strong> ${verb}</span>
            <span class="activity-when">${fmtDate(l.disbursedAt || l.submittedAt)}</span>
          </li>`;
      }).join("")
    : `<li class="activity-empty">No activity yet — submit your first lead to get started.</li>`;
}

function renderLeadsTable() {
  const q = searchQuery.trim().toLowerCase();
  const rows = leads
    .filter((l) => activeFilter === "all" || l.status === activeFilter)
    .filter((l) =>
      !q ||
      l.leadName.toLowerCase().includes(q) ||
      l.companyName.toLowerCase().includes(q) ||
      l.mobile.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    )
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

  const emptyEl = $("#leadsEmpty");
  if (!leads.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = "No leads yet — use Submit a Lead to refer your first SME.";
  } else if (!rows.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = "No leads match this filter.";
  } else {
    emptyEl.hidden = true;
  }

  $("#leadsTbody").innerHTML = rows.map((l) => `
    <tr>
      <td class="lead-name">${esc(l.leadName)}</td>
      <td>${esc(l.companyName)}</td>
      <td class="cell-muted">${esc(l.mobile)}</td>
      <td class="cell-muted">${vatLabel[l.vat] || "—"}</td>
      <td>${l.turnover ? fmtAED(l.turnover) : "—"}</td>
      <td class="cell-muted">${fmtDate(l.submittedAt)}</td>
      <td><span class="badge ${BADGE_CLASS[l.status] || "badge-new"}">${esc(l.status)}</span></td>
      <td class="num">${l.status === "Disbursed" && l.commission ? fmtAED(l.commission) : "—"}</td>
    </tr>`).join("");
}

function renderCommissions() {
  const s = computeStats();

  $("#commTotal").textContent = fmtAED(s.earned);
  $("#commPaid").textContent = fmtAED(s.paid);
  $("#commDue").textContent = fmtAED(s.due);
  $("#commBarFill").style.width = s.earned ? `${(s.paid / s.earned) * 100}%` : "0%";

  const next = new Date();
  next.setMonth(next.getMonth() + 1, 1);
  $("#commNextDate").textContent = next.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  $("#commAvg").textContent = s.disbursedCount
    ? fmtAED(s.earned / s.disbursedCount)
    : "AED 0";
  $("#commAvgFoot").textContent = `across ${s.disbursedCount} disbursal${s.disbursedCount === 1 ? "" : "s"}`;

  const rows = [...s.disbursed].sort((a, b) =>
    (b.disbursedAt || "").localeCompare(a.disbursedAt || "")
  );

  const commEmpty = $("#commEmpty");
  commEmpty.hidden = rows.length > 0;
  commEmpty.textContent = rows.length
    ? ""
    : "No disbursed leads yet — commissions appear here once a facility is live.";

  $("#commTbody").innerHTML = rows.map((l) => `
    <tr>
      <td class="lead-name">${esc(l.leadName)}</td>
      <td>${esc(l.companyName)}</td>
      <td class="cell-muted">${fmtDate(l.disbursedAt)}</td>
      <td class="num">${fmtAED(l.commission)}</td>
      <td><span class="badge ${l.paidOut ? "badge-paid" : "badge-unpaid"}">${l.paidOut ? "Paid" : "Due"}</span></td>
    </tr>`).join("");
}

function renderAll() {
  renderOverview();
  renderLeadsTable();
  renderCommissions();
  updateSetupBanner();
  updateFormState();
}

function updateFormState() {
  const btn = $("#submitBtn");
  const note = $("#submitHint");
  if (!btn) return;

  btn.disabled = isLoading;

  if (note) {
    if (!config?.partner?.slug) {
      note.textContent = "Use a partner URL like /partnerportal-comfi/submitlead — n8n reads that to tag your partner in Zoho.";
      note.classList.add("hint-warn");
    } else if (!config?.submitWebhookUrl) {
      note.textContent = "Add submitWebhookUrl to config.json.";
      note.classList.add("hint-warn");
    } else {
      note.textContent = "Your lead is routed to the Linkit team instantly via the partner pipeline.";
      note.classList.remove("hint-warn");
    }
  }
}

/* ------------------------- tabs & routing ------------------------- */

function switchTab(tab, { replace = false } = {}) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));

  const base = getPartnerBasePath();
  if (base) {
    const segment = TAB_TO_PATH[tab];
    const path = segment ? `${base}/${segment}` : `${base}/`;
    if (replace) history.replaceState({ tab }, "", path);
    else history.pushState({ tab }, "", path);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".nav-item").forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab))
);

$$("[data-goto]").forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.goto))
);

window.addEventListener("popstate", () => {
  const tab = tabFromPath();
  if (tab) switchTab(tab, { replace: true });
});

/* ------------------------- filters / search / refresh ------------------------- */

$("#filterChips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  activeFilter = chip.dataset.filter;
  $$("#filterChips .chip").forEach((c) => c.classList.toggle("active", c === chip));
  renderLeadsTable();
});

$("#leadSearch").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderLeadsTable();
});

$("#refreshBtn")?.addEventListener("click", async () => {
  await loadLeads();
  renderAll();
  showToast("Leads refreshed");
});

/* ------------------------- lead form ------------------------- */

let selectedVat = null;

$("#mobile").addEventListener("input", (e) => {
  const digits = e.target.value.replace(/\D/g, "");
  if (e.target.value !== digits) e.target.value = digits;
});

$("#vatSegment").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  selectedVat = btn.dataset.vat;
  $$("#vatSegment button").forEach((b) => b.classList.toggle("selected", b === btn));
  $("#vatSegment").classList.remove("invalid");
});

$("#leadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!canSubmit()) {
    showToast("Open /partnerportal-YOURNAME/submitlead to submit", "error");
    return;
  }

  const form = e.target;
  let valid = true;

  ["leadName", "companyName", "mobile", "turnover", "business_location"].forEach((id) => {
    const input = $("#" + id);
    const bad = !input.value.trim();
    input.classList.toggle("invalid", bad);
    if (bad) valid = false;
  });

  const mobileVal = $("#mobile").value.trim();
  if (mobileVal && !/^\d+$/.test(mobileVal)) {
    $("#mobile").classList.add("invalid");
    valid = false;
  }

  if (!selectedVat) {
    $("#vatSegment").classList.add("invalid");
    valid = false;
  }

  if (!valid) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  const payload = buildSubmitPayload();
  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";
  setLoading(true);

  try {
    const res = await fetch(config.submitWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

    form.reset();
    selectedVat = null;
    $$("#vatSegment button").forEach((b) => b.classList.remove("selected"));

    if (hasLeadsFeed()) await loadLeads();
    renderAll();
    showToast("Lead submitted — the Linkit team will review it shortly");
    switchTab(hasLeadsFeed() ? "leads" : "submit");
  } catch (err) {
    console.error(err);
    showToast("Submission failed — please try again", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Lead\u00A0→";
    setLoading(false);
    updateFormState();
  }
});

/* ------------------------- init ------------------------- */

(async function init() {
  setLoading(true);
  await loadConfig();
  applyPartnerUI();
  updateSetupBanner();
  updateFormState();

  if (hasLeadsFeed()) await loadLeads();

  setLoading(false);
  renderAll();

  const tab = tabFromPath() || "overview";
  switchTab(tab, { replace: true });
})();
