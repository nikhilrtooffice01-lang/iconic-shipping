const params=new URLSearchParams(location.search);
const boxes={login:loginBox,register:registerBox,forgot:forgotBox,reset:resetBox};
function show(v){Object.entries(boxes).forEach(([k,el])=>el.hidden=k!==v);msg.textContent=""}
function showRegister(){show("register")}
function showLogin(){show("login")}
document.addEventListener("click",e=>{const a=e.target.closest("[data-view]");if(a){e.preventDefault();show(a.dataset.view)}});
let resetToken="";
if(params.get("reset")){resetToken=params.get("reset");history.replaceState(null,"",location.pathname);show("reset")}
else if(params.get("register")) showRegister();
function go(u){location.href=u}
login.addEventListener("submit",async e=>{
 e.preventDefault(); msg.textContent="Signing in…";
 const r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(login)))});
 const d=await r.json(); if(!r.ok){msg.textContent=d.message;return}
 go(d.user.role==="admin"?"/admin.html":"/account.html");
});
register.addEventListener("submit",async e=>{
 e.preventDefault(); msg.textContent="Creating account…";
 const r=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(register)))});
 const d=await r.json(); if(!r.ok){msg.textContent=d.message;return} go("/account.html");
});
forgotForm.addEventListener("submit",async e=>{
 e.preventDefault(); msg.textContent="Sending…";
 const r=await fetch("/api/auth/forgot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(forgotForm)))});
 const d=await r.json().catch(()=>({})); msg.textContent=d.message||"Something went wrong. Try again.";
});
resetForm.addEventListener("submit",async e=>{
 e.preventDefault(); const f=Object.fromEntries(new FormData(resetForm));
 if(f.password!==f.confirm){msg.textContent="Passwords do not match.";return}
 msg.textContent="Updating…";
 const r=await fetch("/api/auth/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:resetToken,password:f.password})});
 const d=await r.json().catch(()=>({})); msg.textContent=d.message||"Something went wrong.";
 if(r.ok){resetToken="";setTimeout(showLogin,1500)}
});
