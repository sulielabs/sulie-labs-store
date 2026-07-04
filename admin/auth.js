/* Sulie Labs — admin login gate (server-verified) */
(function(){
  const TK = "sulie_admin_token";

  function injectGate(){
    const css = document.createElement("style");
    css.textContent = `
      #authGate{position:fixed;inset:0;background:#EEF1F8;z-index:2000;display:flex;align-items:center;justify-content:center;direction:rtl;}
      #authGate .box{background:#fff;padding:34px 30px;border-radius:18px;box-shadow:0 10px 40px rgba(20,33,61,.12);width:min(380px,92vw);text-align:center;
        animation:authIn .35s cubic-bezier(.22,.9,.35,1);}
      @keyframes authIn{from{opacity:0;transform:translateY(14px) scale(.97);}to{opacity:1;transform:none;}}
      #authGate h2{color:#14213D;margin:0 0 6px;font-size:22px;}
      #authGate p{color:#98a0b3;font-size:13px;margin:0 0 20px;}
      #authGate input{width:100%;padding:12px;border:1px solid #d5d9e3;border-radius:10px;font-size:14px;margin-bottom:12px;font-family:inherit;direction:ltr;text-align:left;}
      #authGate input:focus{outline:none;border-color:#E5512F;box-shadow:0 0 0 3px rgba(229,81,47,.12);}
      #authGate button{width:100%;padding:13px;background:#E5512F;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:background .2s, transform .12s;}
      #authGate button:hover{background:#c8431f;}
      #authGate button:active{transform:scale(.97);}
      #authGate .err{color:#c0392b;font-size:13px;min-height:18px;margin-bottom:8px;font-weight:600;}
      #authGate .lock{font-size:38px;margin-bottom:8px;}
      body.auth-locked > :not(#authGate){filter:blur(4px);pointer-events:none;user-select:none;}
    `;
    document.head.appendChild(css);

    const gate = document.createElement("div");
    gate.id = "authGate";
    gate.innerHTML = `
      <div class="box">
        <div class="lock">🔐</div>
        <h2>لوحة تحكم Sulie Labs</h2>
        <p>تسجيل دخول المشرف</p>
        <div class="err" id="authErr"></div>
        <input type="email" id="authEmail" placeholder="Email" autocomplete="username">
        <input type="password" id="authPass" placeholder="Password" autocomplete="current-password">
        <button id="authBtn">دخول</button>
      </div>`;
    document.body.appendChild(gate);
    document.body.classList.add("auth-locked");

    const doLogin = async () => {
      const email = document.getElementById("authEmail").value.trim();
      const password = document.getElementById("authPass").value;
      const err = document.getElementById("authErr");
      const btn = document.getElementById("authBtn");
      err.textContent = "";
      btn.disabled = true; btn.textContent = "جاري التحقق...";
      try {
        const res = await fetch("/api/admin-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          sessionStorage.setItem(TK, data.token);
          unlock();
        } else {
          err.textContent = data.error || "بيانات الدخول غير صحيحة";
          btn.disabled = false; btn.textContent = "دخول";
        }
      } catch (e) {
        err.textContent = "تعذر الاتصال بالخادم";
        btn.disabled = false; btn.textContent = "دخول";
      }
    };
    document.getElementById("authBtn").addEventListener("click", doLogin);
    gate.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  }

  function unlock(){
    const gate = document.getElementById("authGate");
    if (gate){
      gate.style.transition = "opacity .3s";
      gate.style.opacity = "0";
      setTimeout(()=>gate.remove(), 300);
    }
    document.body.classList.remove("auth-locked");
    document.dispatchEvent(new Event("admin-authed"));
  }

  window.SulieAuth = {
    token: () => sessionStorage.getItem(TK) || "",
    logout: () => { sessionStorage.removeItem(TK); location.reload(); }
  };

  async function boot(){
    injectGate();
    const t = sessionStorage.getItem(TK);
    if (t){
      try {
        const res = await fetch("/api/admin-verify", { headers: { "x-admin-token": t } });
        if (res.ok){ unlock(); return; }
      } catch(e){}
      sessionStorage.removeItem(TK);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
