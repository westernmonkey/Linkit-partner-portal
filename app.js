/* ===================================================================
   Linkit Partner Portal
   -------------------------------------------------------------------
   CONFIG: wire this portal into your existing n8n -> Zoho CRM flow.

   - submitWebhookUrl: your existing n8n webhook that receives lead
     form submissions and pushes them into Zoho CRM. Leave "" to demo.

   - leadsFeedUrl: a second (new) n8n webhook that, given a partnerId,
     returns this partner's leads + statuses from Zoho CRM as JSON:
       [{ id, leadName, companyName, mobile, vat, turnover,
          status, commission, paidOut, submittedAt, disbursedAt }]
     Leave "" to use the bundled demo data.
     (See README.md for the full status-update workflow.)
   =================================================================== */

const CONFIG = {
  partner: { id: "PTR-0042", name: "Apex Advisory" },
  submitWebhookUrl: "",
  leadsFeedUrl: "",
};

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

function switchTab(tab) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
  history.replaceState(null, "", `#${tab}`);
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

$("#leadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.target;
  let valid = true;

  ["leadName", "companyName", "mobile", "turnover"].forEach((id) => {
    const input = $("#" + id);
    const bad = !input.value.trim();
    input.classList.toggle("invalid", bad);
    if (bad) valid = false;
  });

  if (!selectedVat) {
    $("#vatSegment").classList.add("invalid");
    valid = false;
  }

  if (!valid) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  const payload = {
    partnerId: CONFIG.partner.id,
    partnerName: CONFIG.partner.name,
    leadName: $("#leadName").value.trim(),
    companyName: $("#companyName").value.trim(),
    mobile: $("#mobile").value.trim(),
    vatRegistered: selectedVat,
    turnover: Number($("#turnover").value),
    submittedAt: new Date().toISOString(),
  };

  const btn = $("#submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    if (CONFIG.submitWebhookUrl) {
      const res = await fetch(CONFIG.submitWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
    }

    // reflect the new lead in the portal immediately
    leads.unshift({
      id: "L-" + Date.now().toString().slice(-6),
      leadName: payload.leadName,
      companyName: payload.companyName,
      mobile: payload.mobile,
      vat: payload.vatRegistered,
      turnover: payload.turnover,
      status: "New",
      commission: 0,
      paidOut: false,
      submittedAt: payload.submittedAt.slice(0, 10),
    });

    renderAll();
    form.reset();
    selectedVat = null;
    $$("#vatSegment button").forEach((b) => b.classList.remove("selected"));
    showToast(
      CONFIG.submitWebhookUrl
        ? "Lead submitted to Linkit — you'll see status updates here"
        : "Lead added (demo mode — set submitWebhookUrl to go live)"
    );
    switchTab("leads");
  } catch (err) {
    console.error(err);
    showToast("Submission failed — please try again", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Lead\u00A0→";
  }
});

/* ------------------------- init ------------------------- */

(async function init() {
  const { name, id } = CONFIG.partner;
  $("#partnerName").textContent = name;
  $("#partnerId").textContent = id;
  $("#partnerAvatar").textContent = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  $("#overviewPartnerFirst").textContent = name.split(" ")[0];

  await loadLeads();
  renderAll();

  const hash = location.hash.slice(1);
  if (["overview", "submit", "leads", "commissions"].includes(hash)) switchTab(hash);
})();
