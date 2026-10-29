// Animated Indian port chart: coastline draws in, ports appear, vessels sail between them.
(()=>{
const C=[[68.3,23.6],[69,22.9],[69.7,22.85],[70.3,23],[70.1,22.4],[69.1,22.4],[68.97,22.2],[69.6,21.6],[70.4,20.9],[71,20.7],[71.6,20.9],[72.2,21.4],[72.1,21.8],[72.5,22.3],[72.7,21.7],[72.65,21.1],[72.8,20.4],[72.85,18.95],[73.4,17],[73.8,15.4],[74.4,14],[74.8,12.9],[75.4,11.8],[76.25,9.97],[76.6,8.9],[77.55,8.08],[78.2,8.8],[79.3,9.28],[79.85,10.76],[80.3,13.1],[80.1,14.4],[81.3,16],[82.3,16.9],[83.3,17.7],[85,19.2],[86.7,20.3],[87.5,21],[88.1,22],[89,21.8]];
const LAND=C.concat([[89,24],[88,27],[80,30],[75,32],[72,28],[68,24.5]]);
const PORTS=[["Kandla",70.22,23,1],["Mundra",69.72,22.85],["Pipavav",71.5,20.95],["Hazira",72.65,21.1],["Mumbai",72.85,18.95],["Cochin",76.25,9.97],["Chennai",80.3,13.1],["Vizag",83.3,17.7],["Paradip",86.7,20.3],["Haldia",88.1,22]];
const ROUTES=[
[[69.72,22.85],[69.3,22.65],[68.7,22],[69.8,20.3],[71.5,19.1],[72.85,18.95]],
[[72.65,21.1],[72.4,20.2],[72.6,19.5],[72.85,18.95]],
[[72.85,18.95],[72.2,16.5],[73,13],[74.6,10.6],[76.25,9.97]],
[[76.25,9.97],[75.9,8.2],[77.6,7.4],[79.6,8.3],[80.6,10.9],[80.3,13.1]],
[[80.3,13.1],[81.3,14.6],[82.6,16.3],[83.3,17.7]],
[[83.3,17.7],[85.2,19],[86.7,20.3]],
[[86.7,20.3],[87.8,20.8],[88.5,21.6],[88.1,22]]];
const SHIPS=[[0,0,.035],[0,1.1,.03],[1,.3,.05],[2,0,.03],[2,1.2,.026],[3,.5,.028],[4,.2,.04],[5,.8,.045],[6,.1,.05]];
const sat=new Image();sat.src="/assets/india-sat.jpg";
const still=matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease=t=>1-Math.pow(1-Math.min(Math.max(t,0),1),3);

function mount(cv){
  const ctx=cv.getContext("2d");let W,H,dpr,s,ox,oy,run=true,vis=true,t0=performance.now();
  const paths=ROUTES.map(r=>{let L=[0];for(let i=1;i<r.length;i++)L.push(L[i-1]+Math.hypot(r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]));return{r,L,T:L[L.length-1]}});
  const P=(lo,la)=>[ox+(lo-67.5)*s*.95,oy+(24-la)*s];
  function size(){
    dpr=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;
    const wide=W>900,bx=wide?W*.4:0,bw=wide?W*.6:W,by=H*.06,bh=H*.88;
    s=Math.min(bw/(22*.95),bh/17.5);ox=bx+(bw-22*.95*s)/2;oy=by+(bh-17.5*s)/2;if(!wide)oy=Math.max(oy,H*.1);
  }
  function at(p,u){const d=u*p.T;let i=1;while(i<p.L.length-1&&p.L[i]<d)i++;const k=(d-p.L[i-1])/(p.L[i]-p.L[i-1]||1),a=p.r[i-1],b=p.r[i];
    const x=a[0]+(b[0]-a[0])*k,y=a[1]+(b[1]-a[1])*k;return{x,y,ang:Math.atan2(-(b[1]-a[1]),(b[0]-a[0])*.95)}}
  function path(pts){ctx.beginPath();pts.forEach((q,i)=>{const[x,y]=P(q[0],q[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y)})}
  function frame(now){
    const t=still?9:(now-t0)/1000;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    // chart graticule
    ctx.strokeStyle="rgba(140,190,220,.07)";ctx.lineWidth=1;
    for(let lo=70;lo<=90;lo+=5){const[x]=P(lo,0);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
    for(let la=10;la<=25;la+=5){const[,y]=P(0,la);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    // land + coastline draw-in
    const p=ease(t/2.4);if(sat.complete&&sat.naturalWidth){const[ax,ay]=P(58,36),[bx2,by2]=P(98,-4);ctx.globalAlpha=ease((t-.3)/1.6);ctx.drawImage(sat,ax,ay,bx2-ax,by2-ay);ctx.globalAlpha=1}else{path(LAND);ctx.fillStyle="rgba(20,58,100,.5)";ctx.fill()}
    let len=0;for(let i=1;i<C.length;i++)len+=Math.hypot(C[i][0]-C[i-1][0],C[i][1]-C[i-1][1])*s;
    path(C);ctx.setLineDash([len,len]);ctx.lineDashOffset=len*(1-p);ctx.strokeStyle="rgba(150,205,230,.75)";ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);
    // sea lanes
    const lane=ease((t-2)/1.5);ctx.strokeStyle=`rgba(190,225,245,${.4*lane})`;ctx.setLineDash([3,6]);
    paths.forEach(q=>{path(q.r);ctx.stroke()});ctx.setLineDash([]);
    // ports
    PORTS.forEach((q,i)=>{const a=ease((t-1.2-i*.16)/.5);if(a<=0)return;const[x,y]=P(q[1],q[2]),home=q[3];
      if(home){const r=7+((t*.8)%1)*16;ctx.strokeStyle=`rgba(228,109,45,${(1-((t*.8)%1))*.7*a})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.stroke()}
      ctx.fillStyle=home?"#e46d2d":"#fff";ctx.beginPath();ctx.arc(x,y,(home?5:3.2)*a,0,7);ctx.fill();
      ctx.font=(home?"600 12px":"11px")+" Inter,system-ui,sans-serif";ctx.fillStyle=home?"#ffb184":`rgba(205,222,238,${.8*a})`;ctx.textAlign=q[1]>85||q[1]<70.3?"right":"left";
      ctx.shadowColor="rgba(0,0,0,.9)";ctx.shadowBlur=5;ctx.fillText(home?"Gandhidham · Kandla":q[0],x+(ctx.textAlign=="left"?10:-10),y+4);ctx.shadowBlur=0});
    // vessels
    SHIPS.forEach(([ri,ph,sp])=>{const a=ease((t-3)/1)*1;if(a<=0)return;const q=paths[ri],m=((t*sp+ph)%2),u=m<1?m:2-m,dir=m<1?1:-1,c=at(q,u),[x,y]=P(c.x,c.y);
      const b=at(q,Math.min(Math.max(u-.05*dir,0),1)),[bx,by]=P(b.x,b.y),g=ctx.createLinearGradient(x,y,bx,by);
      g.addColorStop(0,`rgba(255,255,255,${.5*a})`);g.addColorStop(1,"rgba(255,255,255,0)");ctx.strokeStyle=g;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(bx,by);ctx.stroke();
      ctx.save();ctx.translate(x,y);ctx.rotate(c.ang+(dir<0?Math.PI:0));ctx.globalAlpha=a;ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,3.4);ctx.lineTo(-4,-3.4);ctx.closePath();ctx.fill();ctx.restore()});
  }
  function loop(n){if(run&&vis)frame(n);if(!still)requestAnimationFrame(loop)}
  size();new ResizeObserver(()=>{size();if(still)frame()}).observe(cv);
  new IntersectionObserver(e=>vis=e[0].isIntersecting).observe(cv);
  document.addEventListener("visibilitychange",()=>run=!document.hidden);
  still?frame():requestAnimationFrame(loop);
}
document.querySelectorAll("canvas[data-chart]").forEach(mount);
})();
