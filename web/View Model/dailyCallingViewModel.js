import { TempSessionService } from '../temp/temp_file_sessionService.js?v=20260901-5';
import { TenantService } from './tenantService.js?v=20260901-1';
import { TempDataService } from '../temp/temp_file_dataService.js?v=20260901-5';

const session = TempSessionService.requireRole('admin','manager','employee');
if (!session) throw new Error('Login required.');
const tenant = TenantService.current();
const service = new TempDataService();
const COOLDOWN_MS = 10000;
const key = `hindPharmaCalling_${tenant.id}`;
const pendingCallKey = `hindPharmaPendingCall_${tenant.id}_${session.id}`;

const $ = id => document.getElementById(id);
$('shopName').textContent = tenant.business_name;
$('shopSubtitle').textContent = tenant.subtitle || 'DAILY CALLING';
$('logoutButton').onclick = () => { TempSessionService.clear(); location.replace('login.html'); };

function logs() {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
}
function save(items) { localStorage.setItem(key, JSON.stringify(items)); }
function buildLogIndex(items) {
  const index = new Map();
  for (const item of items) {
    const medicalId = Number(item.medical_id);
    if (!Number.isFinite(medicalId)) continue;
    const current = index.get(medicalId);
    if (!current || new Date(item.called_at).getTime() > new Date(current.called_at).getTime()) index.set(medicalId, item);
  }
  return index;
}
function statusFor(log) {
  if (!log) return { called: false, picked: 'not-called' };
  const called = Boolean(log.is_call);
  const picked = log.is_pick === true ? 'picked' : log.is_pick === false ? 'not-picked' : 'pending';
  return { called, picked };
}
function matchesFilter(log, filter) {
  const { called, picked } = statusFor(log);
  if (filter === 'called') return called;
  if (filter === 'not-called') return !log || !called;
  if (filter === 'pending') return called && picked === 'pending';
  if (filter === 'picked') return picked === 'picked';
  if (filter === 'not-picked') return picked === 'not-picked';
  return true;
}

function markPendingCallAsCalled() {
  const pendingId = sessionStorage.getItem(pendingCallKey);
  if (!pendingId) return false;
  const items = logs();
  const index = items.findIndex(item => item.id === pendingId && String(item.employee_id) === String(session.id));
  if (index < 0) {
    sessionStorage.removeItem(pendingCallKey);
    return false;
  }
  if (!items[index].is_call) {
    items[index] = { ...items[index], is_call: true, call_started_at: new Date().toISOString() };
    save(items);
  }
  sessionStorage.removeItem(pendingCallKey);
  return true;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') markPendingCallAsCalled();
  if (document.visibilityState === 'visible') render();
});

async function render() {
  const list = $('callingList');
  const filter = $('callingFilter').value;
  try {
    const medicals = await service.getMedicals();
    const tenantMedicals = medicals.filter(m => Number(m.admin_id || tenant.id) === Number(tenant.id));
    const logIndex = buildLogIndex(logs());
    const filteredMedicals = tenantMedicals.filter(m => matchesFilter(logIndex.get(Number(m.id)), filter));
    $('callingCount').textContent = `${filteredMedicals.length} of ${tenantMedicals.length}`;
    if (!tenantMedicals.length) { list.innerHTML = '<p>No medicals are available for today.</p>'; return; }
    if (!filteredMedicals.length) { list.innerHTML = '<p class="emptyFilter">No medicals match this filter.</p>'; return; }
    list.innerHTML = filteredMedicals.map(m => {
      const log = logIndex.get(Number(m.id));
      const picked = log?.is_pick === true ? 'Picked' : log?.is_pick === false ? 'Not Picked' : 'Pending';
      const called = Boolean(log?.is_call);
      return `<article class="card callingRow"><div><strong>${m.name}</strong><div>${m.area || ''}</div><div class="callingStatus">Status: ${called ? 'Called' : 'Not Called'} · ${picked}</div></div><a class="btn primary callLink" data-id="${m.id}" data-phone="${m.phone || ''}" href="${m.phone ? `tel:${String(m.phone).replace(/[^0-9+]/g,'')}` : '#'}">${m.phone || 'No mobile number'}</a><div class="pickControls" data-medical="${m.id}" style="display:${called ? 'flex' : 'none'}"><label><input type="radio" name="pick-${m.id}" value="pick" ${log?.is_pick === true ? 'checked' : ''}> Picked</label><label><input type="radio" name="pick-${m.id}" value="not-pick" ${log?.is_pick === false ? 'checked' : ''}> Not Picked</label></div></article>`;
    }).join('');
    list.querySelectorAll('.callLink').forEach(link => link.addEventListener('click', event => {
      const medicalId = Number(link.dataset.id);
      const phone = link.dataset.phone;
      if (!phone) { event.preventDefault(); return; }
      const recent = logs().some(x => String(x.employee_id) === String(session.id) && Date.now() - new Date(x.called_at).getTime() < COOLDOWN_MS);
      if (recent) { event.preventDefault(); alert('Please wait 10 seconds before the next call.'); return; }
      event.preventDefault();
      const now = new Date().toISOString();
      const callId = `CALL-${Date.now()}`;
      const items = logs();
      items.push({ id: callId, tenant_id: tenant.id, admin_id: session.admin_id, medical_id: medicalId, employee_id: session.id, called_at: now, is_call: false, is_pick: null, pending_call: true });
      save(items);
      sessionStorage.setItem(pendingCallKey, callId);
      render();
      setTimeout(() => { window.location.href = `tel:${String(phone).replace(/[^0-9+]/g,'')}`; }, 80);
    }));
    list.querySelectorAll('.pickControls input').forEach(input => input.addEventListener('change', event => {
      const medicalId = Number(event.target.closest('.pickControls').dataset.medical);
      const items = logs().map(item => Number(item.medical_id) === medicalId && String(item.employee_id) === String(session.id) && item.is_call ? {...item, is_pick: event.target.value === 'pick'} : item);
      save(items); render();
    }));
  } catch (_) { $('callingCount').textContent = ''; list.innerHTML = '<p>Calling list could not be loaded.</p>'; }
}
$('callingFilter').addEventListener('change', render);
render();
