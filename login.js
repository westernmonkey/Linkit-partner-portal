const $ = (sel) => document.querySelector(sel);

$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const input = $("#partnerSlug");
  const slug = normalizePartnerSlug(input.value);
  const partner = getPartnerConfig(slug);
  const errorEl = $("#loginError");

  input.classList.toggle("invalid", !slug);

  if (!partner) {
    errorEl.hidden = false;
    input.classList.add("invalid");
    return;
  }

  errorEl.hidden = true;
  input.classList.remove("invalid");
  sessionStorage.setItem("linkitPartner", slug);
  location.href = `/partnerportal-${slug}/overview`;
});
