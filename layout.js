// Shared header/footer/logo for every page: change here, every page updates.
(()=>{
const logo='<img src="/assets/logo.jpg" alt="ICONIC SHIPPING SERVICES">';
document.querySelectorAll(".brand").forEach(b=>{b.innerHTML=logo;b.setAttribute("href","/")});
const nav=document.querySelector("header.nav");
if(nav){
  nav.innerHTML=`<a class="brand" href="/">${logo}</a><button class="burger" aria-label="Menu" aria-expanded="false">☰</button><nav><a href="/#services">Services</a><a href="/#ports">Indian Ports</a><a href="/about.html">About</a><a href="/login.html">Customer Login</a><a href="/login.html?admin=1">Admin</a><a class="cta" href="/enquiry.html">Send Enquiry</a></nav>`;
  const b=nav.querySelector(".burger");b.addEventListener("click",()=>{const o=nav.classList.toggle("open");b.setAttribute("aria-expanded",o)});
  document.querySelectorAll("footer").forEach(f=>f.remove());
  const f=document.createElement("footer");
  f.innerHTML='<div><b>ICONIC SHIPPING SERVICES</b><p>Marine Supplies • Ship Chandling • Technical Services</p><p><a href="/about.html">About</a> · <a href="/enquiry.html">Enquiry</a> · <a href="/login.html">Customer Login</a></p></div><div><b>Contact</b><p>+91 97124 76193<br>supply@iconicshipping.org<br>technical@iconicshipping.org</p></div><div><b>Office</b><p>Gandhidham – Kachchh 370201<br>GSTIN: 24FSSPB3793N1ZZ</p></div>';
  document.body.appendChild(f);
}
})();
