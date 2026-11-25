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
function sobel(gr,w,h,angOut){const b=blur(gr,w,h),mag=new Float32Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;
    const gx=-b[i-w-1]-2*b[i-1]-b[i+w-1]+b[i-w+1]+2*b[i+1]+b[i+w+1],gy=-b[i-w-1]-2*b[i-w]-b[i-w+1]+b[i+w-1]+2*b[i+w]+b[i+w+1];
    mag[i]=Math.min(511,Math.hypot(gx,gy)/4);if(angOut)angOut[i]=Math.atan2(gy,gx)}return mag}
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
  return fromMask(dilate(dilate(L.mask,w,h),w,h),w,h,minA)}
function otsu(vals,n,bins){const hist=new Array(bins).fill(0);for(let i=0;i<n;i++)hist[Math.min(bins-1,vals[i]|0)]++;let sum=0;for(let i=0;i<bins;i++)sum+=i*hist[i];
  let sb=0,wb=0,mx=0,th=bins/2;for(let i=0;i<bins;i++){wb+=hist[i];if(!wb)continue;const wf=n-wb;if(!wf)break;sb+=i*hist[i];const mb=sb/wb,mf=(sum-sb)/wf,v=wb*wf*(mb-mf)**2;if(v>mx){mx=v;th=i}}return th}
function fromMaskClean(m,w,h,minA){m=erode(m,w,h);m=dilate(m,w,h);const L=largest(m,w,h);if(L.count<minA*w*h)return null;return fromMask(dilate(L.mask,w,h),w,h,minA)}
function methodThreshold(gr,w,h,minA){
  const th=otsu(gr,w*h,256),out=[];
  for(const pol of [1,0]){const m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=((gr[i]>th)===!!pol)?1:0;const r=fromMaskClean(m,w,h,minA);if(r)out.push(r)}
  return out}
// method C: distance from the background colour (median of the frame border ring)
function methodBg(d,w,h,minA){
  const ring=[],r=Math.max(2,Math.round(Math.min(w,h)*.05));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<r||y<r||x>=w-r||y>=h-r)ring.push((y*w+x)*4);
  const med=c=>{const a=ring.map(i=>d[i+c]).sort((p,q)=>p-q);return a[a.length>>1]};
  const R=med(0),G=med(1),B=med(2),dist=new Float32Array(w*h);
  for(let i=0;i<w*h;i++)dist[i]=Math.abs(d[i*4]-R)+Math.abs(d[i*4+1]-G)+Math.abs(d[i*4+2]-B);
  const th=Math.max(24,otsu(dist.map?Float32Array.from(dist,v=>Math.min(255,v/3)):dist,w*h,256)*3*.8);
  const m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=dist[i]>th?1:0;
  const r2=fromMaskClean(m,w,h,minA);return r2?[r2]:[]}

function lineQuads(mag,ang,w,h,minA){
  const NT=90,diag=Math.ceil(Math.hypot(w,h)),NR=diag*2+1,acc=new Float32Array(NT*NR);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const m=mag[y*w+x];if(m<5)continue;
    let a=ang[y*w+x];if(a<0)a+=Math.PI;if(a>=Math.PI)a-=Math.PI;const t0=Math.round(a/Math.PI*NT);const wt=Math.sqrt(m);
    for(let dt=-1;dt<=1;dt++){let t=t0+dt;let sg=1;if(t<0)t+=NT;if(t>=NT)t-=NT;const th=t*Math.PI/NT;const r=Math.round(x*Math.cos(th)+y*Math.sin(th))+diag;acc[t*NR+r]+=wt*(dt?.6:1)}}
  // peaks
  const peaks=[];for(let t=0;t<NT;t++)for(let r=2;r<NR-2;r++){const v=acc[t*NR+r];if(v<25)continue;let ok=true;
    for(let dt=-3;dt<=3&&ok;dt++){let tt=t+dt;if(tt<0)tt+=NT;if(tt>=NT)tt-=NT;for(let dr=-5;dr<=5;dr++){if(!dt&&!dr)continue;const rr=r+dr;if(rr<0||rr>=NR)continue;const u=acc[tt*NR+rr];if(u>v||(u===v&&(dt<0||(dt===0&&dr<0)))){ok=false;break}}}
    if(ok)peaks.push({t,th:t*Math.PI/NT,r:r-diag,v})}
  peaks.sort((a,b)=>b.v-a.v);const P=peaks.slice(0,18);
  const isect=(p,q)=>{const c1=Math.cos(p.th),s1=Math.sin(p.th),c2=Math.cos(q.th),s2=Math.sin(q.th),det=c1*s2-s1*c2;if(Math.abs(det)<.25)return null;return[(p.r*s2-q.r*s1)/det,(q.r*c1-p.r*c2)/det]};
  const angd=(p,q)=>{let d=Math.abs(p.th-q.th);return Math.min(d,Math.PI-d)};
  const out=[],n=P.length;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(angd(P[i],P[j])>.65)continue; // pair A roughly parallel
    for(let k=0;k<n;k++){if(k===i||k===j)continue;for(let l=k+1;l<n;l++){if(l===i||l===j)continue;if(angd(P[k],P[l])>.65)continue;
      if(angd(P[i],P[k])<.75)continue; // groups must differ in direction (~perpendicular)
      const A=[P[i],P[j]],B=[P[k],P[l]];const c=[isect(A[0],B[0]),isect(A[0],B[1]),isect(A[1],B[1]),isect(A[1],B[0])];
      if(c.some(p=>!p))continue;
      const pad=.04;if(c.some(p=>p[0]<-w*pad||p[0]>w*(1+pad)||p[1]<-h*pad||p[1]>h*(1+pad)))continue;
      const cl=c.map(p=>[Math.min(w-1,Math.max(0,p[0])),Math.min(h-1,Math.max(0,p[1]))]);
      const q=order(cl);if(!convexOK(q))continue;const a=polyArea(q);if(a<minA*w*h||a>.985*w*h)continue;
      out.push({q,score:a/(w*h)})}}}
  return out}
// how well each side of the quad lies on a real image edge
const SUP=4.5,MINW=.55,MINM=.72;
function support(q,mag,w,h,bg){
  const cx=(q[0][0]+q[1][0]+q[2][0]+q[3][0])/4,cy=(q[0][1]+q[1][1]+q[2][1]+q[3][1])/4;
  let worst=1,sum=0;
  for(let k=0;k<4;k++){const a=q[k],b=q[(k+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy),len=Math.max(4,Math.round(L));
    let nx=-dy/L,ny=dx/L;if((cx-a[0])*nx+(cy-a[1])*ny<0){nx=-nx;ny=-ny}
    let pos=0,neg=0,tot=0,hit=0;
    for(let t=0;t<=len;t++){const x=Math.round(a[0]+dx*t/len),y=Math.round(a[1]+dy*t/len);tot++;
      const xi=Math.round(x+nx*3),yi=Math.round(y+ny*3),xo=Math.round(x-nx*3),yo=Math.round(y-ny*3);
      if(xo<1||yo<1||xo>w-2||yo>h-2||xi<1||yi<1||xi>w-2||yi>h-2){hit++;pos++;continue}
      let m=0;for(let ddy=-2;ddy<=2;ddy++)for(let ddx=-2;ddx<=2;ddx++){const v=mag[(y+ddy)*w+x+ddx];if(v>m)m=v}
      if(m>=SUP)hit++;
      const d=bg[yi*w+xi]-bg[yo*w+xo];if(d>=4)pos++;else if(d<=-4)neg++}
    const f=Math.min(hit/tot,Math.max(pos,neg)/tot);if(f<worst)worst=f;sum+=f}
  return {worst,mean:sum/4}}
// snap each side to the strongest nearby edge, fit a line, intersect neighbours
function refine(q,mag,w,h,rad){
  const lines=[];
  for(let k=0;k<4;k++){const a=q[k],b=q[(k+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<6)return q;
    const nx=-dy/len,ny=dx/len,pts=[],N=Math.max(8,Math.round(len/2));
    for(let t=.08;t<=.92;t+=.84/N){const cx=a[0]+dx*t,cy=a[1]+dy*t;let bm=0,bo=0;
      for(let o=-rad;o<=rad;o+=.5){const x=Math.round(cx+nx*o),y=Math.round(cy+ny*o);if(x<1||y<1||x>w-2||y>h-2)continue;const v=mag[y*w+x]*(1-Math.abs(o)/(rad*3));if(v>bm){bm=v;bo=o}}
      if(bm>=SUP)pts.push([cx+nx*bo,cy+ny*bo])}
    if(pts.length<N*.4)return q; // not enough edge evidence on this side
    // total least squares line fit
    let mx=0,my=0;pts.forEach(p=>{mx+=p[0];my+=p[1]});mx/=pts.length;my/=pts.length;let sxx=0,sxy=0,syy=0;pts.forEach(p=>{sxx+=(p[0]-mx)**2;sxy+=(p[0]-mx)*(p[1]-my);syy+=(p[1]-my)**2});
    const th=.5*Math.atan2(2*sxy,sxx-syy);lines.push({p:[mx,my],d:[Math.cos(th),Math.sin(th)]})}
  const isect=(L1,L2)=>{const det=L1.d[0]*(-L2.d[1])-L1.d[1]*(-L2.d[0]);if(Math.abs(det)<1e-3)return null;
    const rx=L2.p[0]-L1.p[0],ry=L2.p[1]-L1.p[1],t=(rx*(-L2.d[1])-ry*(-L2.d[0]))/det;return[L1.p[0]+L1.d[0]*t,L1.p[1]+L1.d[1]*t]};
  const out=[];for(let k=0;k<4;k++){const p=isect(lines[(k+3)%4],lines[k]);if(!p||Math.hypot(p[0]-q[k][0],p[1]-q[k][1])>rad*3)return q;out.push(p)}
  return out}
function find(rgba,w,h,minArea){
  minArea=minArea||.14;const gr=gray(rgba,w*h),ang=new Float32Array(w*h),mag=sobel(gr,w,h,ang);
  const hist=new Uint32Array(512);let tot=0;for(let i=0;i<w*h;i++){hist[mag[i]|0]++;tot++}
  let acc=0,th=0;for(let i=0;i<512;i++){acc+=hist[i];if(acc>tot*.86){th=i;break}}
  const cands=[];
  for(const t of [Math.min(Math.max(th,14),45),22,13,9]){const r=edgesAt(mag,t,w,h,minArea);if(r)cands.push(r)}
  cands.push(...methodThreshold(gr,w,h,minArea),...methodBg(rgba,w,h,minArea));
  const bgr=blur(gr,w,h);
  let hq=[];try{hq=lineQuads(mag,ang,w,h,minArea)}catch(e){}
  if(hq.length>400){hq.sort((a,b)=>b.score-a.score);hq=hq.slice(0,400)}
  cands.push(...hq);
  let best=null,bs=-1;
  for(const c of cands){const s=support(c.q,mag,w,h,bgr);if(s.worst<MINW||s.mean<MINM)continue;const sc=(s.worst*.6+s.mean*.4)*(.3+Math.sqrt(c.score));if(sc>bs){bs=sc;best=c}}
  if(!best)return null;
  let q=best.q;for(let it=0;it<2;it++){const r=refine(q,mag,w,h,4-it);if(r!==q&&convexOK(r))q=r}
  return q.map(p=>[Math.min(1,Math.max(0,(p[0]+.5)/w)),Math.min(1,Math.max(0,(p[1]+.5)/h))])}
g.DocDetect={find};
})(typeof window!=='undefined'?window:globalThis);
