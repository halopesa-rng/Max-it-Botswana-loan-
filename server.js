require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const app = express();
app.use(express.json({limit:'20kb'}));
app.use(express.static('public'));
const PORT = process.env.PORT || 10000;
const pool = process.env.DATABASE_URL ? new Pool({connectionString:process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : {rejectUnauthorized:false}}) : null;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPER = String(process.env.SUPER_ADMIN_CHAT_ID || '');
const admins = new Set((process.env.ADMIN_CHAT_IDS || '').split(',').map(s=>s.trim()).filter(Boolean));
let offset = 0, polling = false;
async function initDb(){
 if(!pool) return;
 await pool.query(`CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, phone TEXT NOT NULL, reference TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', reviewer TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS app_admins (chat_id TEXT PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT TRUE, added_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 for(const id of admins) await pool.query('INSERT INTO app_admins(chat_id,active) VALUES($1,TRUE) ON CONFLICT(chat_id) DO UPDATE SET active=TRUE',[id]);
}
async function api(method, body){
 if(!TOKEN) return null;
 const r=await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});
 const j=await r.json(); if(!j.ok) console.error('Telegram API error:',j.description); return j;
}
async function send(chat_id,text,extra={}){ return api('sendMessage',{chat_id,text,parse_mode:'HTML',...extra}); }
async function isAdmin(id){ if(String(id)===SUPER) return true; if(!pool) return admins.has(String(id)); const r=await pool.query('SELECT active FROM app_admins WHERE chat_id=$1',[String(id)]); return !!r.rows[0]?.active; }
async function notifyApplication(a){
 const msg=`🟠 <b>New Botswana loan application</b>\n\n🆔 <code>${a.id}</code>\n📞 Phone: <code>${esc(a.phone)}</code>\n🔎 Application reference: <code>${esc(a.reference)}</code>\n💰 Requested: <b>BWP ${Number(a.amount).toLocaleString('en-BW',{minimumFractionDigits:2,maximumFractionDigits:2})}</b>\n📌 Status: PENDING\n🕒 ${new Date(a.created_at||Date.now()).toISOString()}`;
 const keyboard={inline_keyboard:[[{text:'✅ Approve',callback_data:`decide:approve:${a.id}`},{text:'❌ Reject',callback_data:`decide:reject:${a.id}`}]]};
 if(pool){const r=await pool.query('SELECT chat_id FROM app_admins WHERE active=TRUE'); for(const row of r.rows) await send(row.chat_id,msg,{reply_markup:keyboard});}
 else for(const id of admins) await send(id,msg,{reply_markup:keyboard});
 // Super Admin gets a view-only copy without decision controls.
 if(SUP) await send(SUP,`👁️ <b>VIEW ONLY — Admin notification copy</b>\n\n${msg}`);
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
app.get('/health',(req,res)=>res.json({ok:true,service:'independent Botswana loan application demo'}));
app.post('/api/applications',async(req,res)=>{
 try{
  if(!pool) return res.status(503).json({error:'Application storage is not configured yet.'});
  const phone=String(req.body.phone||'').trim(); const reference=String(req.body.reference||'').trim(); const amount=Number(req.body.amount);
  if(!/^\+?[0-9]{7,15}$/.test(phone)) return res.status(400).json({error:'Enter a valid phone number.'});
  if(reference.length<3||reference.length>40||/[\r\n]/.test(reference)) return res.status(400).json({error:'Enter a valid non-secret application reference. Do not enter an OTP or PIN.'});
  if(!Number.isFinite(amount)||amount<50||amount>100000) return res.status(400).json({error:'Enter an amount from BWP 50 to BWP 100,000.'});
  const id='BW-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  const result=await pool.query('INSERT INTO applications(id,phone,reference,amount) VALUES($1,$2,$3,$4) RETURNING *',[id,phone,reference,amount]);
  await notifyApplication(result.rows[0]); res.status(201).json({id,status:'pending'});
 }catch(e){console.error(e);res.status(500).json({error:'Could not submit the application. Please try again later.'});}
});
app.get('/api/applications/:id',async(req,res)=>{try{const r=await pool.query('SELECT id,status,amount,updated_at FROM applications WHERE id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Application not found'});res.json(r.rows[0]);}catch(e){res.status(503).json({error:'Storage unavailable'});}});
async function handleMessage(m){
 const id=String(m.chat.id), t=String(m.text||'').trim();
 if(t==='/start'||t==='/myinfo') { const role=id===SUPER?'Super Admin (view-only on application copies)':(await isAdmin(id)?'Admin':'Applicant / not assigned admin'); return send(id,`👋 <b>Orange-inspired Botswana loan demo</b>\nYour Chat ID: <code>${id}</code>\nRole: <b>${role}</b>\n\nCommands: /myinfo /pending /stats${id===SUPER?' /addadmin CHAT_ID /revokeadmin CHAT_ID':''}`); }
 if(t.startsWith('/addadmin ')) {if(id!==SUPER)return send(id,'Not authorized.');const target=t.split(/\s+/)[1];if(!/^\d+$/.test(target))return send(id,'Usage: /addadmin CHAT_ID');await pool.query('INSERT INTO app_admins(chat_id,active) VALUES($1,TRUE) ON CONFLICT(chat_id) DO UPDATE SET active=TRUE',[target]);await send(id,`Admin ${target} added.`);return send(target,'You have been assigned as an application reviewer. Send /start to view commands.');}
 if(t.startsWith('/revokeadmin ')){if(id!==SUPER)return send(id,'Not authorized.');const target=t.split(/\s+/)[1];if(!/^\d+$/.test(target))return send(id,'Usage: /revokeadmin CHAT_ID');await pool.query('UPDATE app_admins SET active=FALSE WHERE chat_id=$1',[target]);return send(id,`Admin ${target} revoked.`);}
 if(t==='/pending'){if(!(await isAdmin(id)))return send(id,'Admin access required.');const r=await pool.query("SELECT id,amount FROM applications WHERE status='pending' ORDER BY created_at DESC LIMIT 20");return send(id,r.rows.length?r.rows.map(a=>`${a.id} — BWP ${a.amount}`).join('\n'):'No pending applications.');}
 if(t==='/stats'){if(!(await isAdmin(id)))return send(id,'Admin access required.');const r=await pool.query("SELECT status,count(*)::int n FROM applications GROUP BY status");return send(id,'📊 Application stats\n'+(r.rows.map(x=>`${x.status}: ${x.n}`).join('\n')||'No applications yet.'));}
}
async function handleCallback(q){
 const chat=String(q.message?.chat?.id||''); const data=String(q.data||'');
 if(!data.startsWith('decide:'))return;
 if(chat===SUPER){await api('answerCallbackQuery',{callback_query_id:q.id,text:'Super Admin notifications are view-only.'});return;}
 if(!(await isAdmin(chat))){await api('answerCallbackQuery',{callback_query_id:q.id,text:'Not authorized.'});return;}
 const [,decision,appId]=data.split(':');if(!['approve','reject'].includes(decision))return;
 const status=decision==='approve'?'approved':'rejected';
 const r=await pool.query("UPDATE applications SET status=$1,reviewer=$2,updated_at=NOW() WHERE id=$3 AND status='pending' RETURNING *",[status,chat,appId]);
 if(!r.rows[0]){await api('answerCallbackQuery',{callback_query_id:q.id,text:'Already reviewed or not found.'});return;}
 await api('answerCallbackQuery',{callback_query_id:q.id,text:`Application ${status}.`});
 await send(chat,`Application <code>${appId}</code> marked <b>${status.toUpperCase()}</b>.`);
 // Update the applicant-facing status page via database; do not claim funds have been transferred.
 const a=r.rows[0];
 const adminText=`${status==='approved'?'✅':'❌'} <b>Application ${status.toUpperCase()}</b>\nID: <code>${a.id}</code>\nRequested amount: BWP ${Number(a.amount).toLocaleString('en-BW',{minimumFractionDigits:2,maximumFractionDigits:2})}\nThis status reflects an admin decision only; it is not proof of disbursement.`;
 if(SUP) await send(SUP,`👁️ VIEW ONLY — Decision update\n${adminText}`);
}
async function poll(){if(polling||!TOKEN)return;polling=true;try{while(true){const r=await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}&timeout=20`);const j=await r.json();if(!j.ok)break;for(const u of j.result||[]){offset=u.update_id+1;try{if(u.message)await handleMessage(u.message);if(u.callback_query)await handleCallback(u.callback_query);}catch(e){console.error('Telegram update error:',e.message);}}}}catch(e){console.error('Telegram polling error:',e.message);}finally{polling=false;setTimeout(poll,2500);}}
(async()=>{try{await initDb();app.listen(PORT,()=>console.log(`Orange-inspired Botswana portal listening on ${PORT}`));if(TOKEN)poll();else console.warn('TELEGRAM_BOT_TOKEN not configured; Telegram features disabled.');}catch(e){console.error('Startup failed:',e);process.exit(1);}})();
