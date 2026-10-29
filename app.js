const $=id=>document.getElementById(id);
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
const q=new URLSearchParams(location.search);
async function init(){
 if($("servicesGrid")||$("service")){
  const d=await (await fetch("/api/services")).json();
  if($("servicesGrid"))$("servicesGrid").innerHTML=d.services.map(s=>`<a class="card" href="/service.html?id=${s.id}"><div class="icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg></div><h3>${esc(s.name)}</h3><p>${esc(s.short_description)}</p><span>View Details →</span></a>`).join("");
  if($("service")){$("service").innerHTML='<option value="">Select a service</option>'+d.services.map(s=>`<option>${esc(s.name)}</option>`).join("");if(q.get("service"))$("service").value=q.get("service");}
 }
 if($("portsGrid"))$("portsGrid").innerHTML=PORTS.map(p=>`<a href="/port.html?id=${p.id}"><b>${esc(p.name)}</b><small>${esc(p.state)}</small></a>`).join("");
 if($("portTitle")){
  const i=Math.max(0,PORTS.findIndex(p=>p.id===q.get("id"))),p=PORTS[i];
  document.title=`${p.name} Ship Chandling | ICONIC SHIPPING SERVICES`;
  $("portTitle").textContent=`Ship chandling at ${p.name}`;$("portLead").textContent=`${p.state}, India`;
  $("portHeading").textContent=`Supplies and support for vessels at ${p.name}`;$("portNote").textContent=p.note;
  $("portList").innerHTML=PORT_SERVICES.map(x=>`<li>${esc(x)}</li>`).join("");
  $("portCta").href=`/enquiry.html?port=${encodeURIComponent(p.name)}`;$("portCta2").href=$("portCta").href;
  $("otherPorts").innerHTML=PORTS.filter(x=>x.id!==p.id).map(x=>`<a href="/port.html?id=${x.id}">${esc(x.name)}</a>`).join("");
 }
 const f=$("enquiryForm");
 if(f){
  if(q.get("port"))f.port.value=q.get("port");
  f.addEventListener("submit",async e=>{
   e.preventDefault();$("status").textContent="Submitting…";
   const r=await fetch("/api/enquiries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(f)))});
   const d=await r.json();$("status").textContent=r.ok?`✓ Enquiry received. Reference: ${d.enquiry.reference}. A confirmation was sent to your email.`:(d.message||"Submission failed.");
   if(r.ok)f.reset();
  });
 }
}
init();
