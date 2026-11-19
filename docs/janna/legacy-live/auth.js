/* MIS auth: dashboard guard + registration recognition (talks to api/index.php) */
(function(){
  var API="api/index.php";
  function call(a,body){return fetch(API+"?a="+a,{method:body?"POST":"GET",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().catch(function(){return{ok:false}})});}
  window.MISAUTH={call:call};
  var $=function(s){return document.querySelector(s)};
  var path=location.pathname.split("/").pop()||"index.html";

  /* ---- dashboard guard + sign-out ---- */
  if(path==="dashboard.html"){
    call("me").then(function(r){
      if(!r.ok){location.replace("login.html");return;}
      try{if(r.user.plan&&r.user.status==="active"&&window.MIGPLAN)MIGPLAN.set(r.user.plan);}catch(e){}
      window.MISUSER=r.user;
      document.dispatchEvent(new CustomEvent("mis-user",{detail:r.user}));
    });
    document.addEventListener("click",function(e){var a=e.target.closest("[data-logout]");if(a){e.preventDefault();try{["mig-plan","mig-cart","mig-reg1","mig-gate","mig-auth","mig-me"].forEach(function(k){localStorage.removeItem(k);sessionStorage.removeItem(k);});}catch(x){}call("logout",{}).then(function(){location.href="login.html"});}},true);
  }

  /* ---- register page: recognise a known company by e-mail and pre-fill the form ---- */
  if(path==="register.html"){
    var inited=false;
    var init=function(){
      if(inited||!$("#r-mail"))return; inited=true;
      var box=document.createElement("div");box.id="misHint";box.style.cssText="display:none;margin-top:6px;padding:8px 12px;border-radius:10px;font-weight:700;background:#e8f5ec;color:#0B4D2B";
      $("#r-mail").closest("label").appendChild(box);
      var last="";
      $("#r-mail").addEventListener("blur",function(){
        var m=this.value.trim().toLowerCase(); if(!m||m===last||!/^\S+@\S+\.\S+$/.test(m))return; last=m;
        call("check",{email:m}).then(function(r){
          if(!r.ok)return;
          if(r.has_account){box.style.display="block";box.style.background="#fff4e0";box.style.color="#8a5a00";box.innerHTML='هذا البريد مسجّل بالفعل — <a href="login.html" style="text-decoration:underline">سجّل الدخول</a>';return;}
          if(r.known){
            var x=r.member,set=function(id,v){var e=$(id);if(e&&!e.value&&v)e.value=v;};
            set("#r-name",x.company);set("#r-mgr",x.manager);set("#r-tel",(x.phones||"").split(" | ")[0]);set("#r-addr",x.address);set("#r-web",x.web);set("#r-act",x.activity);
            box.style.display="block";box.style.background="#e8f5ec";box.style.color="#0B4D2B";box.textContent="✓ تعرّفنا على شركتك: "+x.company+" — راجع البيانات المعبّأة وأكمل.";
          } else box.style.display="none";
        });
      });
    };
    document.addEventListener("DOMContentLoaded",init); if(document.readyState!=="loading")init();
  }
})();
