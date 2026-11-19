/* loads the signed-in account synchronously before the dashboard renders */
(function(){
  window.MISUSER=null;
  var st=0;
  for(var k=0;k<3&&!window.MISUSER;k++){
    try{
      var x=new XMLHttpRequest(); x.open("GET","api/index.php?a=me&_="+Date.now(),false); x.withCredentials=true; x.send(); st=x.status;
      if(st===200){var r=JSON.parse(x.responseText); if(r.ok) window.MISUSER=r.user;}
      if(st===401) break;
    }catch(e){ st=0; }
  }
  if(!window.MISUSER){ if(st===401){ location.replace("login.html"); } else { document.documentElement.innerHTML='<body style="font-family:sans-serif;text-align:center;padding:60px;direction:rtl">الخادم مشغول حالياً — <a href="">أعد المحاولة</a></body>'; } }
else if(window.MISUSER.plan&&window.MISUSER.status==="active"){ try{ if(localStorage.getItem("mig-plan")!==window.MISUSER.plan){ localStorage.setItem("mig-plan",window.MISUSER.plan); if(!sessionStorage.getItem("mig-rl")){ sessionStorage.setItem("mig-rl","1"); location.reload(); } } }catch(e){} }
})();
function esc2(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]});}

document.addEventListener("DOMContentLoaded",function(){var u=window.MISUSER;if(!u)return;var c=u.company||(u.member&&u.member.company)||"";var N=document.getElementById("whoN"),L=document.getElementById("whoL"),S=document.getElementById("whoS");if(N)N.textContent=c;if(L)L.textContent=c.replace(/^(شركة|مؤسسة|مصنع)\s+/,"").charAt(0);if(S){if(u.status==="pending")S.textContent="⏳ بانتظار إتمام الاشتراك";else if(!S.textContent)S.textContent="✓ حساب نشط";}});

