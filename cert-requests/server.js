require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const app = express();
app.set('view engine', 'ejs');

const pool = mysql.createPool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASS, database: process.env.DB_NAME,
});
const BASE = process.env.BASE_URL;
const PM = 'https://api.paymongo.com/v1';
const MODE = process.env.PAYMENT_MODE || 'manual'; // 'manual' or 'paymongo'
const AUTH = 'Basic ' + Buffer.from((process.env.PAYMONGO_SECRET_KEY || '') + ':').toString('base64');
// ---------- Live updates (Server-Sent Events) for the registrar page ----------
const clients = new Set();
const broadcast = (type) => { for (const c of clients) c.write(`data: ${type}\n\n`); };

const pay = { no: process.env.GCASH_NUMBER, name: process.env.GCASH_NAME, note: process.env.PAY_NOTE };

// ---------- PayMongo helpers ----------
async function createCheckout(r) {
  const res = await fetch(`${PM}/checkout_sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json', authorization: AUTH },
    body: JSON.stringify({ data: { attributes: {
      send_email_receipt: true, show_description: true, show_line_items: true,
      description: `Certificate request ${r.reference_no}`,
      reference_number: r.reference_no,
      line_items: [{ currency: 'PHP', amount: Math.round(r.fee * 100), name: r.type_name, quantity: r.copies }],
      payment_method_types: (process.env.PAYMONGO_METHODS || 'qrph').split(',').map(m => m.trim()),
      billing: { name: r.student_name, email: r.email },
      success_url: `${BASE}/payment/success?ref=${r.reference_no}`,
      cancel_url: `${BASE}/payment/cancel?ref=${r.reference_no}`,
      metadata: { reference_no: r.reference_no },
    } } }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('PayMongo: ' + JSON.stringify(j.errors));
  await pool.query('UPDATE requests SET checkout_session_id=? WHERE id=?', [j.data.id, r.id]);
  return j.data.attributes.checkout_url;
}

// Fallback check (useful when the webhook can't reach localhost)
async function syncPayment(r) {
  if (r.status !== 'pending_payment' || !r.checkout_session_id) return r;
  const res = await fetch(`${PM}/checkout_sessions/${r.checkout_session_id}`, { headers: { authorization: AUTH } });
  const j = await res.json();
  const paid = j.data?.attributes?.payments?.some(p => p.attributes.status === 'paid');
  if (paid) {
    await pool.query("UPDATE requests SET status='paid', paid_at=NOW() WHERE id=? AND status='pending_payment'", [r.id]);
    r.status = 'paid';
  }
  return r;
}

const getRequest = async (ref) => (await pool.query(
  `SELECT r.*, t.name AS type_name, t.fee FROM requests r
   JOIN certificate_types t ON t.id=r.certificate_type_id WHERE r.reference_no=?`, [ref]))[0][0];

// ---------- Webhook (raw body needed for signature check; keep BEFORE other parsers) ----------
app.post('/webhooks/paymongo', express.raw({ type: '*/*' }), async (req, res) => {
  if (MODE !== 'paymongo') return res.sendStatus(404);
  const parts = Object.fromEntries((req.get('Paymongo-Signature') || '').split(',').map(p => p.split('=')));
  const expected = crypto.createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET)
    .update(`${parts.t}.${req.body.toString()}`).digest('hex');
  const provided = process.env.PAYMONGO_SECRET_KEY.startsWith('sk_live') ? parts.li : parts.te;
  if (!provided || provided.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return res.sendStatus(400);

  const event = JSON.parse(req.body.toString());
  if (event.data.attributes.type === 'checkout_session.payment.paid') {
    const sessionId = event.data.attributes.data.id;
    const [u] = await pool.query("UPDATE requests SET status='paid', paid_at=NOW() WHERE checkout_session_id=? AND status='pending_payment'", [sessionId]);
    if (u.affectedRows) broadcast('paid');
  }
  res.sendStatus(200);
});

app.use(express.urlencoded({ extended: false }));

// ---------- Student pages ----------
app.get('/', async (req, res) => {
  const [types] = await pool.query('SELECT * FROM certificate_types WHERE active=1');
  res.render('index', { types, error: null });
});

app.post('/request', async (req, res) => {
  const { student_id, student_name, email, contact, certificate_type_id, purpose } = req.body;
  const copies = Math.min(Math.max(parseInt(req.body.copies) || 1, 1), 10);
  const [[type]] = await pool.query('SELECT * FROM certificate_types WHERE id=? AND active=1', [certificate_type_id]);
  if (!type || !student_id || !student_name || !email || !purpose) {
    const [types] = await pool.query('SELECT * FROM certificate_types WHERE active=1');
    return res.status(400).render('index', { types, error: 'Please fill in all required fields.' });
  }
  const ref = 'CERT-' + new Date().getFullYear() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const amount = Number(type.fee) * copies; // computed server-side, never trusted from the form
  await pool.query(
    `INSERT INTO requests (reference_no, student_id, student_name, email, contact, certificate_type_id, purpose, copies, amount)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [ref, student_id, student_name, email, contact, type.id, purpose, copies, amount]);
  broadcast('new');
  if (MODE === 'manual') return res.redirect('/status/' + ref);
  res.redirect(await createCheckout(await getRequest(ref)));
});

app.get('/pay/:ref', async (req, res) => {
  const r = await getRequest(req.params.ref);
  if (!r || r.status !== 'pending_payment' || MODE === 'manual') return res.redirect('/status/' + req.params.ref);
  res.redirect(await createCheckout(r));
});

app.get('/payment/success', (req, res) => res.redirect('/status/' + req.query.ref));
app.get('/payment/cancel', (req, res) => res.redirect('/status/' + req.query.ref));

app.get('/status/:ref', async (req, res) => {
  let r = await getRequest(req.params.ref);
  if (!r) return res.status(404).send('Request not found');
  if (MODE === 'paymongo') r = await syncPayment(r);
  res.render('status', { r, MODE, pay, msg: req.query.msg });
});

// Student submits GCash / cashier reference for manual verification
app.post('/status/:ref/payment', async (req, res) => {
  const r = await getRequest(req.params.ref);
  if (!r) return res.sendStatus(404);
  const back = '/status/' + r.reference_no;
  const fail = (m) => res.redirect(back + '?msg=' + encodeURIComponent(m));
  const ref = (req.body.payment_reference || '').trim().slice(0, 60);
  if (r.status !== 'pending_payment' || ref.length < 6) return fail('Enter a valid reference number.');
  const [[dup]] = await pool.query('SELECT id FROM requests WHERE payment_reference=? AND id<>?', [ref, r.id]);
  if (dup) return fail('That reference number was already used.');
  await pool.query("UPDATE requests SET payment_reference=?, payment_method=?, status='for_verification' WHERE id=?",
    [ref, req.body.payment_method === 'cashier' ? 'cashier' : 'gcash', r.id]);
  broadcast('verify');
  res.redirect(back);
});

// ---------- Registrar/admin ----------
function admin(req, res, next) {
  const [u, p] = Buffer.from((req.get('authorization') || '').split(' ')[1] || '', 'base64').toString().split(':');
  if (u === process.env.ADMIN_USER && p === process.env.ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Registrar"').sendStatus(401);
}

const loadRows = async () => (await pool.query(
  `SELECT r.*, t.name AS type_name FROM requests r
   JOIN certificate_types t ON t.id=r.certificate_type_id ORDER BY r.created_at DESC LIMIT 200`))[0];

app.get('/admin', admin, async (req, res) => res.render('admin', { rows: await loadRows() }));
app.get('/admin/table', admin, async (req, res) => res.render('partials/table', { rows: await loadRows() }));

app.get('/admin/events', admin, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.post('/admin/:id/confirm', admin, async (req, res) => {
  await pool.query("UPDATE requests SET status='paid', paid_at=NOW() WHERE id=? AND status='for_verification'", [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/:id/reject', admin, async (req, res) => {
  await pool.query("UPDATE requests SET status='pending_payment', payment_reference=NULL, payment_method=NULL WHERE id=? AND status='for_verification'", [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/:id/status', admin, async (req, res) => {
  const allowed = ['processing', 'ready', 'released', 'cancelled'];
  if (allowed.includes(req.body.status))
    await pool.query("UPDATE requests SET status=? WHERE id=? AND status NOT IN ('pending_payment','for_verification')", [req.body.status, req.params.id]);
  res.redirect('/admin');
});

// Every 10s, ask PayMongo about still-pending checkouts so payments show up within seconds
if (MODE === 'paymongo') setInterval(async () => {
  try {
    const [pend] = await pool.query(
      "SELECT * FROM requests WHERE status='pending_payment' AND checkout_session_id IS NOT NULL AND created_at > NOW() - INTERVAL 1 DAY LIMIT 20");
    let changed = false;
    for (const r of pend) if ((await syncPayment({ ...r })).status === 'paid') changed = true;
    if (changed) broadcast('paid');
  } catch (e) { console.error('reconcile:', e.message); }
}, 3000);

app.use((err, req, res, next) => { console.error(err); res.status(500).send('Something went wrong.'); });
app.listen(process.env.PORT || 3000, () => console.log('Running on ' + BASE));
