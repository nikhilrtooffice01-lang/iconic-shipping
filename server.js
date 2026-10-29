require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { verifyMailer, sendMail, sendMailSafe, templates } = require("./mailer");
const PDFDocument = require("pdfkit");
const { Pool } = require("pg");

const app = express();
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const CORS_ORIGIN = process.env.CORS_ORIGIN || ""; // set only if frontend is on a different domain
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.set("trust proxy", 1);
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false, limit: "200kb" }));
app.use(cookieParser());
if (CORS_ORIGIN) {
  const allowed = CORS_ORIGIN.split(",").map(x => x.trim());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}
app.use(express.static(FRONTEND_DIR, { maxAge: "1h", setHeaders: (res, p) => { if (/\.(html|js|css)$/.test(p)) res.setHeader("Cache-Control", "no-cache"); } }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: "draft-8", legacyHeaders: false });
const enquiryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false });

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
}
function authCookieOptions() {
  return {
    httpOnly: true,
    secure: !!CORS_ORIGIN || (process.env.NODE_ENV === "production" && String(process.env.COOKIE_SECURE) !== "false"),
    sameSite: CORS_ORIGIN ? "none" : "lax",
    path: "/"
  };
}
function setAuthCookie(res, token) {
  res.cookie("iconic_auth", token, { ...authCookieOptions(), maxAge: 2 * 60 * 60 * 1000 });
}
function getToken(req) { return req.cookies.iconic_auth; }
function auth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ ok:false, message:"Authentication required." });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ ok:false, message:"Session expired. Please log in again." }); }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ ok:false, message:"Admin access required." });
  next();
}
function clean(v, max=1000) { return String(v ?? "").trim().slice(0,max); }
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function reference() { return "ISS-" + new Date().getFullYear() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase(); }
function quoteNumber() { return "ISS-Q-" + new Date().getFullYear() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase(); }
async function log(userId, action, entity, entityId, meta={}) {
  await pool.query("INSERT INTO audit_logs(user_id,action,entity,entity_id,meta) VALUES($1,$2,$3,$4,$5)", [userId, action, entity, entityId || null, JSON.stringify(meta)]);
}

app.get("/api/health", async (req,res) => {
  try { await pool.query("SELECT 1"); res.json({ok:true, database:"connected"}); }
  catch { res.status(503).json({ok:false}); }
});

// Auth
app.post("/api/auth/register", authLimiter, async (req,res) => {
  try {
    const name=clean(req.body.name,120), email=clean(req.body.email,190).toLowerCase(), phone=clean(req.body.phone,40);
    const company=clean(req.body.company,190), password=String(req.body.password||"");
    if (!name || !validEmail(email) || password.length < 10) return res.status(400).json({ok:false,message:"Name, valid email and password (10+ characters) are required."});
    const exists=await pool.query("SELECT id FROM users WHERE email=$1",[email]);
    if(exists.rowCount) return res.status(409).json({ok:false,message:"An account with this email already exists."});
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query("INSERT INTO users(name,email,phone,company,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,phone,company,role", [name,email,phone,company,hash]);
    setAuthCookie(res,issueToken(r.rows[0]));
    await log(r.rows[0].id,"register","user",r.rows[0].id);
    sendMailSafe(email,"Welcome to ICONIC SHIPPING SERVICES",templates.welcome(r.rows[0]));
    res.json({ok:true,user:r.rows[0]});
  } catch(e){ console.error(e); res.status(500).json({ok:false,message:"Registration failed."}); }
});

app.post("/api/auth/login", authLimiter, async (req,res) => {
  try {
    const email=clean(req.body.email,190).toLowerCase(), password=String(req.body.password||"");
    const r=await pool.query("SELECT * FROM users WHERE email=$1",[email]);
    if(!r.rowCount || !(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({ok:false,message:"Invalid email or password."});
    const u=r.rows[0]; setAuthCookie(res,issueToken(u)); await log(u.id,"login","user",u.id);
    res.json({ok:true,user:{id:u.id,name:u.name,email:u.email,phone:u.phone,company:u.company,role:u.role}});
  } catch(e){ console.error(e); res.status(500).json({ok:false,message:"Login failed."}); }
});

app.post("/api/auth/logout", (req,res) => { res.clearCookie("iconic_auth", authCookieOptions()); res.json({ok:true}); });
app.get("/api/auth/me", auth, async (req,res) => {
  const r=await pool.query("SELECT id,name,email,phone,company,role,created_at FROM users WHERE id=$1",[req.user.sub]);
  if(!r.rowCount) return res.status(401).json({ok:false});
  res.json({ok:true,user:r.rows[0]});
});

// Password reset
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });
const sha256 = v => crypto.createHash("sha256").update(v).digest("hex");

app.post("/api/auth/forgot", resetLimiter, async (req,res)=>{
  // Hamesha same response: attacker ko pata na chale ki email registered hai ya nahi.
  const generic={ok:true,message:"If an account exists for this email, a reset link has been sent."};
  try {
    const email=clean(req.body.email,190).toLowerCase();
    if(!validEmail(email)) return res.json(generic);
    const u=await pool.query("SELECT id,name,email FROM users WHERE email=$1",[email]);
    if(u.rowCount){
      const user=u.rows[0];
      const token=crypto.randomBytes(32).toString("hex");
      await pool.query("UPDATE password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",[user.id]);
      await pool.query("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[user.id,sha256(token)]);
      const base=(process.env.APP_URL||`${req.protocol}://${req.get("host")}`).replace(/\/+$/,"");
      sendMailSafe(user.email,"Reset your password — ICONIC SHIPPING SERVICES",templates.passwordReset(user,`${base}/login.html?reset=${token}`));
      await log(user.id,"password_reset_requested","user",user.id);
    }
  } catch(e){ console.error(e); }
  res.json(generic);
});

app.post("/api/auth/reset", authLimiter, async (req,res)=>{
  try {
    const token=String(req.body.token||""), password=String(req.body.password||"");
    if(!/^[0-9a-f]{64}$/.test(token)) return res.status(400).json({ok:false,message:"Reset link is invalid or has expired."});
    if(password.length<10) return res.status(400).json({ok:false,message:"Password must be at least 10 characters."});
    // Token ek hi baar use ho sake, isliye atomic claim.
    const c=await pool.query("UPDATE password_resets SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() RETURNING user_id",[sha256(token)]);
    if(!c.rowCount) return res.status(400).json({ok:false,message:"Reset link is invalid or has expired."});
    const userId=c.rows[0].user_id;
    const hash=await bcrypt.hash(password,12);
    const u=await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id,name,email",[hash,userId]);
    await pool.query("UPDATE password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",[userId]);
    await log(userId,"password_reset","user",userId);
    sendMailSafe(u.rows[0].email,"Your password was changed",templates.passwordChanged(u.rows[0]));
    res.json({ok:true,message:"Password updated. Please log in."});
  } catch(e){ console.error(e); res.status(500).json({ok:false,message:"Could not reset password."}); }
});

// Services
app.get("/api/services", async (req,res)=>{
  const r=await pool.query("SELECT id,name,short_description,details FROM services WHERE active=true ORDER BY sort_order,id");
  res.json({ok:true,services:r.rows});
});

// Enquiries
app.post("/api/enquiries", enquiryLimiter, async (req,res)=>{
  try {
    const name=clean(req.body.name,120), email=clean(req.body.email,190).toLowerCase(), service=clean(req.body.service,190), message=clean(req.body.message,5000);
    if(!name || !validEmail(email) || !service || !message) return res.status(400).json({ok:false,message:"Name, valid email, service and requirement are required."});
    let userId=req.user?.sub || null;
    if(!userId && getToken(req)){ try { userId=jwt.verify(getToken(req),JWT_SECRET).sub; } catch {} }
    const data=[reference(),userId,name,clean(req.body.company,190),email,clean(req.body.phone,40),clean(req.body.vessel,190),clean(req.body.imo,50),clean(req.body.port,120),req.body.eta||null,service,message];
    const r=await pool.query(`INSERT INTO enquiries(reference,user_id,name,company,email,phone,vessel,imo,port,eta,service,message)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,data);
    const e=r.rows[0];
    await log(userId,"create","enquiry",e.id,{reference:e.reference});
    const html=`<h2>New Vessel Enquiry — ${e.reference}</h2><p><b>Customer:</b> ${escapeHtml(e.name)} (${escapeHtml(e.company||"")})</p><p><b>Email:</b> ${escapeHtml(e.email)}<br><b>Phone:</b> ${escapeHtml(e.phone||"")}</p><p><b>Vessel:</b> ${escapeHtml(e.vessel||"")}<br><b>IMO:</b> ${escapeHtml(e.imo||"")}<br><b>Port:</b> ${escapeHtml(e.port||"")}<br><b>ETA:</b> ${escapeHtml(e.eta||"")}</p><p><b>Service:</b> ${escapeHtml(e.service)}</p><p><b>Requirement:</b><br>${escapeHtml(e.message).replace(/\n/g,"<br>")}</p>`;
    try { await sendMail(process.env.NOTIFY_EMAIL || process.env.COMPANY_EMAIL, `New vessel enquiry ${e.reference}`, html); } catch(mailErr){ console.error("Email error",mailErr); }
    sendMailSafe(e.email,`We received your enquiry ${e.reference}`,templates.enquiryReceived(e));
    res.status(201).json({ok:true,enquiry:e});
  } catch(err){ console.error(err); res.status(500).json({ok:false,message:"Could not save enquiry."}); }
});

app.get("/api/enquiries/mine", auth, async (req,res)=>{
  const r=await pool.query(`SELECT e.*, q.id quote_id,q.quote_number,q.total,q.currency,q.valid_until
    FROM enquiries e LEFT JOIN LATERAL (SELECT * FROM quotes WHERE enquiry_id=e.id ORDER BY created_at DESC LIMIT 1) q ON true WHERE e.user_id=$1 ORDER BY e.created_at DESC`,[req.user.sub]);
  res.json({ok:true,enquiries:r.rows});
});

app.get("/api/enquiries", auth, adminOnly, async (req,res)=>{
  const status=clean(req.query.status,30);
  const r=await pool.query(`SELECT e.*,u.company AS account_company,q.id quote_id,q.quote_number,q.total,q.currency
    FROM enquiries e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN LATERAL (SELECT * FROM quotes WHERE enquiry_id=e.id ORDER BY created_at DESC LIMIT 1) q ON true
    ${status ? "WHERE e.status=$1" : ""} ORDER BY e.created_at DESC`, status?[status]:[]);
  res.json({ok:true,enquiries:r.rows});
});

app.patch("/api/enquiries/:id/status", auth, adminOnly, async (req,res)=>{
  const status=clean(req.body.status,30);
  if(!["New","Processing","Quoted","Completed","Closed"].includes(status)) return res.status(400).json({ok:false,message:"Invalid status."});
  if(!UUID_RE.test(req.params.id)) return res.status(404).json({ok:false,message:"Enquiry not found."});
  const r=await pool.query("UPDATE enquiries SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *",[status,req.params.id]);
  if(!r.rowCount) return res.status(404).json({ok:false,message:"Enquiry not found."});
  await log(req.user.sub,"status_update","enquiry",r.rows[0].id,{status});
  sendMailSafe(r.rows[0].email,`Enquiry ${r.rows[0].reference} — ${status}`,templates.statusUpdate(r.rows[0],status));
  res.json({ok:true,enquiry:r.rows[0]});
});

// Quotes
app.post("/api/quotes", auth, adminOnly, async (req,res)=>{
  try {
    const enquiryId=clean(req.body.enquiry_id,80);
    if(!UUID_RE.test(enquiryId)) return res.status(404).json({ok:false,message:"Enquiry not found."});
    const er=await pool.query("SELECT * FROM enquiries WHERE id=$1",[enquiryId]);
    if(!er.rowCount) return res.status(404).json({ok:false,message:"Enquiry not found."});
    const items=Array.isArray(req.body.items)?req.body.items.slice(0,50).map(x=>({
      description:clean(x.description,300),qty:Number(x.qty)||0,unit_price:Number(x.unit_price)||0
    })).filter(x=>x.description && x.qty>0):[];
    if(!items.length) return res.status(400).json({ok:false,message:"Add at least one quote item."});
    const subtotal=items.reduce((s,x)=>s+x.qty*x.unit_price,0);
    const taxRate=Math.max(0,Math.min(100,Number(req.body.tax_rate)||0));
    const tax=Number((subtotal*taxRate/100).toFixed(2));
    const total=Number((subtotal+tax).toFixed(2));
    const qn=quoteNumber();
    const r=await pool.query(`INSERT INTO quotes(enquiry_id,quote_number,currency,valid_until,notes,items,subtotal,tax,total,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [enquiryId,qn,clean(req.body.currency,10)||"INR",(/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.valid_until||""))?req.body.valid_until:null),clean(req.body.notes,2000),JSON.stringify(items),subtotal,tax,total,req.user.sub]);
    await pool.query("UPDATE enquiries SET status='Quoted',updated_at=NOW() WHERE id=$1",[enquiryId]);
    await log(req.user.sub,"create","quote",r.rows[0].id,{quote_number:qn});
    const e=er.rows[0];
    res.status(201).json({ok:true,quote:r.rows[0]});
    // PDF + email background mein: quote save ho chuka hai, customer email late ho sakta hai.
    (async()=>{
    try {
      const qrow=r.rows[0];
      const pdf=await quotePdfBuffer({...qrow,reference:e.reference,name:e.name,company:e.company,email:e.email,phone:e.phone,vessel:e.vessel,imo:e.imo,port:e.port,eta:e.eta});
      await sendMail(e.email, `Quotation ${qn} — ICONIC SHIPPING SERVICES`, `<p>Dear ${escapeHtml(e.name)},</p><p>Your quotation <b>${qn}</b> has been prepared for enquiry <b>${e.reference}</b>.</p><p>Total: <b>${escapeHtml(qrow.currency)} ${Number(qrow.total).toFixed(2)}</b></p><p>The quotation PDF is attached. You can also download it anytime from the customer portal.</p>`, [{filename:`${qn}.pdf`,content:pdf,contentType:"application/pdf"}]);
    } catch(mailErr){ console.error("Quote email error",mailErr); }
    })();
  } catch(e){ console.error(e); res.status(500).json({ok:false,message:"Could not create quote."}); }
});

// Quote PDF draw (download route aur email attachment dono use karte hain)
function drawQuotePdf(doc,q){
  doc.fontSize(22).fillColor("#123c70").text("ICONIC SHIPPING SERVICES");
  doc.fontSize(9).fillColor("#555").text("MARINE SUPPLIES • SHIP CHANDLING • TECHNICAL SERVICES");
  doc.moveDown(1).strokeColor("#e46d2d").lineWidth(2).moveTo(50,105).lineTo(545,105).stroke();
  doc.moveDown(1).fillColor("#111").fontSize(18).text("QUOTATION");
  doc.fontSize(10).text(`Quote No.: ${q.quote_number}`).text(`Enquiry Ref.: ${q.reference}`).text(`Date: ${new Date(q.created_at).toLocaleDateString("en-IN")}`);
  if(q.valid_until) doc.text(`Valid Until: ${new Date(q.valid_until).toLocaleDateString("en-IN")}`);
  doc.moveDown();
  doc.fontSize(11).text("Bill / Supply To", {underline:true}).fontSize(10).text(`${q.name}${q.company?" — "+q.company:""}`).text(q.email).text(q.phone||"");
  if(q.vessel) doc.moveDown(.5).text(`Vessel: ${q.vessel}   IMO: ${q.imo||"-"}`);
  if(q.port) doc.text(`Port: ${q.port}   ETA: ${q.eta?new Date(q.eta).toLocaleString("en-IN"):"-"}`);
  doc.moveDown();
  let y=300; doc.fontSize(9).fillColor("#fff").rect(50,y,495,22).fill("#123c70");
  doc.fillColor("#fff").text("DESCRIPTION",60,y+7).text("QTY",365,y+7).text("UNIT",415,y+7).text("AMOUNT",470,y+7);
  y+=30; doc.fillColor("#111");
  for(const item of q.items){
    if(y>740){doc.addPage();y=60;}
    const amount=Number(item.qty)*Number(item.unit_price);
    doc.fontSize(9).text(item.description,60,y,{width:295}).text(String(item.qty),365,y).text(`${q.currency} ${Number(item.unit_price).toFixed(2)}`,405,y,{width:62,align:"right"}).text(`${q.currency} ${amount.toFixed(2)}`,470,y,{width:75,align:"right"});
    y+=26;
  }
  y+=10; doc.strokeColor("#ccc").moveTo(350,y).lineTo(545,y).stroke();
  doc.fontSize(10).text(`Subtotal: ${q.currency} ${Number(q.subtotal).toFixed(2)}`,390,y+10,{width:155,align:"right"});
  doc.text(`Tax: ${q.currency} ${Number(q.tax).toFixed(2)}`,390,y+28,{width:155,align:"right"});
  doc.fontSize(13).fillColor("#123c70").text(`TOTAL: ${q.currency} ${Number(q.total).toFixed(2)}`,350,y+52,{width:195,align:"right"});
  if(q.notes){doc.fillColor("#111").fontSize(9).moveDown(4).text("Notes:",50,Math.min(y+100,700)).text(q.notes,50,Math.min(y+118,720),{width:495});}
  doc.fillColor("#555").fontSize(8).text(`ICONIC SHIPPING SERVICES | ${process.env.COMPANY_PHONE||"+91 97124 76193"} | ${process.env.COMPANY_EMAIL||"supply@iconicshipping.org"}`,50,doc.page.height-70,{align:"center",width:495});
  doc.end();
}
function quotePdfBuffer(q){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({margin:50,size:"A4"}), chunks=[];
    doc.on("data",c=>chunks.push(c)); doc.on("end",()=>resolve(Buffer.concat(chunks))); doc.on("error",reject);
    drawQuotePdf(doc,q);
  });
}

app.get("/api/quotes/:id/pdf", auth, async (req,res)=>{
  if(!UUID_RE.test(req.params.id)) return res.status(404).send("Quote not found.");
  const r=await pool.query(`SELECT q.*,e.reference,e.name,e.company,e.email,e.phone,e.vessel,e.imo,e.port,e.eta
    FROM quotes q JOIN enquiries e ON e.id=q.enquiry_id WHERE q.id=$1`,[req.params.id]);
  if(!r.rowCount) return res.status(404).send("Quote not found.");
  const q=r.rows[0];
  if(req.user.role!=="admin" && q.email.toLowerCase()!==req.user.email.toLowerCase()) return res.status(403).send("Forbidden");
  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition",`attachment; filename="${q.quote_number}.pdf"`);
  const doc=new PDFDocument({margin:50,size:"A4"});
  doc.pipe(res);
  drawQuotePdf(doc,q);
});

app.get("/api/admin/stats", auth, adminOnly, async (req,res)=>{
  const r=await pool.query(`SELECT COUNT(*)::int total,
    COUNT(*) FILTER(WHERE status='New')::int new,
    COUNT(*) FILTER(WHERE status='Processing')::int processing,
    COUNT(*) FILTER(WHERE status='Quoted')::int quoted,
    COUNT(*) FILTER(WHERE status='Completed')::int completed FROM enquiries`);
  res.json({ok:true,stats:r.rows[0]});
});

app.post("/api/admin/test-email", auth, adminOnly, async (req,res)=>{
  try {
    const to=clean(req.body.to,190).toLowerCase() || req.user.email;
    if(!validEmail(to)) return res.status(400).json({ok:false,message:"Valid email required."});
    const sent=await sendMail(to,"SMTP test — ICONIC SHIPPING SERVICES","<p>SMTP is working correctly.</p>");
    res.json({ok:sent,message:sent?`Test email sent to ${to}.`:"SMTP is not configured."});
  } catch(e){ console.error(e); res.status(500).json({ok:false,message:"SMTP error: "+e.message}); }
});

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

app.get("/{*splat}",(req,res,next)=>{
  if(req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(FRONTEND_DIR,"index.html"));
});

app.listen(PORT,()=>{ console.log(`ICONIC production server listening on ${PORT}`); verifyMailer(); });
