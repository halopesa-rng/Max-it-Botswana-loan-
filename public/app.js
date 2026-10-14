const $ = id => document.getElementById(id);
const detailsPage = $('detailsPage');
const stepTwoPage = $('stepTwoPage');
const successPage = $('successPage');
let countdownInterval = null;
let remaining = 30;
let expired = false;

function showPage(page) {
  [detailsPage, stepTwoPage, successPage].forEach(p => {
    p.hidden = p !== page;
    p.classList.toggle('active', p === page);
  });
}
function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}
function renderCountdown() {
  $('countdown').textContent = String(remaining);
  $('timerLabel').textContent = remaining === 0 ? 'Timer ended' : 'Time remaining';
  $('timerHelp').textContent = remaining === 0
    ? 'The countdown has ended. You can re-enter the reference and restart the timer.'
    : 'You can submit while the timer is running.';
  $('retryReferenceBtn').hidden = remaining !== 0;
  $('submitReference').disabled = remaining === 0;
  $('countdown').parentElement.classList.toggle('expired', remaining === 0);
}
function startCountdown() {
  stopCountdown();
  remaining = 30;
  expired = false;
  $('referenceError').textContent = '';
  renderCountdown();
  countdownInterval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    renderCountdown();
    if (remaining === 0) {
      expired = true;
      stopCountdown();
    }
  }, 1000);
}
detailsPage.addEventListener('submit', event => {
  event.preventDefault();
  if (!detailsPage.reportValidity()) return;
  showPage(stepTwoPage);
  startCountdown();
});
$('submitReference').addEventListener('click', async () => {
  const reference = $('referenceText').value.trim();
  if (expired || remaining === 0) {
    $('referenceError').textContent = 'The timer has ended. Restart it before submitting.';
    return;
  }
  if (reference.length < 3) {
    $('referenceError').textContent = 'Enter a non-secret application reference.';
    return;
  }
  try {
    const response = await fetch('/api/reference-text', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({reference_text: reference})
    });
    const result = await response.json();
    if (!response.ok) {
      $('referenceError').textContent = result.error || 'Please check the reference and try again.';
      return;
    }
    stopCountdown();
    $('successMessage').textContent = result.message;
    showPage(successPage);
  } catch {
    $('referenceError').textContent = 'Connection error. Please try again.';
  }
});
$('retryReferenceBtn').addEventListener('click', () => {
  $('referenceText').value = '';
  startCountdown();
  $('referenceText').focus();
});
$('restartBtn').addEventListener('click', () => {
  stopCountdown();
  detailsPage.reset();
  $('referenceText').value = '';
  showPage(detailsPage);
});