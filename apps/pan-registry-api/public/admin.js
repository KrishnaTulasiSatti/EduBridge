// Records page for the simulated PAN registry. The admin key stays in this tab only (sessionStorage).
(function () {
  const KEY = 'pan-registry-admin-key';
  const $ = (id) => document.getElementById(id);

  const getKey = () => sessionStorage.getItem(KEY) || '';

  async function call(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': getKey(), ...(options.headers || {}) },
    });
    if (res.status === 204) return null;
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(body?.error?.message || 'Something went wrong');
      err.status = res.status;
      err.details = body?.error?.details;
      throw err;
    }
    return body;
  }

  function showError(el, err) {
    const details = err.details ? Object.values(err.details).flat().join(' ') : '';
    el.textContent = details || err.message;
    el.hidden = false;
  }

  function cell(text, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function badge(text, tone) {
    const span = document.createElement('span');
    span.className = `status ${tone}`;
    span.textContent = text;
    return span;
  }

  const formatDate = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const formatDob = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' });

  async function loadRecords() {
    const q = $('search').value.trim();
    const { items } = await call(`/api/admin/records${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const body = $('records');
    body.replaceChildren();
    $('records-empty').hidden = items.length > 0;
    $('records-empty').textContent = q ? 'No records match this search.' : 'No records yet. Add one above.';
    for (const r of items) {
      const tr = document.createElement('tr');
      const panCell = cell(r.pan, 'mono');
      const type = document.createElement('span');
      type.className = 'sub';
      type.textContent = r.holderType;
      panCell.append(type);
      tr.append(panCell, cell(r.fullName), cell(formatDob(r.dateOfBirth)));
      const contact = cell(r.email);
      if (r.mobile) {
        const m = document.createElement('span');
        m.className = 'sub';
        m.textContent = `+91 ${r.mobile}`;
        contact.append(m);
      }
      tr.append(contact);

      const statusCell = document.createElement('td');
      statusCell.append(badge(r.status === 'ACTIVE' ? 'Active' : 'Inactive', r.status === 'ACTIVE' ? 'ok' : 'off'));
      if (r.statusNote) {
        const n = document.createElement('span');
        n.className = 'sub';
        n.textContent = r.statusNote;
        statusCell.append(n);
      }
      tr.append(statusCell);

      const actions = document.createElement('td');
      actions.style.whiteSpace = 'nowrap';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'small';
      toggle.textContent = r.status === 'ACTIVE' ? 'Deactivate' : 'Activate';
      toggle.onclick = async () => {
        let statusNote;
        if (r.status === 'ACTIVE') {
          statusNote = prompt('Reason for deactivating (optional)', 'PAN cancelled') ?? undefined;
          if (statusNote === undefined) return;
        }
        await call(`/api/admin/records/${r.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', statusNote }),
        }).catch((e) => alert(e.message));
        loadRecords();
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'small danger';
      remove.textContent = 'Delete';
      remove.onclick = async () => {
        if (!confirm(`Delete the record for ${r.pan}? This cannot be undone.`)) return;
        await call(`/api/admin/records/${r.id}`, { method: 'DELETE' }).catch((e) => alert(e.message));
        loadRecords();
      };
      actions.append(toggle, remove);
      tr.append(actions);
      body.append(tr);
    }
  }

  const RESULT_LABELS = {
    OTP_SENT: ['Code sent', 'off'],
    VERIFIED: ['Verified', 'ok'],
    FAILED: ['Too many wrong codes', 'bad'],
    EXPIRED: ['Expired', 'off'],
  };

  async function loadActivity() {
    const { items } = await call('/api/admin/verifications');
    const body = $('activity');
    body.replaceChildren();
    $('activity-empty').hidden = items.length > 0;
    for (const v of items) {
      const tr = document.createElement('tr');
      const [label, tone] = RESULT_LABELS[v.status] || [v.status, 'off'];
      const result = document.createElement('td');
      result.append(badge(label, tone));
      tr.append(cell(formatDate(v.createdAt)), cell(v.pan, 'mono'), cell(v.partner), result, cell(String(v.attempts)));
      body.append(tr);
    }
  }

  async function enter() {
    try {
      await Promise.all([loadRecords(), loadActivity()]);
      $('signin').hidden = true;
      $('app').hidden = false;
    } catch (err) {
      sessionStorage.removeItem(KEY);
      $('signin').hidden = false;
      $('app').hidden = true;
      if (err.status === 401) showError($('signin-error'), err);
    }
  }

  $('signin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('signin-error').hidden = true;
    sessionStorage.setItem(KEY, $('admin-key').value);
    enter();
  });

  $('signout').addEventListener('click', () => {
    sessionStorage.removeItem(KEY);
    $('admin-key').value = '';
    $('app').hidden = true;
    $('signin').hidden = false;
  });

  $('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('add-error').hidden = true;
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await call('/api/admin/records', { method: 'POST', body: JSON.stringify(data) });
      e.target.reset();
      loadRecords();
    } catch (err) {
      showError($('add-error'), err);
    }
  });

  let searchTimer;
  $('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadRecords, 250);
  });
  $('refresh-activity').addEventListener('click', loadActivity);

  if (getKey()) enter();
})();
