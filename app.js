/* ===================================================================
   Linkit Partner Portal
   -------------------------------------------------------------------
   Partner identity comes from the URL path (/partnerportal-{slug}/…).
   See partners.js for the allowlist and README.md for n8n wiring.
   =================================================================== */

const CONFIG = {
  partner: null,
  submitWebhookUrl: "", // set locally — do not commit production webhook URLs
  leadsFeedUrl: "",
};

const PATH_TO_TAB = {
  overview: "overview",
  submitlead: "submit",
  leads: "leads",
  commissions: "commissions",
};

const TAB_TO_PATH = {
  overview: "overview",
  submit: "submitlead",
  leads: "leads",
  commissions: "commissions",
};

let partnerSlug = "";

const STATUSES = ["New", "In Review", "Approved", "Rejected", "Disbursed"];

const BADGE_CLASS = {
  "New": "badge-new",
  "In Review": "badge-review",
  "Approved": "badge-approved",
  "Rejected": "badge-rejected",
  "Disbursed": "badge-disbursed",
};

/* ------------------------- demo data ------------------------- */

const DEMO_LEADS = [
  { id: "L-1001", leadName: "Nasser Rahman",   companyName: "Gulf Horizon Trading",  mobile: "+971 50 214 7789", vat: "yes", turnover: 8500000,  status: "Disbursed", commission: 12750, paidOut: true,  submittedAt: "2026-02-03", disbursedAt: "2026-03-11" },
  { id: "L-1002", leadName: "Ulviyya Aliyeva", companyName: "Caspian Foods FZE",     mobile: "+971 55 880 1123", vat: "yes", turnover: 4200000,  status: "Disbursed", commission: 6300,  paidOut: true,  submittedAt: "2026-02-17", disbursedAt: "2026-03-28" },
  { id: "L-1003", leadName: "Vikram Shetty",   companyName: "Meridian Imports LLC",  mobile: "+971 52 446 9034", vat: "no",  turnover: 2100000,  status: "Disbursed", commission: 3150,  paidOut: false, submittedAt: "2026-03-05", disbursedAt: "2026-04-19" },
  { id: "L-1004", leadName: "Fatima Al Suwaidi", companyName: "Pearl Route Logistics", mobile: "+971 50 992 3471", vat: "yes", turnover: 12500000, status: "Disbursed", commission: 18750, paidOut: false, submittedAt: "2026-03-22", disbursedAt: "2026-05-08" },
  { id: "L-1005", leadName: "Daniel Okafor",   companyName: "Sahara Tech Supplies",  mobile: "+971 54 671 2280", vat: "idk", turnover: 1800000,  status: "Approved",  commission: 0, paidOut: false, submittedAt: "2026-04-02" },
  { id: "L-1006", leadName: "Priya Menon",     companyName: "Coral Coast Textiles",  mobile: "+971 56 309 8852", vat: "yes", turnover: 6700000,  status: "Approved",  commission: 0, paidOut: false, submittedAt: "2026-04-15" },
  { id: "L-1007", leadName: "Hassan Karim",    companyName: "Atlas Build Materials", mobile: "+971 50 118 6645", vat: "no",  turnover: 950000,   status: "Rejected",  commission: 0, paidOut: false, submittedAt: "2026-04-21" },
  { id: "L-1008", leadName: "Elena Petrova",   companyName: "NordStar Electronics",  mobile: "+971 58 774 0913", vat: "yes", turnover: 3400000,  status: "In Review", commission: 0, paidOut: false, submittedAt: "2026-05-12" },
  { id: "L-1009", leadName: "Omar Bashir",     companyName: "Dune Valley Foods",     mobile: "+971 55 240 7768", vat: "idk", turnover: 2750000,  status: "In Review", commission: 0, paidOut: false, submittedAt: "2026-05-26" },
  { id: "L-1010", leadName: "Sara Iqbal",      companyName: "Lattice Packaging Co",  mobile: "+971 52 893 5510", vat: "no",  turnover: 1250000,  status: "Rejected",  commission: 0, paidOut: false, submittedAt: "2026-05-30" },
  { id: "L-1011", leadName: "Tom Vandenberg",  companyName: "Beacon Marine Parts",   mobile: "+971 50 667 3399", vat: "yes", turnover: 5600000,  status: "New",       commission: 0, paidOut: false, submittedAt: "2026-06-08" },
  { id: "L-1012", leadName: "Aisha Diallo",    companyName: "Savanna Agro Exports",  mobile: "+971 54 035 1187", vat: "idk", turnover: 4100000,  status: "New",       commission: 0, paidOut: false, submittedAt: "2026-06-10" },
];

let leads = [];
let activeFilter = "all";
let searchQuery = "";

/* ------------------------- helpers ------------------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fmtAED = (n) =>
  "AED " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
};

const vatLabel = { yes: "Yes", no: "No", idk: "Unknown" };

const VAT_TO_LOCAL = { Yes: "yes", No: "no", "I don't know": "idk" };

function parsePartnerFromPath() {
  const m = location.pathname.match(/\/partnerportal-([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/?$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const partner = getPartnerConfig(slug);
  if (!partner) return null;
  const tabPath = (m[2] || "overview").toLowerCase();
  return { slug, partner, tabPath };
}

function partnerPortalPath(slug, tabPath) {
  return `/partnerportal-${slug}/${tabPath}`;
}

function showToast(msg, type = "success") {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 3200);
}

/* ------------------------- data loading ------------------------- */

async function loadLeads() {
  if (CONFIG.leadsFeedUrl) {
    try {
      const res = await fetch(
        `${CONFIG.leadsFeedUrl}?partnerId=${encodeURIComponent(CONFIG.partner.id)}`
      );
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      leads = await res.json();
      return;
    } catch (err) {
      console.error("Lead feed failed, falling back to demo data:", err);
      showToast("Couldn't reach the lead feed — showing demo data", "error");
    }
  }
  leads = [...DEMO_LEADS];
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
  $("#statTotalFoot").textContent = `${s.inPipeline} currently in pipeline`;
  $("#statEarned").textContent = fmtAED(s.earned);
  $("#statApproved").textContent = s.approved;
  $("#statRejected").textContent = s.rejected;
  $("#statRejectedFoot").textContent = s.total
    ? `${Math.round((s.rejected / s.total) * 100)}% of all leads`
    : "of all leads";
  $("#statDisbursed").textContent = s.disbursedCount;
  $("#statPaid").textContent = fmtAED(s.paid);
  $("#statBalanceFoot").textContent = `${fmtAED(s.due)} balance due`;
  $("#navLeadCount").textContent = s.total;

  // funnel
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

  // recent activity (latest 6 by submitted/disbursed date)
  const recent = [...leads]
    .sort((a, b) => (b.disbursedAt || b.submittedAt).localeCompare(a.disbursedAt || a.submittedAt))
    .slice(0, 6);

  $("#activityList").innerHTML = recent.map((l) => {
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
        <span class="activity-text"><strong>${l.companyName}</strong> ${verb}</span>
        <span class="activity-when">${fmtDate(l.disbursedAt || l.submittedAt)}</span>
      </li>`;
  }).join("");
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
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  $("#leadsEmpty").hidden = rows.length > 0;

  $("#leadsTbody").innerHTML = rows.map((l) => `
    <tr>
      <td class="lead-name">${l.leadName}</td>
      <td>${l.companyName}</td>
      <td class="cell-muted">${l.mobile}</td>
      <td class="cell-muted">${vatLabel[l.vat] || "—"}</td>
      <td>${fmtAED(l.turnover)}</td>
      <td class="cell-muted">${fmtDate(l.submittedAt)}</td>
      <td><span class="badge ${BADGE_CLASS[l.status]}">${l.status}</span></td>
      <td class="num">${l.status === "Disbursed" ? fmtAED(l.commission) : "—"}</td>
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
  $("#commEmpty").hidden = rows.length > 0;
  $("#commTbody").innerHTML = rows.map((l) => `
    <tr>
      <td class="lead-name">${l.leadName}</td>
      <td>${l.companyName}</td>
      <td class="cell-muted">${fmtDate(l.disbursedAt)}</td>
      <td class="num">${fmtAED(l.commission)}</td>
      <td><span class="badge ${l.paidOut ? "badge-paid" : "badge-unpaid"}">${l.paidOut ? "Paid" : "Due"}</span></td>
    </tr>`).join("");
}

function renderAll() {
  renderOverview();
  renderLeadsTable();
  renderCommissions();
}

/* ------------------------- tabs ------------------------- */

function switchTab(tab, { replace = false } = {}) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
  const tabPath = TAB_TO_PATH[tab] || "overview";
  const url = partnerPortalPath(partnerSlug, tabPath);
  if (replace) history.replaceState({ tab }, "", url);
  else history.pushState({ tab }, "", url);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".nav-item").forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab))
);

$$("[data-goto]").forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.goto))
);

/* ------------------------- filters / search ------------------------- */

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

/* ------------------------- lead form ------------------------- */

let selectedVat = null;

$("#vatSegment").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  selectedVat = btn.dataset.vat;
  $$("#vatSegment button").forEach((b) => b.classList.toggle("selected", b === btn));
  $("#vatSegment").classList.remove("invalid");
});

function buildMobileWhatsapp() {
  const code = $("#mobile_country_code").value;
  const digits = $("#mobile_number").value.replace(/\D/g, "");
  const formatted = formatPhoneDisplay(digits);
  return `${code} ${formatted}`.trim();
}

function formatPhoneDisplay(digits) {
  if (!digits) return "";
  const firstLen = digits.length > 10 ? 3 : 2;
  let out = digits.slice(0, firstLen);
  for (let i = firstLen; i < digits.length; i += 3) {
    out += ` ${digits.slice(i, i + 3)}`;
  }
  return out;
}

function digitsOnly(value, maxLen) {
  return value.replace(/\D/g, "").slice(0, maxLen);
}

function validateMobile() {
  const digits = $("#mobile_number").value.replace(/\D/g, "");
  const valid = digits.length >= 8 && digits.length <= 15;
  $("#mobileField").classList.toggle("invalid", !valid);
  $("#mobile_number").classList.toggle("invalid", !valid);
  return valid;
}

$("#mobile_number").addEventListener("input", (e) => {
  const formatted = formatPhoneDisplay(digitsOnly(e.target.value, 15));
  e.target.value = formatted;
  $("#mobileField").classList.remove("invalid");
  $("#mobile_number").classList.remove("invalid");
});

$("#mobile_number").addEventListener("paste", (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text");
  $("#mobile_number").value = formatPhoneDisplay(digitsOnly(text, 15));
});

$("#mobile_number").addEventListener("keydown", (e) => {
  const allowed = ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"];
  if (allowed.includes(e.key) || (e.ctrlKey || e.metaKey)) return;
  if (!/^\d$/.test(e.key)) e.preventDefault();
});

$("#turnover_sales").addEventListener("input", (e) => {
  e.target.value = digitsOnly(e.target.value, 15);
  e.target.classList.remove("invalid");
});

$("#turnover_sales").addEventListener("paste", (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text");
  e.target.value = digitsOnly(text, 15);
});

$("#turnover_sales").addEventListener("keydown", (e) => {
  const allowed = ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"];
  if (allowed.includes(e.key) || (e.ctrlKey || e.metaKey)) return;
  if (!/^\d$/.test(e.key)) e.preventDefault();
});

$("#leadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.target;
  let valid = true;

  ["full_name", "company_name", "business_location", "turnover_sales"].forEach((id) => {
    const input = $("#" + id);
    const bad = !input.value.trim();
    input.classList.toggle("invalid", bad);
    if (bad) valid = false;
  });

  if (!validateMobile()) valid = false;

  if (!selectedVat) {
    $("#vatSegment").classList.add("invalid");
    valid = false;
  }

  if (!valid) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  // Ensure Referer contains partnerportal-{slug}/submitlead for n8n routing
  history.replaceState({ tab: "submit" }, "", partnerPortalPath(partnerSlug, "submitlead"));

  const mobileWhatsapp = buildMobileWhatsapp();

  // Same JSON shape as the Facebook / SMEBoost loan form → n8n webhook
  const payload = {
    full_name: $("#full_name").value.trim(),
    company_name: $("#company_name").value.trim(),
    mobile_whatsapp: mobileWhatsapp,
    funding_needed: "",
    turnover_sales: $("#turnover_sales").value.trim(),
    vat_registered: selectedVat,
    business_location: $("#business_location").value.trim(),
  };

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    const res = await fetch(CONFIG.submitWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      referrerPolicy: "unsafe-url",
    });
    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

    // reflect the new lead in the portal immediately
    leads.unshift({
      id: "L-" + Date.now().toString().slice(-6),
      leadName: payload.full_name,
      companyName: payload.company_name,
      mobile: payload.mobile_whatsapp,
      vat: VAT_TO_LOCAL[payload.vat_registered] || "idk",
      turnover: Number(payload.turnover_sales),
      status: "New",
      commission: 0,
      paidOut: false,
      submittedAt: new Date().toISOString().slice(0, 10),
    });

    renderAll();
    form.reset();
    selectedVat = null;
    $$("#vatSegment button").forEach((b) => b.classList.remove("selected"));
    showToast("Lead submitted to Linkit — you'll see status updates here");
    switchTab("leads");
  } catch (err) {
    console.error(err);
    showToast("Submission failed — please try again", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Lead\u00A0→";
  }
});

window.addEventListener("popstate", () => {
  const parsed = parsePartnerFromPath();
  if (!parsed) {
    location.href = "/login.html";
    return;
  }
  const tab = PATH_TO_TAB[parsed.tabPath] || "overview";
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
});

/* ------------------------- init ------------------------- */

(async function init() {
  const parsed = parsePartnerFromPath();
  if (!parsed) {
    location.replace("/login.html");
    return;
  }

  const { slug, partner, tabPath } = parsed;
  partnerSlug = slug;
  CONFIG.partner = { slug, name: partner.name, id: partner.zohoId };
  sessionStorage.setItem("linkitPartner", slug);

  const { name, id } = CONFIG.partner;
  $("#partnerName").textContent = name;
  $("#partnerId").textContent = id;
  $("#partnerAvatar").textContent = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  $("#overviewPartnerFirst").textContent = name.split(" ")[0];

  await loadLeads();
  renderAll();

  const tab = PATH_TO_TAB[tabPath] || "overview";
  switchTab(tab, { replace: true });
})();
