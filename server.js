// server.js — Sulie Labs store on Railway
// Serves the static site AND the payment/order API routes that were
// previously Netlify functions. Requires Node 18+ (global fetch).

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ---- Admin auth (server-side) ----
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "candy.smb@hotmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Sulie123sulie123$";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "sulie-labs-token-secret-2026";

function makeToken() {
  return crypto.createHmac("sha256", TOKEN_SECRET)
    .update(ADMIN_EMAIL + ":" + ADMIN_PASSWORD)
    .digest("hex");
}
function isValidToken(t) {
  if (!t) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(String(t)), Buffer.from(makeToken()));
  } catch (e) { return false; }
}

// ---- Visit counter (file-persisted; resets on redeploy) ----
const fs = require("fs");
const VISITS_FILE = path.join(__dirname, "visits.json");
let visits = { total: 0, since: new Date().toISOString() };
try { visits = JSON.parse(fs.readFileSync(VISITS_FILE, "utf8")); } catch (e) {}
let saveTimer = null;
function bumpVisits() {
  visits.total++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(VISITS_FILE, JSON.stringify(visits), () => {});
  }, 500);
}
// count real page views (not assets/api)
app.use((req, res, next) => {
  if (req.method === "GET") {
    const p = req.path;
    if (p === "/" || p === "/index.html" || p === "/product.html" ||
        p === "/checkout.html" || p === "/success.html") {
      bumpVisits();
    }
  }
  next();
});

// GET /api/stats (admin only) -> {visits, since}
app.get("/api/stats", (req, res) => {
  if (!isValidToken(req.headers["x-admin-token"])) {
    return res.status(401).json({ error: "غير مصرح" });
  }
  res.json({ visits: visits.total, since: visits.since });
});

// POST /api/admin-login {email, password} -> {token}
app.post("/api/admin-login", (req, res) => {
  const { email, password } = req.body || {};
  if (String(email).trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
      String(password) === ADMIN_PASSWORD) {
    return res.json({ token: makeToken() });
  }
  return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
});

// GET /api/admin-verify -> {ok:true} if token header valid
app.get("/api/admin-verify", (req, res) => {
  if (isValidToken(req.headers["x-admin-token"])) return res.json({ ok: true });
  return res.status(401).json({ ok: false });
});

// POST /api/create-invoice
// Accepts EITHER the old single-product shape {productId, productName, price, customer}
// OR the new cart shape {items:[{id,name,price,qty}], customer}
app.post("/api/create-invoice", async (req, res) => {
  let { productId, productName, price, customer, items } = req.body || {};

  // normalize: single product -> items array
  if (!Array.isArray(items) || items.length === 0) {
    if (productId && productName && price) {
      items = [{ id: productId, name: productName, price: Number(price), qty: 1 }];
    } else {
      items = [];
    }
  }
  // sanitize items
  items = items
    .map(it => ({ id: String(it.id||""), name: String(it.name||""), price: Number(it.price)||0, qty: Math.max(1, Math.min(99, parseInt(it.qty)||1)) }))
    .filter(it => it.id && it.name && it.price > 0);

  const deliveryMethod = (req.body && req.body.deliveryMethod) === "delivery" ? "delivery" : "pickup";
  const DELIVERY_FEE = 15;

  const baseOk = customer && customer.name && customer.email && customer.mobile;
  const addressOk = deliveryMethod === "pickup" ||
    (customer && customer.city && customer.district && customer.buildingNo);

  if (items.length === 0 || !baseOk || !addressOk) {
    return res.status(400).json({ error: "بيانات الطلب ناقصة" });
  }
  if (deliveryMethod === "pickup") {
    customer.city = customer.city || "الرياض";
    customer.district = customer.district || "استلام — حي الملك فهد";
    customer.buildingNo = customer.buildingNo || "-";
  }

  const itemsTotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const totalAmount = itemsTotal + (deliveryMethod === "delivery" ? DELIVERY_FEE : 0);
  productId = items[0].id;
  productName = items.map(it => `${it.name}${it.qty>1 ? ` ×${it.qty}` : ""}`).join("، ");
  const BASE = process.env.PAYLINK_BASE_URL || "https://restpilot.paylink.sa";
  const SITE_URL = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
  try {
    const authRes = await fetch(`${BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiId: process.env.PAYLINK_API_ID,
        secretKey: process.env.PAYLINK_SECRET_KEY,
        persistToken: false,
      }),
    });
    const authData = await authRes.json();
    if (!authData.id_token) {
      return res.status(502).json({ error: "تعذر الاتصال ببوابة الدفع", details: authData });
    }
    const orderNumber = `SULIE-${Date.now()}`;
    const addressSummary = [
      customer.city, customer.district,
      customer.buildingNo ? `مبنى ${customer.buildingNo}` : null,
      customer.postalCode ? `الرمز البريدي ${customer.postalCode}` : null,
      customer.additionalNo ? `رقم إضافي ${customer.additionalNo}` : null,
    ].filter(Boolean).join("، ");
    const metadata = JSON.stringify({
      deliveryMethod,
      productId, productName,
      customerName: customer.name, email: customer.email, mobile: customer.mobile,
      city: customer.city, district: customer.district, buildingNo: customer.buildingNo,
      postalCode: customer.postalCode || "", additionalNo: customer.additionalNo || "",
    });
    const invoiceBody = {
      orderNumber, amount: totalAmount,
      callBackUrl: `${SITE_URL}/success.html`,
      cancelUrl: `${SITE_URL}/checkout.html?id=${encodeURIComponent(productId)}&canceled=1`,
      clientName: customer.name, clientEmail: customer.email, clientMobile: customer.mobile,
      currency: "SAR",
      note: deliveryMethod === "pickup"
        ? "طلب Sulie Labs — استلام من حي الملك فهد، الرياض"
        : `طلب Sulie Labs — توصيل: ${addressSummary}`,
      products: items.map(it => ({ title: it.name, price: it.price, qty: it.qty, description: "منتج مطبوع 3D من Sulie Labs", isDigital: false }))
        .concat(deliveryMethod === "delivery"
          ? [{ title: "رسوم التوصيل", price: DELIVERY_FEE, qty: 1, description: "توصيل داخل الرياض", isDigital: false }]
          : []),
      metadata,
    };
    const invRes = await fetch(`${BASE}/api/addInvoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.id_token}` },
      body: JSON.stringify(invoiceBody),
    });
    const invData = await invRes.json();
    if (!invData.url) {
      return res.status(502).json({ error: "تعذر إنشاء الفاتورة", details: invData });
    }
    return res.json({ paymentUrl: invData.url, transactionNo: invData.transactionNo });
  } catch (err) {
    const cause = err && err.cause ? ` | cause: ${String(err.cause)}` : "";
    return res.status(500).json({ error: "خطأ غير متوقع", details: String(err) + cause });
  }
});

// GET /api/verify-invoice?transactionNo=...
app.get("/api/verify-invoice", async (req, res) => {
  const transactionNo = req.query.transactionNo;
  if (!transactionNo) return res.status(400).json({ error: "transactionNo مطلوب" });
  const BASE = process.env.PAYLINK_BASE_URL || "https://restpilot.paylink.sa";
  try {
    const authRes = await fetch(`${BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiId: process.env.PAYLINK_API_ID,
        secretKey: process.env.PAYLINK_SECRET_KEY,
        persistToken: false,
      }),
    });
    const authData = await authRes.json();
    if (!authData.id_token) return res.status(502).json({ error: "تعذر الاتصال ببوابة الدفع" });
    // الصيغة الرسمية: GET /api/getInvoice/{transactionNo}
    let invoice = {};
    try {
      const getRes = await fetch(`${BASE}/api/getInvoice/${encodeURIComponent(transactionNo)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${authData.id_token}` },
      });
      invoice = await getRes.json();
    } catch (e) { invoice = {}; }

    // fallback: الصيغة القديمة POST مع body
    if (!invoice || !invoice.orderStatus) {
      try {
        const getRes2 = await fetch(`${BASE}/api/getInvoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.id_token}` },
          body: JSON.stringify({ transactionNo }),
        });
        const inv2 = await getRes2.json();
        if (inv2 && inv2.orderStatus) invoice = inv2;
      } catch (e) {}
    }

    if (!invoice || !invoice.orderStatus) {
      console.error("verify-invoice: no orderStatus. Paylink raw:", JSON.stringify(invoice).slice(0, 400));
    }
    const isPaid = (invoice.orderStatus || "").toLowerCase() === "paid";
    if (isPaid) {
      let meta = {};
      try { meta = JSON.parse(invoice.gatewayOrderRequest?.metadata || invoice.metadata || "{}"); } catch (e) {}
      const orderRecord = {
        date: new Date().toISOString(),
        deliveryMethod: meta.deliveryMethod || "",
        orderNumber: invoice.gatewayOrderRequest?.orderNumber || "",
        transactionNo, product: meta.productName || "", amount: invoice.amount,
        customerName: meta.customerName || invoice.clientName || "",
        email: meta.email || invoice.clientEmail || "",
        mobile: meta.mobile || invoice.clientMobile || "",
        city: meta.city || "", district: meta.district || "",
        buildingNo: meta.buildingNo || "", postalCode: meta.postalCode || "",
        additionalNo: meta.additionalNo || "",
      };
      if (process.env.ORDERS_SHEET_WEBHOOK_URL) {
        try {
          await fetch(process.env.ORDERS_SHEET_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...orderRecord, key: process.env.ORDERS_SHEET_API_KEY }),
          });
        } catch (e) { console.error("sheet log failed", e); }
      }
      if (process.env.RESEND_API_KEY && orderRecord.email) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || "Sulie Labs <onboarding@resend.dev>",
              to: orderRecord.email,
              subject: "تم تأكيد طلبك من Sulie Labs 🎉",
              html: `<div dir="rtl" style="font-family:sans-serif; line-height:1.8; color:#14213D;"><h2>شكراً لطلبك، ${orderRecord.customerName}! 🎉</h2><p>استلمنا طلبك وتم تأكيد الدفع بنجاح.</p><table style="margin-top:16px; border-collapse:collapse;"><tr><td style="padding:6px 12px; color:#666;">رقم الطلب</td><td style="padding:6px 12px; font-weight:bold;">${orderRecord.orderNumber}</td></tr><tr><td style="padding:6px 12px; color:#666;">المنتج</td><td style="padding:6px 12px; font-weight:bold;">${orderRecord.product}</td></tr><tr><td style="padding:6px 12px; color:#666;">المبلغ</td><td style="padding:6px 12px; font-weight:bold;">${orderRecord.amount} ر.س</td></tr></table><p style="margin-top:20px;">📦 بمجرد توفر خدمة الشحن سنرسل لك رقم التتبع على هذا البريد.</p><p style="margin-top:20px; color:#888; font-size:13px;">Sulie Labs — Printing Your Imagination</p></div>`,
            }),
          });
        } catch (e) { console.error("email send failed", e); }
      }
    }
    return res.json({ paid: isPaid, amount: invoice.amount, orderStatus: invoice.orderStatus });
  } catch (err) {
    return res.status(500).json({ error: "خطأ غير متوقع", details: String(err) });
  }
});

// GET /api/get-orders (admin only)
app.get("/api/get-orders", async (req, res) => {
  if (!isValidToken(req.headers["x-admin-token"])) {
    return res.status(401).json({ error: "غير مصرح — سجّلي الدخول أولاً" });
  }
  if (!process.env.ORDERS_SHEET_WEBHOOK_URL) {
    return res.status(500).json({ error: "ORDERS_SHEET_WEBHOOK_URL غير مضبوط" });
  }
  try {
    const url = `${process.env.ORDERS_SHEET_WEBHOOK_URL}?key=${encodeURIComponent(process.env.ORDERS_SHEET_API_KEY || "")}`;
    const r = await fetch(url);
    const data = await r.json();
    return res.json({ orders: data.orders || data || [] });
  } catch (err) {
    return res.status(500).json({ error: "تعذر تحميل الطلبات", details: String(err) });
  }
});

// Serve the admin explicitly (both /admin and /admin/)
app.get(["/admin", "/admin/"], (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

// Static files (index.html, styles.css, data/, images/, admin/, etc.)
// GET /api/paylink-test — أداة تشخيص مؤقتة (لا تكشف أسرار)
app.get("/api/paylink-test", async (req, res) => {
  const BASE = process.env.PAYLINK_BASE_URL || "https://restpilot.paylink.sa";
  const report = {
    baseUrl_asConfigured: JSON.stringify(BASE), // JSON.stringify يكشف أي مسافات/رموز خفية
    baseUrl_length: BASE.length,
    apiId_set: Boolean(process.env.PAYLINK_API_ID),
    secretKey_set: Boolean(process.env.PAYLINK_SECRET_KEY),
  };
  try {
    const r = await fetch(`${BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiId: process.env.PAYLINK_API_ID,
        secretKey: process.env.PAYLINK_SECRET_KEY,
        persistToken: false,
      }),
    });
    const data = await r.json().catch(() => ({}));
    report.fetch = "SUCCESS — وصلنا لـ Paylink";
    report.httpStatus = r.status;
    report.authOk = Boolean(data.id_token);
    if (!data.id_token) report.paylinkSays = data;
  } catch (err) {
    report.fetch = "FAILED — ما قدرنا نوصل لـ Paylink";
    report.errName = String(err);
    report.errCause = err && err.cause ? String(err.cause) : "no cause";
    report.errCode = err && err.cause && err.cause.code ? err.cause.code : "";
  }
  res.json(report);
});

app.use(express.static(__dirname));

// Catch-all: only for genuine page routes — never for data/api/admin/assets
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/data/") ||
      req.path.startsWith("/admin") || req.path.startsWith("/images/") ||
      req.path.includes(".")) {
    return res.status(404).send("Not found");
  }
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`✅ Sulie Labs running on port ${PORT}`); });
