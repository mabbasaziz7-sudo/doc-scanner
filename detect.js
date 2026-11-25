/* Document edge detection (no libraries). DocDetect.find(rgba,w,h,minArea) -> [[x,y]*4] normalized, order TL,TR,BR,BL, or null */
(function(g){
function gray(d,n){const o=new Float32Array(n);for(let i=0;i<n;i++)o[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];return o}
function blur(a,w,h){const o=new Float32Array(a.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,c=0;for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=h)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=w)continue;s+=a[yy*w+xx];c++}}o[y*w+x]=s/c}return o}
function dilate(m,w,h){const o=new Uint8Array(m.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(m[i]){o[i]=1;continue}
    if((x>0&&m[i-1])||(x<w-1&&m[i+1])||(y>0&&m[i-w])||(y<h-1&&m[i+w])||(x>0&&y>0&&m[i-w-1])||(x<w-1&&y>0&&m[i-w+1])||(x>0&&y<h-1&&m[i+w-1])||(x<w-1&&y<h-1&&m[i+w+1]))o[i]=1}return o}
function erode(m,w,h){const o=new Uint8Array(m.length);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(m[i]&&m[i-1]&&m[i+1]&&m[i-w]&&m[i+w])o[i]=1}return o}
function largest(m,w,h){ // largest 4-connected component -> {mask,count}
  const lab=new Int32Array(m.length);let best=0,bestN=0,n=0;const st=new Int32Array(m.length);
  for(let i=0;i<m.length;i++){if(!m[i]||lab[i])continue;n++;let sp=0,cnt=0;st[sp++]=i;lab[i]=n;
    while(sp){const p=st[--sp];cnt++;const x=p%w,y=(p/w)|0;
      if(x>0&&m[p-1]&&!lab[p-1]){lab[p-1]=n;st[sp++]=p-1}
      if(x<w-1&&m[p+1]&&!lab[p+1]){lab[p+1]=n;st[sp++]=p+1}
      if(y>0&&m[p-w]&&!lab[p-w]){lab[p-w]=n;st[sp++]=p-w}
      if(y<h-1&&m[p+w]&&!lab[p+w]){lab[p+w]=n;st[sp++]=p+w}}
    if(cnt>bestN){bestN=cnt;best=n}}
  const mask=new Uint8Array(m.length);if(best)for(let i=0;i<m.length;i++)if(lab[i]===best)mask[i]=1;return{mask,count:bestN}}
function hull(pts){pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[];for(const p of pts){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
  const up=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p)}
  lo.pop();up.pop();return lo.concat(up)}
const area2=(a,b,c)=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
function polyArea(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1]}return Math.abs(s)/2}
function bestQuad(h){ // max-area quadrilateral from convex hull
  let H=h;if(H.length>70){const s=H.length/70;H=Array.from({length:70},(_,i)=>h[Math.floor(i*s)])}
  const n=H.length;if(n<4)return null;let best=0,q=null;
  for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;
    let a1=0,k1=-1,a2=0,k2=-1;
    for(let k=i+1;k<j;k++){const a=area2(H[i],H[j],H[k]);if(a>a1){a1=a;k1=k}}
    for(let k=j+1;k<n+i;k++){const kk=k%n,a=area2(H[i],H[j],H[kk]);if(a>a2){a2=a;k2=kk}}
    if(k1>=0&&k2>=0&&a1+a2>best){best=a1+a2;q=[H[i],H[k1],H[j],H[k2]]}}
  return q}
function order(q){const cx=q.reduce((s,p)=>s+p[0],0)/4,cy=q.reduce((s,p)=>s+p[1],0)/4;
  const s=q.slice().sort((a,b)=>Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx));
  let t=0;for(let i=1;i<4;i++)if(s[i][0]+s[i][1]<s[t][0]+s[t][1])t=i;return[s[t],s[(t+1)%4],s[(t+2)%4],s[(t+3)%4]]}
function convexOK(q){let sg=0;for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4];
  const cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);const s=cr>0?1:-1;if(!sg)sg=s;else if(s!==sg)return false;
  const l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]);if(l1<4||l2<4)return false;
  const cos=((a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1]))/(l1*l2);if(cos>.62||cos<-.62)return false}return true}
function fromMask(mask,w,h,minA){
  const pts=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){const e=(x>0&&!mask[y*w+x-1])||(x<w-1&&!mask[y*w+x+1])||(y>0&&!mask[(y-1)*w+x])||(y<h-1&&!mask[(y+1)*w+x]);if(e)pts.push([x,y])}
  if(pts.length<8)return null;const hl=hull(pts);const q=bestQuad(hl);if(!q||!convexOK(q))return null;
  const qa=polyArea(q),ha=polyArea(hl);if(qa<minA*w*h||qa>.985*w*h||qa<ha*.82)return null;
  return {q:order(q),score:qa/(w*h)}}
// method A: closed edge ring -> region the background flood cannot reach
function methodEdges(gr,w,h,minA){
  const b=blur(gr,w,h),mag=new Float32Array(w*h);let hist=new Uint32Array(512),tot=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;
    const gx=-b[i-w-1]-2*b[i-1]-b[i+w-1]+b[i-w+1]+2*b[i+1]+b[i+w+1],gy=-b[i-w-1]-2*b[i-w]-b[i-w+1]+b[i+w-1]+2*b[i+w]+b[i+w+1];
    const m=Math.min(511,Math.hypot(gx,gy)/4);mag[i]=m;hist[m|0]++;tot++}
  let acc=0,th=0;for(let i=0;i<512;i++){acc+=hist[i];if(acc>tot*.86){th=i;break}}let best=null;
  for(const t of [Math.min(Math.max(th,14),45),22,13]){const r=edgesAt(mag,t,w,h,minA);if(r&&(!best||r.score>best.score*1.0))best=r}
  return best}
function edgesAt(mag,th,w,h,minA){
  let edge=new Uint8Array(w*h);for(let i=0;i<w*h;i++)edge[i]=mag[i]>th?1:0;
  edge=dilate(dilate(edge,w,h),w,h);
  const reach=new Uint8Array(w*h),st=new Int32Array(w*h);let sp=0;
  const push=i=>{if(!edge[i]&&!reach[i]){reach[i]=1;st[sp++]=i}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
  while(sp){const p=st[--sp],x=p%w,y=(p/w)|0;if(x>0)push(p-1);if(x<w-1)push(p+1);if(y>0)push(p-w);if(y<h-1)push(p+w)}
  let inner=new Uint8Array(w*h);for(let i=0;i<w*h;i++)inner[i]=reach[i]?0:1;
  inner=erode(erode(inner,w,h),w,h);
  const L=largest(inner,w,h);if(L.count<minA*w*h*.5)return null;
  let m=dilate(dilate(L.mask,w,h),w,h);
  return fromMask(m,w,h,minA)}
// method B: brightness/darkness segmentation (paper vs. background), tries both polarities
function methodThreshold(gr,w,h,minA){
  const hist=new Array(256).fill(0);gr.forEach(v=>hist[v|0]++);const tot=gr.length;let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
  let sb=0,wb=0,mx=0,th=128;for(let i=0;i<256;i++){wb+=hist[i];if(!wb)continue;const wf=tot-wb;if(!wf)break;sb+=i*hist[i];const mb=sb/wb,mf=(sum-sb)/wf,v=wb*wf*(mb-mf)**2;if(v>mx){mx=v;th=i}}
  let best=null;
  for(const pol of [1,0]){let m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=((gr[i]>th)===!!pol)?1:0;
    m=erode(m,w,h);m=dilate(m,w,h);
    const L=largest(m,w,h);if(L.count<minA*w*h)continue;
    const r=fromMask(dilate(L.mask,w,h),w,h,minA);if(r&&(!best||r.score>best.score))best=r}
  return best}
function find(rgba,w,h,minArea){
  minArea=minArea||.14;const gr=gray(rgba,w*h);
  const A=methodEdges(gr,w,h,minArea),B=methodThreshold(gr,w,h,minArea);
  let r=null;
  if(A&&B){ // prefer edges; if they disagree a lot, use the larger-agreement (edges unless threshold is much more document-like)
    r=A.score>=B.score*.7?A:B}
  else r=A||B;
  if(!r)return null;
  return r.q.map(p=>[Math.min(1,Math.max(0,(p[0]+.5)/w)),Math.min(1,Math.max(0,(p[1]+.5)/h))])}
g.DocDetect={find};
})(typeof window!=='undefined'?window:globalThis);
