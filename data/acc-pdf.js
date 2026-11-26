/* data/acc-pdf.js — «تصدير PDF / Export PDF» on the Control Center statistics view (/admin/#home).
   Builds a designed A4 statistics report (header, key figures, charts, tables) from the figures shown on the view;
   the user picks "Save as PDF". Reads nothing from the API and changes no data. Browser file: ES5 only.
   Loaded by panel.part.py after data/acc.js. */
(function(){
 if(window.__statsPdf)return;window.__statsPdf=2;
 var RX=/^(الإحصائيات|Statistics)$/;
 var SKIP={BUTTON:1,SELECT:1,INPUT:1,TEXTAREA:1,SCRIPT:1,STYLE:1,SVG:1,CANVAS:1,IMG:1,OPTION:1};
 function $(s,r){return (r||document).querySelector(s)}
 function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
 function trim(s){return String(s==null?"":s).replace(/\s+/g," ").replace(/^\s+|\s+$/g,"")}
 function EN(){return String(document.documentElement.lang||"").toLowerCase().indexOf("en")===0}
 function T(a,e){return EN()?e:a}
 function E(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
 function titleEl(){return $("main #vt")||$("main #ph h1")||$("main h1")||$("main h2")}
 function main(){return $("main")}
 function onStats(){var t=titleEl();return !!(t&&RX.test(trim(t.textContent)))}
 function shown(el){if(!el.getClientRects||!el.getClientRects().length)return false;var cs=getComputedStyle(el);return cs.visibility!=="hidden"&&cs.display!=="none"}
 function letters(s){return s.replace(/[^A-Za-zء-ي]/g,"").length}
 function isNum(s){return s.length<=18&&/[\d٠-٩]/.test(s)&&letters(s)<=4}
 function isSym(s){return !/[A-Za-zء-ي\d٠-٩]/.test(s)}
 function fs(el){return parseFloat(getComputedStyle(el).fontSize)||0}
 /* text pieces of an element, in reading order: one piece per run of direct text, <br> splits a run */
 function pieces(el,stop){var out=[];
  function walk(n){if(n.nodeType!==1)return;var tg=String(n.tagName).toUpperCase();if(SKIP[tg]||n.id==="sp-pdf"||(stop&&stop(n))||!shown(n))return;var buf="",c;
   function flush(){var t=trim(buf);buf="";if(t)out.push({t:t,el:n,sym:isSym(t)})}
   for(c=n.firstChild;c;c=c.nextSibling){if(c.nodeType===3)buf+=c.nodeValue;else if(c.nodeType===1){if(String(c.tagName).toUpperCase()==="BR"){flush()}else{flush();walk(c)}}}
   flush()}
  walk(el);return out}
 function words(p){var o=[];for(var i=0;i<p.length;i++)if(!p[i].sym)o.push(p[i]);return o}
 function inAny(el,list){for(var i=0;i<list.length;i++)if(list[i]===el||list[i].contains(el))return true;return false}
 function hasAny(el,list){for(var i=0;i<list.length;i++)if(el===list[i]||el.contains(list[i]))return true;return false}

 /* ---------- read the statistics off the view ---------- */
 function readKpis(root){var all=$$("*",root),cand=[],i,k;
  for(i=0;i<all.length;i++){var el=all[i],tg=String(el.tagName).toUpperCase();if(SKIP[tg]||tg==="TABLE"||el.closest("table,svg,button,#sp-pdf"))continue;if(el.querySelectorAll("*").length>12||!shown(el))continue;
   var p=words(pieces(el));if(p.length<2||p.length>4)continue;var v=null,l=null;
   for(k=0;k<p.length;k++){if(isNum(p[k].t)){if(!v||fs(p[k].el)>fs(v.el))v=p[k]}else if(!l)l=p[k]}
   if(!v||!l)continue;var fv=fs(v.el),fl=fs(l.el);if(fv<17||fv<fl*1.2)continue;var note=[];for(k=0;k<p.length;k++)if(p[k]!==v&&p[k]!==l)note.push(p[k].t);
   cand.push({el:el,label:l.t,value:v.t,note:note.join(" · ")})}
  var out=[];for(i=0;i<cand.length;i++){var deeper=false;for(k=0;k<cand.length;k++)if(k!==i&&cand[i].el!==cand[k].el&&cand[i].el.contains(cand[k].el)){deeper=true;break}if(!deeper)out.push(cand[i])}
  return out.length>=2?out:[]}
 function cloneSvg(svg){var c=svg.cloneNode(true),r=svg.getBoundingClientRect(),P=["fill","fill-opacity","stroke","stroke-width","stroke-dasharray","stroke-opacity","stroke-linecap","stroke-linejoin","opacity","font-size","font-weight","text-anchor","dominant-baseline"];
  if(!c.getAttribute("viewBox"))c.setAttribute("viewBox","0 0 "+Math.round(r.width)+" "+Math.round(r.height));
  c.removeAttribute("width");c.removeAttribute("height");c.removeAttribute("style");c.setAttribute("class","spx-svg");c.style.aspectRatio=Math.round(r.width)+" / "+Math.round(r.height);
  var a=svg.querySelectorAll("*"),b=c.querySelectorAll("*");if(a.length===b.length)for(var i=0;i<a.length;i++){var cs=getComputedStyle(a[i]);for(var k=0;k<P.length;k++){var val=cs.getPropertyValue(P[k]);if(val)b[i].style.setProperty(P[k],val)}b[i].removeAttribute("class")}
  return c}
 function readTable(tb){var rows=$$("tr",tb),head=null,body=[],i,k;
  for(i=0;i<rows.length;i++){if(!shown(rows[i]))continue;var cells=rows[i].children,r=[],isH=cells.length>0;for(k=0;k<cells.length;k++){var w=words(pieces(cells[k])),t=[];for(var z=0;z<w.length;z++)t.push(w[z].t);r.push(t.join(" "));if(String(cells[k].tagName).toUpperCase()!=="TH")isH=false}
   if(isH&&!head)head=r;else body.push(r)}
  var n=0;for(i=0;i<body.length;i++)n=Math.max(n,body[i].length);if(head)n=Math.max(n,head.length);var keep=[];
  for(k=0;k<n;k++){var any=false;for(i=0;i<body.length;i++)if(body[i][k]){any=true;break}if(any)keep.push(k)}
  function pick(r){var o=[];for(var q=0;q<keep.length;q++)o.push(r[keep[q]]||"");return o}
  var o=[];for(i=0;i<body.length;i++)o.push(pick(body[i]));return {head:head?pick(head):null,rows:o}}
 function rowGroup(nodes,stop,total){var q=nodes.slice(0);
  while(q.length){var P=q.shift();if(!P||P.nodeType!==1||SKIP[String(P.tagName).toUpperCase()]||stop(P)||!shown(P))continue;var kids=P.children,g={},best=null,i;
   for(i=0;i<kids.length;i++){if(!shown(kids[i])||stop(kids[i]))continue;var sg=kids[i].tagName+"|"+(typeof kids[i].className==="string"?kids[i].className:"");(g[sg]=g[sg]||[]).push(kids[i])}
   for(var s in g)if(g.hasOwnProperty(s)&&g[s].length>=2&&(!best||g[s].length>best.length))best=g[s];
   if(best){var cnt=0,ok=true;for(i=0;i<best.length;i++){var w=words(pieces(best[i],stop)).length;if(!w)ok=false;cnt+=w}if(ok&&cnt>=total*0.5)return best}
   for(i=0;i<kids.length;i++)q.push(kids[i])}
  return null}
 function readSection(H,heads,kpiEls,root){var C=H;
  function nh(el){var n=0;for(var i=0;i<heads.length;i++)if(el.contains(heads[i]))n++;return n}
  while(C.parentElement&&C.parentElement!==root&&root.contains(C.parentElement)&&nh(C.parentElement)===1&&!hasAny(C.parentElement,kpiEls))C=C.parentElement;
  var nodes=[];if(C===H){for(var s=H.nextElementSibling;s&&heads.indexOf(s)<0&&!hasAny(s,heads);s=s.nextElementSibling)nodes.push(s)}else nodes=[C];
  var hp=words(pieces(H)),sec={title:hp.length?hp[0].t:trim(H.textContent),figs:[],tables:[],rows:null,notes:[]},used=[],i,k;for(i=1;i<hp.length&&i<3;i++)sec.notes.push([{t:hp[i].t}]);
  function stop(n){return n===H||inAny(n,used)||inAny(n,kpiEls)}
  for(i=0;i<nodes.length;i++){var tbs=nodes[i].tagName==="TABLE"?[nodes[i]]:$$("table",nodes[i]);for(k=0;k<tbs.length;k++){if(!shown(tbs[k])||inAny(tbs[k],used))continue;var t=readTable(tbs[k]);if(t.rows.length)sec.tables.push(t);used.push(tbs[k])}}
  for(i=0;i<nodes.length;i++){var gs=$$("svg,canvas",nodes[i]);for(k=0;k<gs.length;k++){var g=gs[k],r=g.getBoundingClientRect();if(r.width<120||r.height<50||inAny(g,used)||!shown(g))continue;
    if(String(g.tagName).toUpperCase()==="CANVAS"){try{var im=E("img","spx-img");im.src=g.toDataURL("image/png");sec.figs.push(im)}catch(e){}}else sec.figs.push(cloneSvg(g));used.push(g)}}
  var total=0;for(i=0;i<nodes.length;i++)total+=words(pieces(nodes[i],stop)).length;
  var grp=total?rowGroup(nodes,stop,total):null;
  if(grp&&sec.figs.length&&grp.length<=8){var lg=[],one=true;for(i=0;i<grp.length;i++){var lw=words(pieces(grp[i],stop));if(lw.length!==1){one=false;break}var col=null,em=$$("*",grp[i]);for(k=0;k<em.length;k++){if(!em[k].children.length&&!trim(em[k].textContent)){var bg=getComputedStyle(em[k]).backgroundColor;if(bg&&bg!=="transparent"&&!/rgba\(\s*0,\s*0,\s*0,\s*0\)/.test(bg)){col=bg;break}}}if(col)lg.push({sym:1,color:col});lg.push({t:lw[0].t})}
   if(one){sec.notes.push(lg);for(i=0;i<grp.length;i++)used.push(grp[i]);grp=null}}
  if(grp){sec.rows=[];for(i=0;i<grp.length;i++){var w=pieces(grp[i],stop),cells=[];for(k=0;k<w.length;k++)if(!/^[\u25A0-\u25FF\u2B1B\u2022\s]+$/.test(w[k].t))cells.push(w[k].t);var pct=null,bars=$$("[style*='width']",grp[i]);for(k=0;k<bars.length;k++){var m=/^([\d.]+)%$/.exec(bars[k].style.width||"");if(m&&bars[k].children.length===0&&!trim(bars[k].textContent)){pct=parseFloat(m[1]);break}}sec.rows.push({c:cells,pct:pct})}for(i=0;i<grp.length;i++)used.push(grp[i])}
  var legend=[],hasT=false;
  for(i=0;i<nodes.length;i++){var p=pieces(nodes[i],stop);for(k=0;k<p.length;k++){if(p[k].sym){if(/[\u25A0-\u25FF\u2B1B\u2022]/.test(p[k].t))legend.push({sym:1,color:getComputedStyle(p[k].el).color});continue}
    if(legend.length&&legend[legend.length-1].sym){legend.push({t:p[k].t});hasT=true}else if(sec.notes.length<6)sec.notes.push([{t:p[k].t}])}}
  if(hasT)sec.notes.unshift(legend);
  if(!sec.rows&&!sec.figs.length&&sec.notes.length>=2&&sec.notes.length%2===0){var pr=true;for(i=0;i<sec.notes.length;i++){var nt=sec.notes[i];if(nt.length!==1||isNum(nt[0].t)!==(i%2===1)){pr=false;break}}
   if(pr){sec.rows=[];for(i=0;i<sec.notes.length;i+=2)sec.rows.push({c:[sec.notes[i][0].t,sec.notes[i+1][0].t],pct:null});sec.notes=[]}}
  return sec}
 function read(){var root=main(),te=titleEl(),sub="";if(te&&te.parentElement){var sm=te.parentElement.querySelector("small,.sub,p");if(sm&&sm!==te)sub=trim(sm.textContent).slice(0,60)}
  var kp=readKpis(root),kpiEls=[],i;for(i=0;i<kp.length;i++)kpiEls.push(kp[i].el);
  var heads=$$("h2,h3,h4",root).filter(function(h){return h!==te&&shown(h)&&trim(h.textContent)&&!inAny(h,kpiEls)&&!h.closest("#sp-sheet")}),secs=[];
  for(i=0;i<heads.length;i++){var s=readSection(heads[i],heads,kpiEls,root);if(s.figs.length||s.tables.length||s.rows||s.notes.length)secs.push(s)}
  return {sub:sub,kpis:kp,secs:secs}}

 /* ---------- lay the report out ---------- */
 function pad(n){return (n<10?"0":"")+n}
 function stamp(){var d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes())}
 function host(){return location.hostname.replace(/^www\./,"")}
 function site(){return T("منصة صنع في مصر","Made in Egypt Gate")}
 function num(s){var m=String(s).replace(/[٠-٩]/g,function(c){return c.charCodeAt(0)-0x0660}).replace(/[,٬\s]/g,"");return /^-?[\d.]+%?$/.test(m)?parseFloat(m):NaN}
 function secEl(sec){var box=E("div","spx-sec"),body=E("div","spx-sb"),i,k,wide=false;box.appendChild(E("div","spx-st",sec.title));
  for(i=0;i<sec.figs.length;i++){body.appendChild(sec.figs[i]);wide=true}
  for(i=0;i<sec.tables.length;i++){var t=sec.tables[i],tb=E("table","spx-t"),cap=60;if(t.head){var th=E("thead"),hr=E("tr");for(k=0;k<t.head.length;k++)hr.appendChild(E("th",null,t.head[k]));th.appendChild(hr);tb.appendChild(th)}var bd=E("tbody");
   for(var r=0;r<t.rows.length&&r<cap;r++){var tr=E("tr");for(k=0;k<t.rows[r].length;k++)tr.appendChild(E("td",null,t.rows[r][k]));bd.appendChild(tr)}tb.appendChild(bd);body.appendChild(tb);
   if(t.rows.length>cap)body.appendChild(E("div","spx-note",T("… و "+(t.rows.length-cap)+" صف آخر في اللوحة","… and "+(t.rows.length-cap)+" more rows in the panel")));
   if((t.rows[0]||[]).length>3||t.rows.length>12){wide=true;box.className+=" spx-long"}}
  if(sec.rows){var tb2=E("table","spx-t spx-r"),bd2=E("tbody"),mx=0,vals=[];
   for(i=0;i<sec.rows.length;i++){var c=sec.rows[i].c,v=c.length>1?num(c[c.length-1]):NaN;vals.push(v);if(!isNaN(v)&&v>mx)mx=v}
   for(i=0;i<sec.rows.length;i++){var cc=sec.rows[i].c,tr2=E("tr"),last=cc.length>1&&(isNum(cc[cc.length-1])||cc[cc.length-1].length<=16)?cc[cc.length-1]:null,mid=cc.slice(1,last!==null?cc.length-1:cc.length),td=E("td");
    td.appendChild(E("div","spx-rl",cc[0]));if(mid.length)td.appendChild(E("div","spx-rm",mid.join(" · ")));
    var pc=sec.rows[i].pct;if(pc===null&&mx>0&&!isNaN(vals[i])&&!/%$/.test(cc[cc.length-1]))pc=vals[i]/mx*100;if(pc===null&&/%$/.test(cc[cc.length-1]||"")&&!isNaN(vals[i]))pc=vals[i];
    if(pc!==null){var bar=E("div","spx-bar"),fill=E("i");fill.style.width=Math.max(0,Math.min(100,pc))+"%";bar.appendChild(fill);td.appendChild(bar)}
    tr2.appendChild(td);if(last!==null)tr2.appendChild(E("td",isNum(last)?"n":"g",last));bd2.appendChild(tr2)}
   tb2.appendChild(bd2);body.appendChild(tb2);if(sec.rows.length>14){wide=false;box.className+=" spx-long"}}
  for(i=0;i<sec.notes.length;i++){var ln=E("div","spx-note"),L=sec.notes[i];for(k=0;k<L.length;k++){if(L[k].sym){var chip=E("i","spx-chip");chip.style.background=L[k].color;ln.appendChild(chip)}else ln.appendChild(E("span",L[k+1]&&L[k+1].sym?"spx-gap":null,L[k].t+" "))}body.appendChild(ln)}
  box.appendChild(body);var wt=3+sec.notes.length;if(sec.rows)for(i=0;i<sec.rows.length;i++)wt+=sec.rows[i].c.length>2?1.5:1;for(i=0;i<sec.tables.length;i++)wt+=sec.tables[i].rows.length+1;return {el:box,wide:wide,wt:wt}}
 function sheet(){drop();var d=read(),rtl=getComputedStyle(document.body).direction==="rtl"||document.documentElement.dir==="rtl";
  var sh=E("div");sh.id="sp-sheet";sh.setAttribute("dir",rtl?"rtl":"ltr");sh.setAttribute("lang",EN()?"en":"ar");
  var frame=E("table","spx-frame"),th=E("thead"),tf=E("tfoot"),tb=E("tbody"),r1=E("tr"),r2=E("tr"),r3=E("tr"),c1=E("td"),c2=E("td"),c3=E("td","spx-pad");
  c1.appendChild(E("div","spx-sp"));c2.appendChild(E("div","spx-sp"));r1.appendChild(c1);th.appendChild(r1);r2.appendChild(c2);tf.appendChild(r2);r3.appendChild(c3);tb.appendChild(r3);frame.appendChild(th);frame.appendChild(tf);frame.appendChild(tb);sh.appendChild(frame);
  var hd=E("div","spx-hd"),a=E("div"),m=E("div","spx-meta");a.appendChild(E("div","spx-brand",site()));a.appendChild(E("div","spx-doc",T("تقرير الإحصائيات","Statistics report")+(d.sub?" — "+d.sub:"")));
  var l1=E("div");l1.appendChild(E("span",null,T("تاريخ الإصدار: ","Issued: ")));l1.appendChild(E("b","spx-ltr",stamp()));var l2=E("div","spx-ltr",host());m.appendChild(l1);m.appendChild(l2);hd.appendChild(a);hd.appendChild(m);c3.appendChild(hd);
  if(d.kpis.length){c3.appendChild(E("div","spx-h",T("المؤشرات الرئيسية","Key figures")));var kp=E("div","spx-kp");for(var i=0;i<d.kpis.length;i++){var k=E("div","spx-k");k.appendChild(E("span",null,d.kpis[i].label));k.appendChild(E("b",null,d.kpis[i].value));k.appendChild(E("small",null,d.kpis[i].note||" "));kp.appendChild(k)}c3.appendChild(kp)}
  if(d.secs.length){c3.appendChild(E("div","spx-h",T("التفاصيل","Details")));var hold=null,w1=0,w2=0;
   for(var j=0;j<d.secs.length;j++){var s=secEl(d.secs[j]);if(s.wide){hold=null;c3.appendChild(s.el);continue}
    if(!hold){hold=E("div","spx-two");hold.appendChild(E("div","spx-col"));hold.appendChild(E("div","spx-col"));c3.appendChild(hold);w1=0;w2=0}
    if(w1<=w2){hold.firstChild.appendChild(s.el);w1+=s.wt}else{hold.lastChild.appendChild(s.el);w2+=s.wt}}}
  if(!d.kpis.length&&!d.secs.length)c3.appendChild(E("div","spx-note",T("لا توجد بيانات ظاهرة في صفحة الإحصائيات.","No figures are shown on the statistics view.")));
  var ft=E("div","spx-ft");ft.appendChild(E("span",null,T("تقرير مُستخرج آليًا من لوحة التحكم","Generated from the Control Center")));ft.appendChild(E("span","spx-ltr",host()+"  ·  "+stamp()));c3.appendChild(ft);
  document.body.appendChild(sh);return d}
 function drop(){var x=document.getElementById("sp-sheet");if(x&&x.parentNode)x.parentNode.removeChild(x)}

 var S="#sp-sheet",CSS=[
  S+"{display:none;background:#fff;color:#1f2937;font-size:10pt;line-height:1.5;text-align:start}",
  S+" *{all:revert;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
  S+" input,"+S+" button,"+S+" select,"+S+" textarea{display:none!important}",S+" .spx-frame{width:100%;border-collapse:collapse;border-spacing:0;table-layout:fixed}",S+" .spx-frame>*>tr>td{padding:0;border:0}",S+" .spx-frame>tbody>tr>td.spx-pad{padding:0 12mm}",S+" .spx-sp{height:11mm}",
  S+" .spx-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;padding-bottom:4mm;border-bottom:.8mm solid #12324a;margin-bottom:6mm}",
  S+" .spx-brand{font-size:19pt;font-weight:800;color:#12324a;line-height:1.3}",S+" .spx-doc{font-size:11pt;font-weight:700;color:#0e7490;margin-top:.5mm}",
  S+" .spx-meta{font-size:8.5pt;color:#4b5563;text-align:end;line-height:1.7;white-space:nowrap}",S+" .spx-meta b{color:#12324a}",S+" .spx-ltr{direction:ltr;unicode-bidi:isolate;display:inline-block}",
  S+" .spx-h{font-size:11.5pt;font-weight:800;color:#12324a;margin:0 0 3mm;padding-inline-start:2.5mm;border-inline-start:1.2mm solid #0e7490;line-height:1.3;break-after:avoid;page-break-after:avoid}",
  S+" .spx-kp{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:7mm}",
  S+" .spx-k{border:.3mm solid #d7dee6;border-radius:2.5mm;padding:2.8mm 3.5mm;background:#f6f9fb;break-inside:avoid;page-break-inside:avoid;min-width:0}",
  S+" .spx-k span{display:block;font-size:8.5pt;color:#4b5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  S+" .spx-k b{display:block;font-size:17pt;font-weight:800;color:#12324a;line-height:1.35;unicode-bidi:plaintext}",S+"[dir=rtl] .spx-k b{text-align:right}",
  S+" .spx-k small{display:block;font-size:7.5pt;color:#6b7280;line-height:1.4}",
  S+" .spx-sec{border:.3mm solid #d7dee6;border-radius:2.5mm;margin-bottom:5mm;break-inside:avoid;page-break-inside:avoid;min-width:0;background:#fff}",S+" .spx-sec.spx-long{break-inside:auto;page-break-inside:auto}",
  S+" .spx-st{font-size:10pt;font-weight:800;color:#12324a;background:#eef3f7;padding:1.8mm 3.5mm;border-bottom:.3mm solid #d7dee6;border-radius:2.2mm 2.2mm 0 0;break-after:avoid;page-break-after:avoid}",
  S+" .spx-sb{padding:2mm 3.5mm 2.5mm}",
  S+" .spx-two{display:grid;grid-template-columns:1fr 1fr;gap:0 5mm;align-items:start}",S+" .spx-col{min-width:0}",
  S+" .spx-t{width:100%;border-collapse:collapse;border-spacing:0;font-size:9pt}",
  S+" .spx-t td,"+S+" .spx-t th{padding:1.5mm 1mm;border:0;border-bottom:.2mm solid #e5eaf0;text-align:start;vertical-align:middle;overflow-wrap:anywhere}",
  S+" .spx-t th{font-weight:700;font-size:8.5pt;color:#4b5563;background:#fafbfc}",S+" .spx-t tbody tr:last-child td{border-bottom:0}",S+" .spx-t tr{break-inside:avoid;page-break-inside:avoid}",
  S+" .spx-r td.n{text-align:end;font-weight:800;color:#12324a;white-space:nowrap;width:1%}",S+" .spx-r td.g{text-align:end;color:#4b5563;font-size:8.5pt;white-space:nowrap;width:1%}",S+" .spx-t th{white-space:nowrap}",
  S+" .spx-rl{font-weight:600;color:#1f2937;unicode-bidi:plaintext}",S+"[dir=rtl] .spx-rl{text-align:right}",S+" .spx-rm{font-size:8pt;color:#6b7280}",
  S+" .spx-bar{height:1.2mm;background:#e5eaf0;border-radius:1mm;margin-top:1mm;overflow:hidden}",S+" .spx-bar i{display:block;height:100%;background:#0e7490;border-radius:1mm}",
  S+" .spx-note{font-size:8.5pt;color:#6b7280;padding:.8mm 0}",S+" .spx-chip{display:inline-block;width:2.6mm;height:2.6mm;border-radius:.6mm;margin-inline-end:1.2mm;vertical-align:middle}",S+" .spx-gap{margin-inline-end:4mm}",
  S+" .spx-svg{display:block;width:100%;height:auto;max-height:72mm;margin:1mm 0}",S+" .spx-img{display:block;max-width:100%;max-height:80mm;margin:1mm auto}",
  S+" .spx-ft{display:flex;justify-content:space-between;gap:6mm;margin-top:6mm;padding-top:2.5mm;border-top:.3mm solid #d7dee6;font-size:8pt;color:#6b7280}"
 ].join("\n");
 function mode(p){return "html."+p+",body."+p+"{display:block!important;position:static!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;background:#fff!important;transform:none!important;zoom:1!important}\nbody."+p+">*:not(#sp-sheet){display:none!important}\nbody."+p+">#sp-sheet{display:block!important}"}
 var css=document.createElement("style");css.id="sp-css";
 css.textContent=CSS+"\n#sp-pdf{margin-inline-start:8px;margin-inline-end:8px;cursor:pointer}\n@media print{@page{size:A4;margin:0}\n"+mode("sp-on")+"}\n"+mode("sp-preview")+"\nbody.sp-preview>#sp-sheet{width:210mm;margin:0 auto!important;box-shadow:0 0 0 1px #cbd5e1}";
 document.head.appendChild(css);

 var oldTitle=null;
 function done(){document.documentElement.classList.remove("sp-on");document.body.classList.remove("sp-on");drop();if(oldTitle!==null){document.title=oldTitle;oldTitle=null}}
 function go(){if(!onStats())return;sheet();document.documentElement.classList.add("sp-on");document.body.classList.add("sp-on");oldTitle=document.title;document.title="stats-"+host()+"-"+stamp().slice(0,10);setTimeout(function(){window.print()},150)}
 window.addEventListener("afterprint",done);
 window.__statsPdfPreview=function(on){if(on){var d=sheet();document.documentElement.classList.add("sp-preview");document.body.classList.add("sp-preview");return d}document.documentElement.classList.remove("sp-preview");document.body.classList.remove("sp-preview");drop()};
 function place(){var m=main();if(!m)return;var b=document.getElementById("sp-pdf");if(!onStats()){if(b)b.parentNode.removeChild(b);return}if(b&&m.contains(b)&&b.getAttribute("data-l")===(EN()?"en":"ar"))return;if(b&&b.parentNode)b.parentNode.removeChild(b);
  var te=titleEl(),ref=null,bs=m.querySelectorAll("button"),k;for(k=0;k<bs.length;k++){if(/تحديث|Refresh/.test(bs[k].textContent)){ref=bs[k];break}}
  b=document.createElement("button");b.id="sp-pdf";b.type="button";b.textContent=T("⬇ تصدير PDF","⬇ Export PDF");b.setAttribute("data-l",EN()?"en":"ar");b.className=ref?ref.className:"btn";b.onclick=function(e){e.preventDefault();e.stopPropagation();go()};
  if(ref&&ref.parentNode)ref.parentNode.insertBefore(b,ref);else if(te&&te.parentElement)te.parentElement.appendChild(b)}
 function start(){place();var m=main()||document.body,t=null;if(window.MutationObserver)new MutationObserver(function(){clearTimeout(t);t=setTimeout(place,150)}).observe(m,{childList:true,subtree:true,characterData:true});else setInterval(place,1500)}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
