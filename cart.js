/* Sulie Labs — shared cart (localStorage) + floating cart UI + mini animations */
(function(){
  const KEY = "sulie_cart";

  // ---------- storage ----------
  function getCart(){ try{ return JSON.parse(localStorage.getItem(KEY)) || []; }catch(e){ return []; } }
  function setCart(c){ localStorage.setItem(KEY, JSON.stringify(c)); renderBadge(); renderPanel(); }
  function addToCart(item){
    const cart = getCart();
    const found = cart.find(i => i.id === item.id);
    if (found) found.qty = Math.min(99, found.qty + (item.qty||1));
    else cart.push({ id:item.id, name:item.name, price:Number(item.price), image:item.image||"", qty:item.qty||1 });
    setCart(cart);
    bumpBadge();
    toast(`أُضيف «${item.name}» للسلة 🛒`);
  }
  function updateQty(id, qty){
    let cart = getCart();
    const it = cart.find(i => i.id === id);
    if (!it) return;
    it.qty = Math.max(0, Math.min(99, qty));
    cart = cart.filter(i => i.qty > 0);
    setCart(cart);
  }
  function cartCount(){ return getCart().reduce((s,i)=>s+i.qty,0); }
  function cartTotal(){ return getCart().reduce((s,i)=>s+i.price*i.qty,0); }

  // ---------- arabic digits ----------
  function ar(n){ const m=['٠','١','٢','٣','٤','٥','٦','٧','٨','٩']; return String(n).split('').map(c=>/[0-9]/.test(c)?m[c]:c).join(''); }

  // ---------- UI ----------
  function injectUI(){
    const css = document.createElement("style");
    css.textContent = `
      #cartFab{position:fixed;bottom:22px;left:22px;z-index:900;background:#E5512F;color:#fff;border:none;
        width:60px;height:60px;border-radius:50%;font-size:24px;cursor:pointer;box-shadow:0 6px 20px rgba(229,81,47,.4);
        transition:transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;}
      #cartFab:hover{transform:scale(1.1);box-shadow:0 8px 26px rgba(229,81,47,.55);}
      #cartFab:active{transform:scale(.94);}
      #cartBadge{position:absolute;top:-6px;right:-6px;background:#14213D;color:#fff;font-size:12px;font-weight:700;
        min-width:22px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:center;padding:0 5px;
        transition:transform .25s cubic-bezier(.34,1.56,.64,1);}
      #cartBadge.pop{transform:scale(1.5);}
      #cartBadge.hidden{display:none;}
      #cartOverlay{position:fixed;inset:0;background:rgba(20,33,61,.45);z-index:950;opacity:0;pointer-events:none;transition:opacity .25s;}
      #cartOverlay.open{opacity:1;pointer-events:auto;}
      #cartPanel{position:fixed;top:0;left:0;height:100%;width:min(380px,92vw);background:#fff;z-index:960;
        transform:translateX(-105%);transition:transform .32s cubic-bezier(.22,.9,.35,1);box-shadow:8px 0 30px rgba(0,0,0,.15);
        display:flex;flex-direction:column;direction:rtl;}
      #cartPanel.open{transform:translateX(0);}
      #cartPanel .cp-head{padding:18px 20px;background:#14213D;color:#fff;display:flex;justify-content:space-between;align-items:center;}
      #cartPanel .cp-head h3{margin:0;font-size:18px;}
      #cartPanel .cp-close{background:none;border:none;color:#fff;font-size:22px;cursor:pointer;transition:transform .2s;}
      #cartPanel .cp-close:hover{transform:rotate(90deg);}
      #cartItems{flex:1;overflow-y:auto;padding:14px;}
      .cp-item{display:flex;gap:10px;align-items:center;background:#F6F7FB;border-radius:12px;padding:10px;margin-bottom:10px;
        animation:cpIn .3s ease;}
      @keyframes cpIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
      .cp-item img{width:52px;height:52px;object-fit:contain;background:#fff;border-radius:8px;flex-shrink:0;}
      .cp-item .cp-info{flex:1;min-width:0;}
      .cp-item .cp-name{font-weight:700;font-size:14px;color:#14213D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cp-item .cp-price{font-size:13px;color:#E5512F;font-weight:600;}
      .cp-qty{display:flex;align-items:center;gap:6px;}
      .cp-qty button{width:26px;height:26px;border-radius:8px;border:1px solid #d5d9e3;background:#fff;cursor:pointer;font-size:15px;
        font-weight:700;color:#14213D;transition:background .15s, transform .1s;}
      .cp-qty button:hover{background:#EEF1F8;}
      .cp-qty button:active{transform:scale(.85);}
      .cp-qty span{min-width:20px;text-align:center;font-weight:700;font-size:14px;}
      .cp-foot{padding:16px 20px;border-top:1px solid #eee;}
      .cp-total{display:flex;justify-content:space-between;font-weight:800;font-size:16px;color:#14213D;margin-bottom:12px;}
      .cp-checkout{display:block;width:100%;text-align:center;background:#E5512F;color:#fff;border:none;padding:13px;
        border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;transition:background .2s, transform .15s;}
      .cp-checkout:hover{background:#c8431f;}
      .cp-checkout:active{transform:scale(.98);}
      .cp-empty{text-align:center;color:#98a0b3;padding:40px 10px;font-size:15px;}
      #cartToast{position:fixed;bottom:96px;left:50%;transform:translateX(-50%) translateY(20px);background:#14213D;color:#fff;
        padding:11px 22px;border-radius:30px;font-size:14px;font-weight:600;z-index:970;opacity:0;pointer-events:none;
        transition:opacity .25s, transform .25s;direction:rtl;box-shadow:0 6px 18px rgba(0,0,0,.25);}
      #cartToast.show{opacity:1;transform:translateX(-50%) translateY(0);}
      .flyDot{position:fixed;width:14px;height:14px;background:#E5512F;border-radius:50%;z-index:965;pointer-events:none;}
    `;
    document.head.appendChild(css);

    const fab = document.createElement("button");
    fab.id = "cartFab"; fab.setAttribute("aria-label","السلة");
    fab.innerHTML = `🛒<span id="cartBadge" class="hidden">0</span>`;
    fab.onclick = openPanel;
    document.body.appendChild(fab);

    const overlay = document.createElement("div");
    overlay.id = "cartOverlay"; overlay.onclick = closePanel;
    document.body.appendChild(overlay);

    const panel = document.createElement("div");
    panel.id = "cartPanel";
    panel.innerHTML = `
      <div class="cp-head"><h3>🛒 سلة المشتريات</h3><button class="cp-close" aria-label="إغلاق">✕</button></div>
      <div id="cartItems"></div>
      <div class="cp-foot">
        <div class="cp-total"><span>الإجمالي</span><span id="cpTotal">٠ ر.س</span></div>
        <a class="cp-checkout" href="checkout.html">إتمام الشراء</a>
      </div>`;
    panel.querySelector(".cp-close").onclick = closePanel;
    document.body.appendChild(panel);

    const toastEl = document.createElement("div");
    toastEl.id = "cartToast";
    document.body.appendChild(toastEl);

    renderBadge(); renderPanel();
  }

  function openPanel(){ document.getElementById("cartPanel").classList.add("open"); document.getElementById("cartOverlay").classList.add("open"); }
  function closePanel(){ document.getElementById("cartPanel").classList.remove("open"); document.getElementById("cartOverlay").classList.remove("open"); }

  function renderBadge(){
    const b = document.getElementById("cartBadge"); if(!b) return;
    const n = cartCount();
    b.textContent = ar(n);
    b.classList.toggle("hidden", n === 0);
  }
  function bumpBadge(){
    const b = document.getElementById("cartBadge"); if(!b) return;
    b.classList.add("pop"); setTimeout(()=>b.classList.remove("pop"), 260);
  }

  function renderPanel(){
    const wrap = document.getElementById("cartItems"); if(!wrap) return;
    const cart = getCart();
    if (cart.length === 0){
      wrap.innerHTML = `<div class="cp-empty">سلتك فاضية 🙃<br>أضيفي منتجات من المتجر!</div>`;
    } else {
      wrap.innerHTML = cart.map(i => `
        <div class="cp-item">
          <img src="${i.image}" alt="" onerror="this.style.visibility='hidden'">
          <div class="cp-info">
            <div class="cp-name">${i.name}</div>
            <div class="cp-price">${ar(i.price)} ر.س</div>
          </div>
          <div class="cp-qty">
            <button data-act="dec" data-id="${i.id}">−</button>
            <span>${ar(i.qty)}</span>
            <button data-act="inc" data-id="${i.id}">+</button>
          </div>
        </div>`).join("");
      wrap.querySelectorAll("button[data-act]").forEach(btn=>{
        btn.onclick = () => {
          const id = btn.dataset.id;
          const it = getCart().find(x=>x.id===id);
          if (!it) return;
          updateQty(id, btn.dataset.act === "inc" ? it.qty+1 : it.qty-1);
        };
      });
    }
    const t = document.getElementById("cpTotal");
    if (t) t.textContent = `${ar(cartTotal())} ر.س`;
  }

  let toastTimer;
  function toast(msg){
    const el = document.getElementById("cartToast"); if(!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>el.classList.remove("show"), 2200);
  }

  // small fly-to-cart dot animation from a source element
  function flyToCart(fromEl){
    const fab = document.getElementById("cartFab");
    if (!fromEl || !fab) return;
    const a = fromEl.getBoundingClientRect(), b = fab.getBoundingClientRect();
    const dot = document.createElement("div");
    dot.className = "flyDot";
    dot.style.left = (a.left + a.width/2) + "px";
    dot.style.top = (a.top + a.height/2) + "px";
    document.body.appendChild(dot);
    dot.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${b.left + b.width/2 - (a.left + a.width/2)}px, ${b.top + b.height/2 - (a.top + a.height/2)}px) scale(.4)`, opacity: .6 }
    ], { duration: 550, easing: "cubic-bezier(.3,.7,.4,1)" }).onfinish = () => dot.remove();
  }

  // expose
  window.SulieCart = { add: addToCart, get: getCart, set: setCart, count: cartCount, total: cartTotal, fly: flyToCart, updateQty, ar };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectUI);
  else injectUI();
})();
