/* data/acc-pdf.js — «تصدير PDF / Export PDF» on the Control Center statistics view (/admin/#home).
   Prints the view as it is on screen as a formatted A4 report (header, footer, no sidebar or buttons); the user picks "Save as PDF".
   Reads nothing from the API and changes no data. Browser file: ES5 only. Loaded by panel.part.py after data/acc.js. */
(function(){
 if(window.__statsPdf)return;window.__statsPdf=1;
 var RX=/^(الإحصائيات|Statistics)$/;
 function $(s,r){return (r||document).querySelector(s)}
 function EN(){return String(document.documentElement.lang||"").toLowerCase().indexOf("en")===0}
 function T(a,e){return EN()?e:a}
 function titleEl(){return $("main #vt")||$("main #ph h1")||$("main h1")||$("main h2")}
 function main(){return $("main")}
 function onStats(){var t=titleEl();return !!(t&&RX.test(String(t.textContent).replace(/\s+/g," ").replace(/^\s+|\s+$/g,"")))}
 var R=[
  "html,body{height:auto!important;overflow:visible!important;background:#fff!important}",
  "body *{visibility:hidden!important}",
  "main,main *{visibility:visible!important}",
  "aside,#auth,#modals,#toast,#mo,#tt{display:none!important}",
  "#app,.app,.lay{display:block!important;height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important}",
  "main{position:absolute!important;top:0!important;right:0!important;left:0!important;width:auto!important;max-width:none!important;height:auto!important;min-height:0!important;margin:0!important;padding:0 2px!important;overflow:visible!important;background:#fff!important}",
  "main button,main .btn,main input,main select,main .pg{display:none!important}",
  "main .card,main .cd,main .kc,main .kpi,main .row{break-inside:avoid;page-break-inside:avoid}",
  "main .card,main .cd,main .kc{box-shadow:none!important;border:1px solid #d9dee3!important}",
  "main h3{break-after:avoid;page-break-after:avoid}",
  "main svg{max-width:100%!important;height:auto!important}",
  ".sp-head{display:flex!important;align-items:flex-end;justify-content:space-between;gap:16px;border-bottom:3px solid #1f2937;padding:0 0 10px;margin:0 0 14px;font-family:inherit}",
  ".sp-head b{display:block;font-size:20px;line-height:1.3;color:#111827}",
  ".sp-head span{display:block;font-size:13px;color:#374151;margin-top:2px}",
  ".sp-head i{font-style:normal;font-size:11px;color:#4b5563;direction:ltr;white-space:nowrap}",
  ".sp-foot{display:block!important;margin:18px 0 0;padding-top:8px;border-top:1px solid #d9dee3;font-size:10.5px;color:#6b7280;text-align:center}"
 ];
 function scope(p){var o=[];for(var i=0;i<R.length;i++){var parts=R[i].split("{"),sel=parts[0].split(","),b="{"+parts.slice(1).join("{");for(var k=0;k<sel.length;k++){var s=sel[k];sel[k]=(s==="html"?"html."+p:s==="body"?"body."+p:(s.indexOf("body ")===0?"body."+p+s.slice(4):"body."+p+" "+s))}o.push(sel.join(",")+b)}return o.join("\n")}
 var css=document.createElement("style");css.id="sp-css";
 css.textContent=".sp-head,.sp-foot{display:none}\n#sp-pdf{margin-inline-start:8px;margin-inline-end:8px;cursor:pointer}\n@media print{@page{size:A4;margin:12mm}\n*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}\n"+scope("sp-on")+"}\n"+scope("sp-preview");
 document.head.appendChild(css);
 function pad(n){return (n<10?"0":"")+n}
 function stamp(){var d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes())}
 function site(){return T("منصة صنع في مصر","Made in Egypt Gate")}
 function build(){var m=main();if(!m)return;clean();var te=titleEl(),sub="";if(te&&te.parentElement){var sm=te.parentElement.querySelector("small,.sub,p,div");if(sm&&sm!==te)sub=String(sm.textContent).replace(/\s+/g," ").replace(/^\s+|\s+$/g,"").slice(0,60)}
  var h=document.createElement("div");h.className="sp-head";var a=document.createElement("div"),b=document.createElement("b"),s=document.createElement("span"),i=document.createElement("i");
  b.textContent=site();s.textContent=T("تقرير الإحصائيات","Statistics report")+(sub?" — "+sub:"");i.textContent=location.hostname.replace(/^www\./,"")+"  |  "+stamp();
  a.appendChild(b);a.appendChild(s);h.appendChild(a);h.appendChild(i);m.insertBefore(h,m.firstChild);
  var f=document.createElement("div");f.className="sp-foot";f.textContent=T("تم استخراج هذا التقرير من لوحة التحكم — ","Exported from the Control Center — ")+location.hostname.replace(/^www\./,"")+" — "+stamp();m.appendChild(f)}
 function clean(){var x=document.querySelectorAll(".sp-head,.sp-foot");for(var i=0;i<x.length;i++)x[i].parentNode.removeChild(x[i])}
 var oldTitle=null;
 function done(){document.documentElement.classList.remove("sp-on");document.body.classList.remove("sp-on");clean();if(oldTitle!==null){document.title=oldTitle;oldTitle=null}}
 function go(){if(!onStats())return;build();document.documentElement.classList.add("sp-on");document.body.classList.add("sp-on");oldTitle=document.title;document.title="stats-"+location.hostname.replace(/^www\./,"")+"-"+stamp().slice(0,10);setTimeout(function(){window.print()},120)}
 window.addEventListener("afterprint",done);
 window.__statsPdfPreview=function(on){if(on){build();document.documentElement.classList.add("sp-preview");document.body.classList.add("sp-preview")}else{document.documentElement.classList.remove("sp-preview");document.body.classList.remove("sp-preview");clean()}};
 function place(){var m=main();if(!m)return;var b=document.getElementById("sp-pdf");if(!onStats()){if(b)b.parentNode.removeChild(b);return}if(b&&m.contains(b)&&b.getAttribute("data-l")===(EN()?"en":"ar"))return;if(b&&b.parentNode)b.parentNode.removeChild(b);
  var te=titleEl(),ref=null,bs=m.querySelectorAll("button"),k;for(k=0;k<bs.length;k++){if(/تحديث|Refresh/.test(bs[k].textContent)&&!bs[k].closest(".sp-head")){ref=bs[k];break}}
  b=document.createElement("button");b.id="sp-pdf";b.type="button";b.textContent=T("⬇ تصدير PDF","⬇ Export PDF");b.setAttribute("data-l",EN()?"en":"ar");b.className=ref?ref.className:"btn";b.onclick=function(e){e.preventDefault();e.stopPropagation();go()};
  if(ref&&ref.parentNode)ref.parentNode.insertBefore(b,ref);else if(te&&te.parentElement)te.parentElement.appendChild(b)}
 function start(){place();var m=main()||document.body,t=null;if(window.MutationObserver)new MutationObserver(function(){clearTimeout(t);t=setTimeout(place,150)}).observe(m,{childList:true,subtree:true,characterData:true});else setInterval(place,1500)}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
