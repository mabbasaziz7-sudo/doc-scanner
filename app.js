'use strict';
const $=s=>document.querySelector(s);
const views=['home','files','tools','pdfTools','idcard','ocrTool','idphoto','me','camera','editor','doc'];
const navRoots=['home','files','tools','me'];
const titles={home:'ماسح المستندات',files:'الملفات',tools:'الأدوات',pdfTools:'أدوات PDF',idcard:'بطاقات الهوية',ocrTool:'استخراج النص',idphoto:'صانع الصور ID',me:'حسابي',editor:'تعديل الصفحة',camera:''};
let state={doc:null,stream:null,pending:[],filter:'magic',bright:0,contrast:0,rot:0,corners:null,img:null,mode:'crop',view:'home',captured:[],camMode:'scan',idcard:{front:null,back:null},idSlot:null,idPhotoSize:null,splitSrc:null};

// ---------- IndexedDB ----------
let db;
const idb=new Promise((res,rej)=>{const r=indexedDB.open('scanner',1);r.onupgradeneeded=()=>r.result.createObjectStore('docs',{keyPath:'id'});r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)});
const tx=(m,f)=>new Promise((res,rej)=>{const t=db.transaction('docs',m);const r=f(t.objectStore('docs'));t.oncomplete=()=>res(r.result);t.onerror=()=>rej(t.error)});
const allDocs=()=>tx('readonly',s=>s.getAll());
const putDoc=d=>tx('readwrite',s=>s.put(d));
const delDoc=id=>tx('readwrite',s=>s.delete(id));

// ---------- helpers ----------
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2500)}
function busy(t){$('#busy').hidden=!t;$('#busyText').textContent=t||''}
function show(v){views.forEach(x=>$('#'+x).hidden=x!==v);state.view=v;
  $('#bar').hidden=v==='camera';
  $('#nav').hidden=!navRoots.includes(v);
  $('#back').hidden=navRoots.includes(v)||v==='camera';
  $('#title').textContent=v==='doc'?(state.doc?.name||''):(titles[v]??'');
  document.querySelectorAll('.nv').forEach(b=>b.classList.toggle('on',b.dataset.nav===v));
  if(v==='me')updStorage()}
const blobOf=(c,q=.92)=>new Promise(r=>c.toBlob(r,'image/jpeg',q));
function loadImg(blob){return new Promise((res,rej)=>{const u=URL.createObjectURL(blob);const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u})}
function fitCanvas(img,max){const s=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const c=document.createElement('canvas');c.width=Math.round((img.naturalWidth||img.width)*s);c.height=Math.round((img.naturalHeight||img.height)*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fmtDate=t=>new Date(t).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
function loadLib(src,check){return new Promise((res,rej)=>{if(check())return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('يلزم اتصال بالإنترنت لأول مرة'));document.head.append(s)})}
const loadTesseract=()=>loadLib('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',()=>window.Tesseract);
const loadPdfLib=()=>loadLib('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',()=>window.PDFLib);
const loadPdfjs=()=>loadLib('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',()=>window.pdfjsLib).then(()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'});

// ---------- navigation ----------
document.querySelectorAll('.nv').forEach(b=>b.onclick=()=>{const v=b.dataset.nav;state.doc=null;show(v);if(v==='home'||v==='files')renderDocs()});
$('#navCam').onclick=()=>{state.doc=null;state.captured=[];openCamera('scan')};
$('#seeAll').onclick=()=>{show('files');renderDocs()};
$('#back').onclick=()=>{
  if(state.view==='editor'){if(state.pending.length||state.mode==='edit-existing'){afterEditorExit()}else{openOrHome()}}
  else if(state.view==='doc'){state.doc=null;show('home');renderDocs()}
  else if(['pdfTools','idcard','ocrTool','idphoto'].includes(state.view)){show('tools')}
  else{state.doc=null;show('home');renderDocs()}};
function openOrHome(){state.doc?show('doc'):(show('home'),renderDocs())}

// ---------- tool tiles ----------
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{
  const t=b.dataset.tool;
  if(t==='scan'){state.doc=null;state.captured=[];openCamera('scan')}
  else if(t==='pdftools')show('pdfTools');
  else if(t==='importimg'){state.doc=null;$('#importInput').click()}
  else if(t==='importfile'){state.doc=null;$('#importFileInput').click()}
  else if(t==='idcard'){renderIdcard();show('idcard')}
  else if(t==='ocr')show('ocrTool');
  else if(t==='idphoto')show('idphoto');
  else if(t==='all')show('tools');
});

// ---------- docs list ----------
async function renderDocs(){
  const q=($('#search').value||'').trim().toLowerCase(),q2=($('#search2').value||'').trim().toLowerCase();
  let docs=(await allDocs()).sort((a,b)=>b.updated-a.updated);
  const filt=(docs,qq)=>qq?docs.filter(d=>d.name.toLowerCase().includes(qq)||(d.ocr||'').toLowerCase().includes(qq)):docs;
  const r=filt(docs,q),f=filt(docs,q2);
  const rb=$('#recentDocs');rb.innerHTML='';$('#empty').hidden=r.length>0;r.slice(0,20).forEach(d=>rb.append(docRow(d)));
  const fb=$('#docs');fb.innerHTML='';$('#empty2').hidden=f.length>0;f.forEach(d=>fb.append(docRow(d)));
}
function docRow(d){
  const el=document.createElement('div');el.className='doc';
  const top=document.createElement('div');top.className='docTop';
  const im=document.createElement('img');if(d.pages[0])im.src=URL.createObjectURL(d.pages[0].out);
  top.append(im);const t=document.createElement('div');t.innerHTML='<b></b><small></small>';t.querySelector('b').textContent=d.name;
  t.querySelector('small').textContent=d.pages.length+' صفحة · '+fmtDate(d.updated);top.append(t);
  top.onclick=()=>openDoc(d.id);el.append(top);
  const acts=document.createElement('div');acts.className='docActs';
  const mk=(txt,f)=>{const b=document.createElement('button');b.textContent=txt;b.onclick=e=>{e.stopPropagation();f()};acts.append(b)};
  mk('عرض',()=>openDoc(d.id));mk('PDF',()=>exportDocPdf(d));mk('مشاركة',()=>shareDocImgs(d));
  el.append(acts);return el}
$('#search').oninput=renderDocs;
$('#search2').oninput=renderDocs;

// ---------- camera ----------

// ---------- live document detection ----------
const live={raf:0,t:0,q:null,miss:0,hist:[],still:0,lastAuto:0,auto:localStorage.getItem('autoCap')==='1'};
function setAutoBtn(){const b=$('#autoBtn');b.classList.toggle('on',live.auto);b.textContent='تصوير تلقائي: '+(live.auto?'تشغيل':'إيقاف')}
$('#autoBtn').onclick=()=>{live.auto=!live.auto;localStorage.setItem('autoCap',live.auto?'1':'0');live.still=0;setAutoBtn()};
function stopLive(){cancelAnimationFrame(live.raf);live.raf=0;live.q=null;live.hist=[];const o=$('#liveOv');o.getContext('2d').clearRect(0,0,o.width,o.height)}
function startLive(){
  stopLive();setAutoBtn();const ov=$('#liveOv'),v=$('#video'),t=document.createElement('canvas'),tx=t.getContext('2d',{willReadFrequently:true});
  const dist=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])));
  const loop=ts=>{
    live.raf=requestAnimationFrame(loop);if(ts-live.t<140||!v.videoWidth)return;live.t=ts;
    const w=144,h=Math.round(w*v.videoHeight/v.videoWidth);t.width=w;t.height=h;tx.drawImage(v,0,0,w,h);
    let q=null;try{q=DocDetect.find(tx.getImageData(0,0,w,h).data,w,h,.16)}catch(e){}
    if(q){live.miss=0;
      if(live.q&&dist(q,live.q)<.12)live.q=live.q.map((p,i)=>[p[0]*.45+q[i][0]*.55,p[1]*.45+q[i][1]*.55]);else live.q=q}
    else if(++live.miss>=3)live.q=null;
    // geometry (object-fit: cover)
    const dpr=devicePixelRatio||1,cw=ov.clientWidth,ch=ov.clientHeight;if(ov.width!==Math.round(cw*dpr)){ov.width=Math.round(cw*dpr);ov.height=Math.round(ch*dpr)}
    const x=ov.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,cw,ch);
    const sc=Math.max(cw/v.videoWidth,ch/v.videoHeight),ox=(cw-v.videoWidth*sc)/2,oy=(ch-v.videoHeight*sc)/2;
    const hint=$('#hintTxt');
    if(live.q){
      const p=live.q.map(c=>[ox+c[0]*v.videoWidth*sc,oy+c[1]*v.videoHeight*sc]);
      x.beginPath();p.forEach((c,i)=>i?x.lineTo(...c):x.moveTo(...c));x.closePath();
      x.fillStyle='rgba(20,184,166,.18)';x.fill();x.strokeStyle='#2dd4bf';x.lineWidth=3;x.lineJoin='round';x.stroke();
      p.forEach(c=>{x.beginPath();x.arc(c[0],c[1],7,0,7);x.fillStyle='#fff';x.fill();x.strokeStyle='#14b8a6';x.lineWidth=3;x.stroke()});
      hint.textContent=live.auto&&state.camMode==='scan'?'ثبّت الهاتف… سيتم التصوير تلقائياً':'تم اكتشاف المستند — اضغط للتصوير';hint.className='ok';
      live.hist.push({ts,q:live.q});while(live.hist.length&&ts-live.hist[0].ts>900)live.hist.shift();
      const moved=live.hist.length>3?dist(live.q,live.hist[0].q):1;
      if(live.hist.length>5&&moved<.02&&ts-live.hist[0].ts>700)live.still+=1;else live.still=0;
      if(live.auto&&state.camMode==='scan'&&live.still>=4&&ts-live.lastAuto>2500){live.lastAuto=ts;live.still=0;live.hist=[];$('#shutter').click()}
    }else{hint.textContent='وجّه الكاميرا نحو المستند';hint.className='';live.hist=[];live.still=0}
  };
  live.raf=requestAnimationFrame(loop);
}
async function openCamera(mode){
  state.camMode=mode||'scan';show('camera');
  const scan=state.camMode==='scan';
  $('#camDone').hidden=!scan;$('#camImport').closest('label').hidden=!scan;
  try{
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1440}},audio:false});
    const v=$('#video');v.srcObject=state.stream;await v.play();startLive();
    const tr=state.stream.getVideoTracks()[0];const caps=tr.getCapabilities?tr.getCapabilities():{};
    $('#torch').hidden=!caps.torch;state.torch=false;
  }catch(e){toast('تعذر فتح الكاميرا. تأكد من السماح بالكاميرا.');}
  updCam();
}
function closeCamera(){stopLive();if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null}}
function updCam(){$('#camCount').textContent=state.camMode==='scan'&&state.captured.length?state.captured.length+' صفحة':''}
$('#torch').onclick=async()=>{try{state.torch=!state.torch;await state.stream.getVideoTracks()[0].applyConstraints({advanced:[{torch:state.torch}]})}catch(e){}};
$('#shutter').onclick=async()=>{
  const v=$('#video');if(!v.videoWidth)return toast('الكاميرا غير جاهزة');
  const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
  const blob=await blobOf(c,.95);
  try{blob.__corners=detectCorners(c)}catch(e){}
  const fl=document.createElement('div');fl.style.cssText='position:absolute;inset:0;background:#fff;opacity:.7;z-index:5;pointer-events:none;transition:opacity .25s';$('#camera').append(fl);requestAnimationFrame(()=>fl.style.opacity=0);setTimeout(()=>fl.remove(),300);
  if(state.camMode==='idcard'){
    state.idcard[state.idSlot]=blob;closeCamera();renderIdcard();show('idcard');
    if(navigator.vibrate)navigator.vibrate(30);return}
  state.captured.push(blob);updCam();if(navigator.vibrate)navigator.vibrate(30);
};
$('#camClose').onclick=()=>{closeCamera();
  if(state.camMode==='idcard'){renderIdcard();show('idcard');return}
  state.captured=[];state.doc?(show('doc')):(show('home'),renderDocs())};
$('#camDone').onclick=()=>{closeCamera();startQueue(state.captured);state.captured=[]};
async function importFiles(files){const arr=[...files];if(!arr.length)return;startQueue(arr)}
$('#camImport').onchange=e=>{closeCamera();state.captured=[];importFiles(e.target.files);e.target.value=''};
$('#importInput').onchange=e=>{state.doc=null;importFiles(e.target.files);e.target.value=''};
$('#importFileInput').onchange=async e=>{
  const arr=[...e.target.files];e.target.value='';if(!arr.length)return;
  const imgs=arr.filter(f=>f.type.startsWith('image/')),pdfs=arr.filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name));
  if(imgs.length)importFiles(imgs);
  for(const p of pdfs)await importPdf(p);
};
$('#docImport').onchange=e=>{importFiles(e.target.files);e.target.value=''};
$('#addImport').onclick=()=>$('#docImport').click();
$('#addPage').onclick=()=>{state.captured=[];openCamera('scan')};

// ---------- editing queue ----------
async function startQueue(blobs){
  if(!blobs.length){openOrHome();return}
  state.pending=[...blobs];state.newPages=[];nextPending();
}
async function nextPending(){
  const b=state.pending.shift();
  if(!b){return finishQueue()}
  busy('جاري التحضير...');
  try{
    const img=await loadImg(b);const c=fitCanvas(img,2400);
    state.img=c;state.origBlob=await blobOf(c,.9);
    state.corners=(b.__corners&&b.__corners.length===4)?b.__corners:detectCorners(c);state.filter='magic';state.bright=0;state.contrast=0;state.rot=0;state.mode='new';state.editIdx=-1;
    enterCrop();
  }catch(e){toast('تعذر قراءة الصورة');nextPending()}
  busy('');
}
async function finishQueue(){
  const pages=state.newPages;if(!pages.length){state.idPhotoSize=null;openOrHome();return}
  let d=state.doc;
  if(!d){d={id:uid(),name:state.idPhotoSize?'صورة هوية':'مستند '+new Date().toLocaleDateString('ar-EG'),created:Date.now(),updated:Date.now(),pages:[]}}
  d.pages.push(...pages);d.updated=Date.now();state.idPhotoSize=null;await putDoc(d);state.doc=d;openDoc(d.id);
}
function afterEditorExit(){state.pending=[];state.newPages&&state.newPages.length?finishQueue():(state.idPhotoSize=null,openOrHome())}

// ---------- crop ----------
function enterCrop(){
  show('editor');$('#cropBtns').hidden=false;$('#filterPane').hidden=true;state.sub='crop';
  const c=$('#cv'),img=state.img;const maxW=Math.min(innerWidth-16,900),maxH=innerHeight-210;
  const s=Math.min(maxW/img.width,maxH/img.height);c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);state.vs=s;drawCrop();
}
function drawCrop(){
  const c=$('#cv'),x=c.getContext('2d');x.drawImage(state.img,0,0,c.width,c.height);
  const p=state.corners.map(q=>[q[0]*c.width,q[1]*c.height]);
  x.fillStyle='#0006';x.beginPath();x.rect(0,0,c.width,c.height);x.moveTo(...p[0]);for(let i=3;i>=0;i--)x.lineTo(...p[i]);x.closePath();x.fill('evenodd');
  x.strokeStyle='#14b8a6';x.lineWidth=2.5;x.beginPath();p.forEach((q,i)=>i?x.lineTo(...q):x.moveTo(...q));x.closePath();x.stroke();
  p.forEach(q=>{x.fillStyle='#fff';x.strokeStyle='#0f766e';x.lineWidth=3;x.beginPath();x.arc(q[0],q[1],13,0,7);x.fill();x.stroke()});
}
(function(){
  const c=$('#cv');let drag=-1;
  const pos=e=>{const r=c.getBoundingClientRect();return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]};
  c.addEventListener('pointerdown',e=>{if(state.sub!=='crop')return;const [x,y]=pos(e);let best=-1,bd=.08;
    state.corners.forEach((q,i)=>{const d=Math.hypot(q[0]-x,q[1]-y);if(d<bd){bd=d;best=i}});drag=best;if(best>=0)c.setPointerCapture(e.pointerId)});
  c.addEventListener('pointermove',e=>{if(drag<0)return;const [x,y]=pos(e);state.corners[drag]=[Math.min(1,Math.max(0,x)),Math.min(1,Math.max(0,y))];drawCrop()});
  const up=()=>drag=-1;c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
})();
$('#autoCrop').onclick=()=>{state.corners=detectCorners(state.img);drawCrop()};
$('#fullCrop').onclick=()=>{state.corners=[[0,0],[1,0],[1,1],[0,1]];drawCrop()};
$('#applyCrop').onclick=()=>{busy('جاري المعالجة...');setTimeout(()=>{state.warped=warp(state.img,state.corners);state.rot=state.rot||0;enterFilter();busy('')},30)};
$('#recrop').onclick=()=>enterCrop();

// order: TL TR BR BL
function detectCorners(c){
  try{const w=240,h=Math.round(w*c.height/c.width);const t=document.createElement('canvas');t.width=w;t.height=h;const x=t.getContext('2d');x.drawImage(c,0,0,w,h);
    const q=DocDetect.find(x.getImageData(0,0,w,h).data,w,h,.12);if(q)return q}catch(e){}
  return detectCornersOld(c);
}
function detectCornersOld(c){
  const w=160,h=Math.round(160*c.height/c.width);const t=document.createElement('canvas');t.width=w;t.height=h;const x=t.getContext('2d');x.drawImage(c,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data;const g=new Float32Array(w*h);
  for(let i=0;i<w*h;i++)g[i]=.3*d[i*4]+.59*d[i*4+1]+.11*d[i*4+2];
  let hist=new Array(256).fill(0);g.forEach(v=>hist[v|0]++);let tot=g.length,sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
  let sb=0,wb=0,mx=0,th=128;for(let i=0;i<256;i++){wb+=hist[i];if(!wb)continue;const wf=tot-wb;if(!wf)break;sb+=i*hist[i];const mb=sb/wb,mf=(sum-sb)/wf;const v=wb*wf*(mb-mf)**2;if(v>mx){mx=v;th=i}}
  const m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=(g[i]>th)?1:0;
  const lab=new Int32Array(w*h);let best=0,bestN=0,n=0;const st=[];
  for(let i=0;i<w*h;i++){if(!m[i]||lab[i])continue;n++;let cnt=0;st.push(i);lab[i]=n;
    while(st.length){const p=st.pop();cnt++;const px=p%w,py=(p/w)|0;
      for(const q of [px>0?p-1:-1,px<w-1?p+1:-1,py>0?p-w:-1,py<h-1?p+w:-1]){if(q>=0&&m[q]&&!lab[q]){lab[q]=n;st.push(q)}}}
    if(cnt>bestN){bestN=cnt;best=n}}
  if(bestN<w*h*.12||bestN>w*h*.97)return[[.04,.04],[.96,.04],[.96,.96],[.04,.96]];
  let tl=[1e9,0,0],tr=[-1e9,0,0],br=[-1e9,0,0],bl=[1e9,0,0];
  for(let i=0;i<w*h;i++){if(lab[i]!==best)continue;const px=i%w,py=(i/w)|0;
    const a=px+py,b=px-py;
    if(a<tl[0])tl=[a,px,py];if(a>br[0])br=[a,px,py];if(b>tr[0])tr=[b,px,py];if(b<bl[0])bl=[b,px,py]}
  return[tl,tr,br,bl].map(q=>[Math.min(1,Math.max(0,q[1]/w)),Math.min(1,Math.max(0,q[2]/h))]);
}

// perspective warp
function solve(A,b){const n=b.length;for(let i=0;i<n;i++){let p=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[p][i]))p=r;[A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];
  for(let r=i+1;r<n;r++){const f=A[r][i]/A[i][i];for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i]}}
  const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=b[i];for(let c=i+1;c<n;c++)s-=A[i][c]*x[c];x[i]=s/A[i][i]}return x}
function warp(src,corners){
  const W=src.width,H=src.height;const P=corners.map(q=>[q[0]*W,q[1]*H]);
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  let ow=Math.round(Math.max(dist(P[0],P[1]),dist(P[3],P[2]))),oh=Math.round(Math.max(dist(P[0],P[3]),dist(P[1],P[2])));
  const k=Math.min(1,2200/Math.max(ow,oh));ow=Math.max(20,Math.round(ow*k));oh=Math.max(20,Math.round(oh*k));
  const D=[[0,0],[ow,0],[ow,oh],[0,oh]];const A=[],b=[];
  for(let i=0;i<4;i++){const[u,v]=D[i],[x,y]=P[i];A.push([u,v,1,0,0,0,-u*x,-v*x]);b.push(x);A.push([0,0,0,u,v,1,-u*y,-v*y]);b.push(y)}
  const h=solve(A,b);
  const out=document.createElement('canvas');out.width=ow;out.height=oh;const ox=out.getContext('2d');const od=ox.createImageData(ow,oh);
  const sd=src.getContext('2d').getImageData(0,0,W,H).data;
  for(let v=0;v<oh;v++)for(let u=0;u<ow;u++){
    const z=h[6]*u+h[7]*v+1;const x=(h[0]*u+h[1]*v+h[2])/z,y=(h[3]*u+h[4]*v+h[5])/z;
    const x0=Math.floor(x),y0=Math.floor(y);const o=(v*ow+u)*4;
    if(x0<0||y0<0||x0>=W-1||y0>=H-1){od.data[o]=od.data[o+1]=od.data[o+2]=255;od.data[o+3]=255;continue}
    const fx=x-x0,fy=y-y0,i00=(y0*W+x0)*4,i10=i00+4,i01=i00+W*4,i11=i01+4;
    for(let c=0;c<3;c++)od.data[o+c]=sd[i00+c]*(1-fx)*(1-fy)+sd[i10+c]*fx*(1-fy)+sd[i01+c]*(1-fx)*fy+sd[i11+c]*fx*fy;
    od.data[o+3]=255}
  ox.putImageData(od,0,0);return out}

// ---------- filters ----------
function rotate(c,deg){deg=((deg%360)+360)%360;if(!deg)return c;const o=document.createElement('canvas');const sw=deg%180;o.width=sw?c.height:c.width;o.height=sw?c.width:c.height;
  const x=o.getContext('2d');x.translate(o.width/2,o.height/2);x.rotate(deg*Math.PI/180);x.drawImage(c,-c.width/2,-c.height/2);return o}
function applyFilter(src,f,br,co){
  const w=src.width,h=src.height;const out=document.createElement('canvas');out.width=w;out.height=h;const x=out.getContext('2d');x.drawImage(src,0,0);
  if(f!=='original'||br||co){
    const id=x.getImageData(0,0,w,h),d=id.data;
    let bg=null;
    if(f!=='original'){
      const sw=Math.max(8,w>>4),sh=Math.max(8,h>>4);const s=document.createElement('canvas');s.width=sw;s.height=sh;const sx=s.getContext('2d');sx.drawImage(src,0,0,sw,sh);
      const sd=sx.getImageData(0,0,sw,sh);const md=new Uint8ClampedArray(sd.data);
      for(let y=0;y<sh;y++)for(let xx=0;xx<sw;xx++){for(let c=0;c<3;c++){let m=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const yy=Math.min(sh-1,Math.max(0,y+dy)),x2=Math.min(sw-1,Math.max(0,xx+dx));const v=sd.data[(yy*sw+x2)*4+c];if(v>m)m=v}md[(y*sw+xx)*4+c]=m}}
      sd.data.set(md);sx.putImageData(sd,0,0);
      const b=document.createElement('canvas');b.width=w;b.height=h;const bx=b.getContext('2d');bx.imageSmoothingQuality='high';bx.drawImage(s,0,0,w,h);bg=bx.getImageData(0,0,w,h).data}
    const cf=(259*(co+255))/(255*(259-co));
    for(let i=0;i<d.length;i+=4){
      let r=d[i],g=d[i+1],b=d[i+2];
      if(bg){const k=Math.max(40,bg[i]),k2=Math.max(40,bg[i+1]),k3=Math.max(40,bg[i+2]);
        r=Math.min(255,r/k*255);g=Math.min(255,g/k2*255);b=Math.min(255,b/k3*255);
        if(f==='gray'||f==='bw'){const y=.3*r+.59*g+.11*b;r=g=b=y}
        if(f==='bw'){r=g=b=r<165?Math.max(0,(r-70)*.9):255}
        else if(f==='magic'){const lv=v=>Math.min(255,Math.max(0,(v-45)*255/(235-45)));r=lv(r);g=lv(g);b=lv(b)}
        else if(f==='gray'){const lv=v=>Math.min(255,Math.max(0,(v-35)*255/(235-35)));r=g=b=lv(r)}}
      r=cf*(r-128)+128+br;g=cf*(g-128)+128+br;b=cf*(b-128)+128+br;
      d[i]=r<0?0:r>255?255:r;d[i+1]=g<0?0:g>255?255:g;d[i+2]=b<0?0:b>255?255:b}
    x.putImageData(id,0,0)}
  return out}
function enterFilter(){
  state.sub='filter';$('#cropBtns').hidden=true;$('#filterPane').hidden=false;
  $('#bright').value=state.bright;$('#contrast').value=state.contrast;
  document.querySelectorAll('#filters button').forEach(b=>b.classList.toggle('on',b.dataset.f===state.filter));
  renderPreview();
}
let pvTimer;
function renderPreview(now){
  clearTimeout(pvTimer);pvTimer=setTimeout(()=>{
    const prev=fitCanvas(rotate(state.warped,state.rot),1100);const o=applyFilter(prev,state.filter,state.bright,state.contrast);
    const c=$('#cv');const maxW=Math.min(innerWidth-16,900),maxH=innerHeight-300;const s=Math.min(maxW/o.width,maxH/o.height,1.5);
    c.width=Math.round(o.width*s);c.height=Math.round(o.height*s);c.getContext('2d').drawImage(o,0,0,c.width,c.height)},now?0:60)}
document.querySelectorAll('#filters button').forEach(b=>b.onclick=()=>{state.filter=b.dataset.f;document.querySelectorAll('#filters button').forEach(x=>x.classList.toggle('on',x===b));renderPreview(1)});
$('#bright').oninput=e=>{state.bright=+e.target.value;renderPreview()};
$('#contrast').oninput=e=>{state.contrast=+e.target.value;renderPreview()};
$('#rotL').onclick=()=>{state.rot-=90;renderPreview(1)};
$('#rotR').onclick=()=>{state.rot+=90;renderPreview(1)};
$('#savePage').onclick=async()=>{
  busy('جاري الحفظ...');await new Promise(r=>setTimeout(r,30));
  try{
    let full=applyFilter(rotate(state.warped,state.rot),state.filter,state.bright,state.contrast);
    if(state.idPhotoSize){const t=document.createElement('canvas');t.width=state.idPhotoSize.w;t.height=state.idPhotoSize.h;
      t.getContext('2d').drawImage(full,0,0,t.width,t.height);full=t}
    const out=await blobOf(full,.9);
    const page={orig:state.origBlob,out,w:full.width,h:full.height,corners:state.corners,filter:state.filter,bright:state.bright,contrast:state.contrast,rot:state.rot};
    if(state.editIdx>=0){state.doc.pages[state.editIdx]=page;state.doc.updated=Date.now();await putDoc(state.doc);busy('');openDoc(state.doc.id);return}
    state.newPages.push(page);busy('');nextPending();
  }catch(e){busy('');toast('فشل الحفظ: '+e.message)}
};

// ---------- doc view ----------
async function openDoc(id){
  const docs=await allDocs();state.doc=docs.find(d=>d.id===id);if(!state.doc){show('home');return renderDocs()}
  show('doc');$('#ocrBox').hidden=!state.doc.ocr;$('#ocrText').value=state.doc.ocr||'';renderPages();
}
function renderPages(){
  const box=$('#pages');box.innerHTML='';const d=state.doc;
  d.pages.forEach((p,i)=>{
    const el=document.createElement('div');el.className='pg';const im=document.createElement('img');im.src=URL.createObjectURL(p.out);el.append(im);
    const r=document.createElement('div');r.className='row';
    const mk=(t,f)=>{const b=document.createElement('button');b.innerHTML='<svg class="i" viewBox="0 0 24 24"><use href="#i-'+t+'"/></svg>';b.onclick=f;r.append(b)};
    mk('edit',()=>editPage(i));mk('chevr',()=>mv(i,-1));mk('chevl',()=>mv(i,1));mk('trash',()=>rm(i));
    el.append(r);const n=document.createElement('small');n.className='muted';n.textContent='صفحة '+(i+1);el.append(n);box.append(el)});
}
async function mv(i,dx){const d=state.doc,j=i+dx;if(j<0||j>=d.pages.length)return;[d.pages[i],d.pages[j]]=[d.pages[j],d.pages[i]];d.updated=Date.now();await putDoc(d);renderPages()}
async function rm(i){if(!confirm('حذف هذه الصفحة؟'))return;state.doc.pages.splice(i,1);state.doc.updated=Date.now();
  if(!state.doc.pages.length){await delDoc(state.doc.id);state.doc=null;show('home');return renderDocs()}
  await putDoc(state.doc);renderPages()}
async function editPage(i){
  const p=state.doc.pages[i];busy('...');const img=await loadImg(p.orig);state.img=fitCanvas(img,2400);state.origBlob=p.orig;
  state.corners=p.corners.map(q=>[...q]);state.filter=p.filter;state.bright=p.bright;state.contrast=p.contrast;state.rot=p.rot;state.editIdx=i;state.mode='edit-existing';state.pending=[];state.newPages=[];
  busy('');enterCrop();
}
$('#renameDoc').onclick=async()=>{const n=prompt('اسم المستند',state.doc.name);if(n&&n.trim()){state.doc.name=n.trim();await putDoc(state.doc);$('#title').textContent=state.doc.name}};
$('#delDoc').onclick=async()=>{if(!confirm('حذف المستند بالكامل؟'))return;await delDoc(state.doc.id);state.doc=null;show('home');renderDocs()};

// ---------- PDF ----------
async function buildPdf(doc){
  const enc=new TextEncoder();const parts=[];let off=0;const offs=[];
  const push=b=>{const u=typeof b==='string'?enc.encode(b):b;parts.push(u);off+=u.length};
  const n=doc.pages.length;push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const obj=(id,s)=>{offs[id]=off;push(id+' 0 obj\n'+s+'\nendobj\n')};
  obj(1,'<</Type/Catalog/Pages 2 0 R>>');
  obj(2,'<</Type/Pages/Kids ['+doc.pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+']/Count '+n+'>>');
  for(let i=0;i<n;i++){
    const p=doc.pages[i];const jpg=new Uint8Array(await p.out.arrayBuffer());
    const pw=595,ph=Math.round(595*p.h/p.w);const base=3+i*3;
    obj(base,`<</Type/Page/Parent 2 0 R/MediaBox [0 0 ${pw} ${ph}]/Resources<</XObject<</Im0 ${base+1} 0 R>>>>/Contents ${base+2} 0 R>>`);
    offs[base+1]=off;push(`${base+1} 0 obj\n<</Type/XObject/Subtype/Image/Width ${p.w}/Height ${p.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpg.length}>>\nstream\n`);push(jpg);push('\nendstream\nendobj\n');
    const cs=`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;obj(base+2,`<</Length ${cs.length}>>\nstream\n${cs}\nendstream`)}
  const total=3+n*3;const xref=off;let x='xref\n0 '+total+'\n0000000000 65535 f \n';
  for(let i=1;i<total;i++)x+=String(offs[i]).padStart(10,'0')+' 00000 n \n';
  push(x+`trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'});
}
function safeName(s){return s.replace(/[\\/:*?"<>|]+/g,'_')}
async function shareOrSave(files,title){
  if(navigator.canShare&&navigator.canShare({files})){try{await navigator.share({files,title});return}catch(e){if(e.name==='AbortError')return}}
  for(const f of files){const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.append(a);a.click();a.remove()}
}
async function exportDocPdf(d){busy('جاري إنشاء PDF...');try{const b=await buildPdf(d);busy('');await shareOrSave([new File([b],safeName(d.name)+'.pdf',{type:'application/pdf'})],d.name)}catch(e){busy('');toast('فشل: '+e.message)}}
async function shareDocImgs(d){await shareOrSave(d.pages.map((p,i)=>new File([p.out],safeName(d.name)+'-'+(i+1)+'.jpg',{type:'image/jpeg'})),d.name)}
$('#exportPdf').onclick=()=>exportDocPdf(state.doc);
$('#shareImgs').onclick=()=>shareDocImgs(state.doc);

// ---------- OCR ----------
async function ocrImages(blobs){
  await loadTesseract();let text='';
  const worker=await Tesseract.createWorker('ara+eng',1,{logger:m=>{if(m.status)$('#busyText').textContent='OCR '+(m.progress?Math.round(m.progress*100)+'%':m.status)}});
  for(let i=0;i<blobs.length;i++){$('#busyText').textContent='صورة '+(i+1)+'/'+blobs.length;const img=await loadImg(blobs[i]);const r=await worker.recognize(img);text+=(i?'\n\n':'')+r.data.text.trim()}
  await worker.terminate();return text}
$('#ocrBtn').onclick=async()=>{
  try{
    busy('تحميل محرك OCR...');const d=state.doc;
    const text=await ocrImages(d.pages.map(p=>p.out));
    d.ocr=text;await putDoc(d);$('#ocrText').value=text;$('#ocrBox').hidden=false;busy('');
  }catch(e){busy('');toast('فشل OCR: '+e.message)}
};
$('#copyOcr').onclick=async()=>{try{await navigator.clipboard.writeText($('#ocrText').value);toast('تم النسخ')}catch(e){$('#ocrText').select();document.execCommand('copy');toast('تم النسخ')}};
$('#shareOcr').onclick=async()=>{const t=$('#ocrText').value;if(navigator.share){try{await navigator.share({text:t})}catch(e){}}else{await shareOrSave([new File([t],safeName(state.doc.name)+'.txt',{type:'text/plain'})])}};

// ---------- OCR tool (standalone) ----------
$('#ocrPick').onclick=()=>$('#ocrToolInput').click();
$('#ocrToolInput').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  try{busy('تحميل محرك OCR...');const text=await ocrImages(files);busy('');
    $('#ocrToolText').value=text||'(لم يتم العثور على نص)';$('#ocrToolBox').hidden=false;
  }catch(err){busy('');toast('فشل OCR: '+err.message)}};
$('#ocrToolCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('#ocrToolText').value);toast('تم النسخ')}catch(e){$('#ocrToolText').select();document.execCommand('copy');toast('تم النسخ')}};
$('#ocrToolShare').onclick=async()=>{const t=$('#ocrToolText').value;if(navigator.share){try{await navigator.share({text:t})}catch(e){}}else{await shareOrSave([new File([t],'نص.txt',{type:'text/plain'})])}};
$('#ocrToolSave').onclick=()=>shareOrSave([new File([$('#ocrToolText').value],'نص.txt',{type:'text/plain'})]);

// ---------- PDF tools ----------
$('#pdfFromImgs').onclick=()=>$('#pdfImgsInput').click();
$('#pdfImgsInput').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  try{busy('جاري إنشاء PDF...');await loadPdfLib();const doc=await PDFLib.PDFDocument.create();
    for(const f of files){const img=await loadImg(f);const c=fitCanvas(img,2400);const jpg=new Uint8Array(await (await blobOf(c,.9)).arrayBuffer());
      const emb=await doc.embedJpg(jpg);const pw=595,ph=595*c.height/c.width;const p=doc.addPage([pw,ph]);p.drawImage(emb,{x:0,y:0,width:pw,height:ph})}
    const b=new Blob([await doc.save()],{type:'application/pdf'});busy('');await shareOrSave([new File([b],'صور.pdf',{type:'application/pdf'})],'PDF');
  }catch(err){busy('');toast('فشل: '+err.message)}};
$('#pdfMerge').onclick=()=>$('#pdfMergeInput').click();
$('#pdfMergeInput').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(files.length<2)return toast('اختر ملفين PDF على الأقل');
  try{busy('جاري الدمج...');await loadPdfLib();const out=await PDFLib.PDFDocument.create();
    for(const f of files){const src=await PDFLib.PDFDocument.load(await f.arrayBuffer(),{ignoreEncryption:true});(await out.copyPages(src,src.getPageIndices())).forEach(p=>out.addPage(p))}
    const b=new Blob([await out.save()],{type:'application/pdf'});busy('');await shareOrSave([new File([b],'مدمج.pdf',{type:'application/pdf'})],'دمج PDF');
  }catch(err){busy('');toast('فشل الدمج: '+err.message)}};
$('#pdfSplitPick').onclick=()=>$('#pdfSplitInput').click();
$('#pdfSplitInput').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{busy('قراءة الملف...');await loadPdfLib();state.splitSrc=await PDFLib.PDFDocument.load(await f.arrayBuffer(),{ignoreEncryption:true});
    const n=state.splitSrc.getPageCount();$('#splitInfo').textContent='الملف: '+f.name+' — '+n+' صفحة';
    $('#splitFrom').value=1;$('#splitFrom').max=n;$('#splitTo').max=n;$('#splitTo').value=n;$('#splitBox').hidden=false;busy('');
  }catch(err){busy('');toast('فشل قراءة PDF: '+err.message)}};
$('#splitGo').onclick=async()=>{
  try{const n=state.splitSrc.getPageCount();const a=Math.max(1,Math.min(n,+$('#splitFrom').value||1)),b=Math.max(a,Math.min(n,+$('#splitTo').value||n));
    busy('جاري الاستخراج...');const out=await PDFLib.PDFDocument.create();const idx=[];for(let i=a-1;i<b;i++)idx.push(i);
    (await out.copyPages(state.splitSrc,idx)).forEach(p=>out.addPage(p));
    const bl=new Blob([await out.save()],{type:'application/pdf'});busy('');await shareOrSave([new File([bl],'صفحات-'+a+'-'+b+'.pdf',{type:'application/pdf'})]);
  }catch(err){busy('');toast('فشل: '+err.message)}};
$('#pdfToDoc').onclick=()=>$('#pdfDocInput').click();
$('#pdfDocInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)importPdf(f)};
async function importPdf(file){
  try{busy('تحميل قارئ PDF...');await loadPdfjs();
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){busy('تحويل صفحة '+i+'/'+pdf.numPages);
      const pg=await pdf.getPage(i);const base=pg.getViewport({scale:1});const scale=Math.min(2.5,2200/base.width);const vp=pg.getViewport({scale});
      const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
      await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      const out=await blobOf(c,.92);pages.push({orig:out,out,w:c.width,h:c.height,corners:[[0,0],[1,0],[1,1],[0,1]],filter:'original',bright:0,contrast:0,rot:0});}
    const d={id:uid(),name:file.name.replace(/\.pdf$/i,'')||'ملف PDF',created:Date.now(),updated:Date.now(),pages};
    await putDoc(d);busy('');toast('تم تحويل PDF إلى مستند');openDoc(d.id);
  }catch(e){busy('');toast('فشل استيراد PDF: '+e.message)}}

// ---------- ID card ----------
function renderIdcard(){
  [['#idFront','front'],['#idBack','back']].forEach(([sel,k])=>{
    const el=$(sel),b=state.idcard[k];
    if(b){el.style.backgroundImage='url('+URL.createObjectURL(b)+')';el.classList.add('done')}
    else{el.style.backgroundImage='';el.classList.remove('done')}});
  $('#idCreate').disabled=!(state.idcard.front&&state.idcard.back)}
$('#idFront').onclick=()=>{state.idSlot='front';openCamera('idcard')};
$('#idBack').onclick=()=>{state.idSlot='back';openCamera('idcard')};
$('#idFrontGal').onclick=()=>$('#idFrontInput').click();
$('#idBackGal').onclick=()=>$('#idBackInput').click();
$('#idFrontInput').onchange=e=>{if(e.target.files[0]){state.idcard.front=e.target.files[0];renderIdcard()}e.target.value=''};
$('#idBackInput').onchange=e=>{if(e.target.files[0]){state.idcard.back=e.target.files[0];renderIdcard()}e.target.value=''};
$('#idReset').onclick=()=>{state.idcard={front:null,back:null};renderIdcard()};
$('#idCreate').onclick=async()=>{
  busy('جاري إنشاء البطاقة...');await new Promise(r=>setTimeout(r,30));
  try{
    const A4w=2480,A4h=3508;const c=document.createElement('canvas');c.width=A4w;c.height=A4h;const x=c.getContext('2d');
    x.fillStyle='#fff';x.fillRect(0,0,A4w,A4h);
    const drawFit=async(blob,cy)=>{const img=await loadImg(blob);const maxW=A4w-240,maxH=(A4h-420)/2;
      const s=Math.min(maxW/(img.naturalWidth||img.width),maxH/(img.naturalHeight||img.height));
      const w=(img.naturalWidth||img.width)*s,h=(img.naturalHeight||img.height)*s;
      x.drawImage(img,(A4w-w)/2,cy,w,h);x.strokeStyle='#d4d4d4';x.lineWidth=4;x.strokeRect((A4w-w)/2,cy,w,h)};
    await drawFit(state.idcard.front,140);await drawFit(state.idcard.back,A4h/2+70);
    const out=await blobOf(c,.92);
    const page={orig:out,out,w:A4w,h:A4h,corners:[[0,0],[1,0],[1,1],[0,1]],filter:'original',bright:0,contrast:0,rot:0};
    const d={id:uid(),name:'بطاقة هوية '+new Date().toLocaleDateString('ar-EG'),created:Date.now(),updated:Date.now(),pages:[page]};
    await putDoc(d);state.idcard={front:null,back:null};busy('');openDoc(d.id);
  }catch(e){busy('');toast('فشل: '+e.message)}};

// ---------- ID photo ----------
document.querySelectorAll('.sz').forEach(b=>b.onclick=()=>{state.idPhotoSize={w:+b.dataset.w,h:+b.dataset.h};$('#idPhotoInput').click()});
$('#idPhotoInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f){state.doc=null;startQueue([f])}else{state.idPhotoSize=null}};

// ---------- me ----------
async function updStorage(){try{const e=await navigator.storage.estimate();const mb=(e.usage/1048576).toFixed(1);
  $('#storageInfo').textContent='المساحة المستخدمة: '+mb+' ميجابايت'}catch(e){$('#storageInfo').textContent='البيانات محفوظة على جهازك فقط'}}
let dp;addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;$('#installBtn').hidden=false});
$('#installBtn').onclick=async()=>{if(dp){dp.prompt();await dp.userChoice;dp=null;$('#installBtn').hidden=true}};
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
idb.then(()=>{const qv=new URLSearchParams(location.search).get('v');show(views.includes(qv)?qv:'home');renderDocs()});
