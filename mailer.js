// SMTP mailer (Nodemailer). Credentials sirf environment variables se aate hain.
const nodemailer = require("nodemailer");

const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
  MAIL_FROM, COMPANY_EMAIL, COMPANY_PHONE, BREVO_API_KEY
} = process.env;

const port = Number(SMTP_PORT || 587);
// Port 465 = implicit TLS (secure:true). Port 587/25 = STARTTLS (secure:false).
const secure = SMTP_SECURE !== undefined && SMTP_SECURE !== "" ? String(SMTP_SECURE) === "true" : port === 465;

const transporter = SMTP_HOST ? nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000
}) : null;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

// "Name <email@x.com>" ya plain "email@x.com" ko parse karta hai.
function parseFrom(v) {
  const m = String(v || "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: String(v || "").trim() };
}
function toText(html) {
  return String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h\d|div)>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}
function fromAddress() {
  const from = MAIL_FROM || COMPANY_EMAIL || SMTP_USER;
  if (!from) throw new Error("MAIL_FROM is not set");
  return from;
}

// Mode: BREVO_API_KEY ho to HTTPS API (free Render par chalta hai), warna SMTP.
const MODE = BREVO_API_KEY ? "brevo-api" : (transporter ? "smtp" : "none");

// Startup par ek baar check karta hai (server ko crash nahi karta).
async function verifyMailer() {
  if (MODE === "none") { console.warn("[mail] Not configured (set BREVO_API_KEY or SMTP_HOST). Emails will be skipped."); return false; }
  try {
    if (MODE === "brevo-api") {
      const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": BREVO_API_KEY, accept: "application/json" } });
      if (!r.ok) throw new Error(`Brevo API ${r.status}: ${(await r.text()).slice(0, 200)}`);
      console.log("[mail] Brevo API ready");
    } else {
      await transporter.verify();
      console.log(`[mail] SMTP ready (${SMTP_HOST}:${port}, secure=${secure})`);
    }
    return true;
  } catch (e) {
    console.error("[mail] verify failed:", e.message);
    return false;
  }
}

async function sendMail(to, subject, html, attachments = []) {
  if (MODE === "none") { console.warn("[mail] not configured; email skipped:", subject); return false; }
  const from = fromAddress();
  const text = toText(html);
  if (MODE === "brevo-api") {
    const body = { sender: parseFrom(from), to: [{ email: to }], subject, htmlContent: html, textContent: text };
    if (attachments.length) body.attachment = attachments.map(a => ({
      name: a.filename, content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : Buffer.from(String(a.content)).toString("base64")
    }));
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`Brevo API ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json().catch(() => ({}));
    console.log(`[mail] sent "${subject}" -> ${to} (${d.messageId || "ok"})`);
    return true;
  }
  const info = await transporter.sendMail({ from, to, subject, html, text, attachments });
  console.log(`[mail] sent "${subject}" -> ${to} (${info.messageId})`);
  return true;
}

// Fire-and-forget: response slow na ho, error sirf log ho.
function sendMailSafe(to, subject, html, attachments = []) {
  sendMail(to, subject, html, attachments).catch(e => console.error(`[mail] failed "${subject}" -> ${to}:`, e.message));
}

function layout(title, body) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e3e8ef;border-radius:8px;overflow:hidden">
<div style="background:#123c70;color:#fff;padding:16px 22px"><b style="font-size:18px">ICONIC SHIPPING SERVICES</b><br><small>Marine Supplies • Ship Chandling • Technical Services</small></div>
<div style="padding:22px;color:#222;line-height:1.55"><h2 style="margin-top:0;color:#123c70">${escapeHtml(title)}</h2>${body}</div>
<div style="background:#f5f7fa;padding:12px 22px;font-size:12px;color:#666">${escapeHtml(COMPANY_PHONE || "+91 97124 76193")} | ${escapeHtml(COMPANY_EMAIL || "supply@iconicshipping.org")}</div></div>`;
}

const templates = {
  welcome: (u) => layout("Welcome aboard", `<p>Dear ${escapeHtml(u.name)},</p><p>Your customer account has been created. You can now log in to submit vessel enquiries and download quotations.</p>`),
  enquiryReceived: (e) => layout("We received your enquiry", `<p>Dear ${escapeHtml(e.name)},</p><p>Thank you for your enquiry. Your reference number is <b>${escapeHtml(e.reference)}</b>.</p><p><b>Service:</b> ${escapeHtml(e.service)}<br><b>Vessel:</b> ${escapeHtml(e.vessel || "-")}<br><b>Port:</b> ${escapeHtml(e.port || "-")}</p><p>Our team will get back to you shortly with a quotation.</p>`),
  passwordReset: (u, link) => layout("Reset your password", `<p>Dear ${escapeHtml(u.name)},</p><p>We received a request to reset your password. Click the button below to choose a new one. This link is valid for <b>1 hour</b> and can be used once.</p><p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#e46d2d;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Reset password</a></p><p style="font-size:12px;color:#666">If the button does not work, copy this link into your browser:<br>${escapeHtml(link)}</p><p>If you did not request this, you can ignore this email. Your password will not change.</p>`),
  passwordChanged: (u) => layout("Your password was changed", `<p>Dear ${escapeHtml(u.name)},</p><p>Your password was just changed. If this was not you, please contact us immediately.</p>`),
  statusUpdate: (e, status) => layout("Enquiry status updated", `<p>Dear ${escapeHtml(e.name)},</p><p>The status of your enquiry <b>${escapeHtml(e.reference)}</b> is now <b>${escapeHtml(status)}</b>.</p><p>You can log in to the customer portal to see details.</p>`)
};

module.exports = { transporter, verifyMailer, sendMail, sendMailSafe, templates };
