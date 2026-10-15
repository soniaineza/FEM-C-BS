(function () {
  'use strict';
  // Everything goes through api.php on this same origin; the browser never
  // talks to the Kimu API or sees an API token.
  var app = document.getElementById('app');
  if (!app) return;
  var OPERATOR = app.getAttribute('data-operator') || '';
  var CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
  var REQUIRED = ['license', 'national_id', 'vehicle_registration', 'insurance'];
  var DOC_NAMES = { license: 'Driving licence', national_id: 'National ID', vehicle_registration: 'Vehicle registration', insurance: 'Insurance', profile_photo: 'Profile photo', vehicle_photo: 'Vehicle photo', other: 'Other' };
  var REFRESH_MS = 15000;
  var tab = 'drivers';
  var refreshTimer = null;
  var $ = function (id) { return document.getElementById(id); };

  // Everything shown comes from riders and drivers, so it is only ever put
  // on the page as text, never as HTML.
  function el(tag, text, cls) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function button(text, cls, onClick) {
    var b = el('button', text, cls);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function apiUrl(path) { return 'api.php?path=' + encodeURIComponent(path.split('?')[0]) + (path.indexOf('?') >= 0 ? '&' + path.split('?')[1] : ''); }

  function call(method, path, body) {
    return fetch(apiUrl(path), {
      method: method,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          // The dashboard session ended: back to the sign-in form.
          window.location.reload();
          throw new Error('Signed out.');
        }
        if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
        return data;
      });
    });
  }
  function money(n) { return 'RWF ' + Math.round(Number(n) || 0).toLocaleString(); }
  function when(v) { return v ? new Date(v).toLocaleString() : ''; }
  function size(bytes) { return bytes ? (bytes / 1024 / 1024).toFixed(bytes > 1024 * 1024 ? 1 : 2) + ' MB' : ''; }
  function setStatus(text) { $('status').textContent = text; }

  // Runs one decision: disables the button, shows what happened, reloads.
  function act(btn, work) {
    btn.disabled = true;
    setStatus('Working…');
    Promise.resolve().then(work).then(function () { return load(); }).catch(function (err) {
      btn.disabled = false;
      setStatus('Not done: ' + err.message);
    });
  }
  function ask(question) { var v = window.prompt(question); return v == null ? null : v.trim(); }

  // ---- drivers ----
  function latestDocuments(d) {
    var latest = {};
    (d.documents || []).slice().sort(function (a, b) { return new Date(b.uploadedAt) - new Date(a.uploadedAt); })
      .forEach(function (doc) { if (!latest[doc.docType]) latest[doc.docType] = doc; });
    return latest;
  }

  function fileControls(card, doc, type) {
    var actions = el('span', null, 'actions');
    var path = '/documents/' + doc.id + '/file';
    var isImage = (doc.contentType || '').indexOf('image/') === 0;
    var preview = null;
    if (isImage) {
      var show = button('View', 'small', function () {
        if (preview) { preview.remove(); preview = null; show.textContent = 'View'; return; }
        preview = document.createElement('img');
        preview.className = 'doc-preview';
        preview.alt = DOC_NAMES[type] + ' preview';
        preview.src = apiUrl(path);
        preview.onerror = function () { setStatus('Could not load the file for ' + DOC_NAMES[type] + '.'); };
        card.appendChild(preview);
        show.textContent = 'Hide';
      });
      actions.appendChild(show);
    }
    var open = el('a', isImage ? 'Open' : 'Open file');
    open.href = apiUrl(path);
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'tag';
    actions.appendChild(open);
    return actions;
  }

  function driverCard(d, pending) {
    var card = el('div', null, 'card');
    card.appendChild(el('h2', d.fullName || 'Driver'));
    card.appendChild(el('p', (d.phone || '') + ' · registered ' + when(d.createdAt) + (d.vehiclePlate ? ' · ' + [d.vehicleMake, d.vehicleModel, d.vehicleColor, d.vehiclePlate].filter(Boolean).join(' ') : '') + (d.licenseNumber ? ' · licence no. ' + d.licenseNumber : ''), 'muted'));
    var latest = latestDocuments(d);
    var missing = REQUIRED.filter(function (t) { return !latest[t]; });
    var ul = el('ul', null, 'docs');
    REQUIRED.forEach(function (type) {
      var doc = latest[type];
      var li = el('li');
      var name = el('span', DOC_NAMES[type], 'name');
      if (doc) {
        var meta = el('span', (doc.fileName || '') + (doc.fileSize ? ' · ' + size(doc.fileSize) : '') + (doc.uploadedAt ? ' · uploaded ' + when(doc.uploadedAt) : ''), 'meta');
        name.appendChild(meta);
        if (doc.status === 'rejected' && doc.rejectionReason) name.appendChild(el('span', 'Rejected: ' + doc.rejectionReason, 'meta'));
        if (doc.status === 'approved' && doc.reviewedBy) name.appendChild(el('span', 'Approved by ' + doc.reviewedBy + (doc.evidenceReference ? ' — ' + doc.evidenceReference : ''), 'meta'));
      }
      var state = !doc ? ['not submitted', 'wait'] : doc.status === 'approved' ? ['approved', 'ok'] : doc.status === 'rejected' ? ['rejected — waiting for a new upload', 'bad'] : ['to check', 'wait'];
      li.appendChild(name);
      li.appendChild(el('span', state[0] + (doc && !doc.hasFile ? ' · file missing' : ''), 'tag ' + state[1]));
      if (doc && doc.hasFile) li.appendChild(fileControls(card, doc, type));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    var extras = (d.documents || []).filter(function (doc) { return REQUIRED.indexOf(doc.docType) < 0 && doc.hasFile; });
    if (extras.length) {
      var extraList = el('ul', null, 'docs');
      extras.forEach(function (doc) {
        var li = el('li');
        li.appendChild(el('span', (DOC_NAMES[doc.docType] || doc.docType) + (doc.fileName ? ' — ' + doc.fileName : ''), 'name'));
        li.appendChild(fileControls(card, doc, doc.docType));
        extraList.appendChild(li);
      });
      card.appendChild(el('p', 'Also uploaded:', 'muted'));
      card.appendChild(extraList);
    }
    if (pending && missing.length) {
      card.appendChild(el('p', 'Waiting for the driver to submit in the app: ' + missing.map(function (t) { return DOC_NAMES[t]; }).join(', ') + '.', 'muted'));
    }
    var row = el('div', null, 'row');
    if (pending) {
      var approve = button('I checked the originals — approve driver', 'primary', function () {
        var evidence = ask('Where is this inspection recorded? (for example: office log 12 Oct, page 3)');
        if (!evidence) return;
        act(approve, function () {
          return REQUIRED.reduce(function (chain, type) {
            return chain.then(function () {
              if (latest[type].status === 'approved') return null;
              return call('POST', '/documents/' + latest[type].id + '/review', { status: 'approved', reviewer: OPERATOR, method: 'in_person', evidenceReference: evidence });
            });
          }, Promise.resolve()).then(function () { return call('POST', '/drivers/' + d.id + '/verify'); });
        });
      });
      approve.disabled = missing.length > 0 || REQUIRED.some(function (type) {
        return !latest[type] || !latest[type].hasFile || latest[type].status === 'rejected';
      });
      row.appendChild(approve);
      REQUIRED.forEach(function (type) {
        var doc = latest[type];
        if (!doc || doc.status !== 'pending') return;
        var reject = button('Reject ' + DOC_NAMES[type].toLowerCase(), 'danger', function () {
          var reason = ask('Why is it rejected? The driver will see this.');
          if (!reason) return;
          act(reject, function () { return call('POST', '/documents/' + doc.id + '/review', { status: 'rejected', reason: reason, reviewer: OPERATOR }); });
        });
        row.appendChild(reject);
      });
    } else {
      card.appendChild(el('p', 'Status: ' + (d.status || 'unknown') + (d.rating != null ? ' · rating ' + d.rating : '') + ' · ' + (d.totalTrips || 0) + ' trips', 'muted'));
      var suspend = button('Suspend driver', 'danger', function () {
        var reason = ask('Why is the driver suspended? The driver will see this.');
        if (!reason) return;
        act(suspend, function () { return call('POST', '/drivers/' + d.id + '/suspend', { reason: reason }); });
      });
      row.appendChild(suspend);
    }
    card.appendChild(row);
    return card;
  }

  function renderDrivers(data) {
    var list = $('list');
    if (!data.drivers.length) { list.appendChild(el('p', 'No drivers are waiting for approval.', 'muted')); return; }
    data.drivers.forEach(function (d) { list.appendChild(driverCard(d, true)); });
  }
  function renderVerified(data) {
    var list = $('list');
    if (!data.drivers.length) { list.appendChild(el('p', 'No verified drivers yet.', 'muted')); return; }
    data.drivers.forEach(function (d) { list.appendChild(driverCard(d, false)); });
  }

  // ---- payment cases ----
  var CASES = {
    cash_unconfirmed: { title: 'Cash not confirmed by the driver', help: 'The driver did not confirm the cash fare in time. Call the driver and the rider, then record what happened.', options: [['Cash was received', 'cash_received', 'primary'], ['Cash was NOT received', 'cash_not_received', 'danger']] },
    refund: { title: 'Money to send back', help: 'Paypack collected this money but it could not be applied to a ride or wallet. Send it back to the number shown, then record the transfer.', options: [['Refund sent', 'refunded', 'primary'], ['No refund is due', 'no_refund_due', '']] },
  };
  function renderCases(data) {
    var list = $('list');
    if (!data.exceptions.length) { list.appendChild(el('p', 'No open payment cases.', 'muted')); return; }
    data.exceptions.forEach(function (x) {
      var kind = x.reason === 'cash_unconfirmed' ? CASES.cash_unconfirmed : CASES.refund;
      var card = el('div', null, 'card');
      card.appendChild(el('h2', kind.title));
      card.appendChild(el('p', money(x.amount) + ' · ' + (x.method || '') + (x.phone ? ' · ' + x.phone : '') + ' · opened ' + when(x.created_at), 'muted'));
      card.appendChild(el('p', kind.help));
      card.appendChild(el('p', 'Reason recorded: ' + x.reason + (x.ride_id ? ' · ride ' + x.ride_id : ''), 'muted'));
      var row = el('div', null, 'row');
      kind.options.forEach(function (opt) {
        var b = button(opt[0], opt[2], function () {
          var reference = ask('Reference for this decision (transfer ID, call log, receipt number):');
          if (!reference) return;
          act(b, function () { return call('POST', '/payment-exceptions/' + x.id + '/resolve', { resolution: opt[1], reference: reference + ' — ' + OPERATOR }); });
        });
        row.appendChild(b);
      });
      card.appendChild(row);
      list.appendChild(card);
    });
  }

  // ---- emergencies ----
  function renderSos(data) {
    var list = $('list');
    if (!data.emergencies.length) { list.appendChild(el('p', 'No open emergencies.', 'muted')); return; }
    data.emergencies.forEach(function (e) {
      var card = el('div', null, 'card');
      card.appendChild(el('h2', 'SOS ' + (e.reference || '')));
      card.appendChild(el('p', (e.contact_role || 'Rider') + ' ' + (e.contact_name || '') + ' · ' + (e.contact_phone || 'unknown') + ' · ' + when(e.created_at), 'muted'));
      if (e.latitude != null && e.longitude != null) card.appendChild(el('p', 'Location: ' + e.latitude + ', ' + e.longitude + (e.address ? ' (' + e.address + ')' : '')));
      if (e.details) card.appendChild(el('p', e.details));
      var row = el('div', null, 'row');
      var done = button('Handled — close', 'primary', function () {
        if (!window.confirm('Close this emergency? Only do this after you have spoken to the rider.')) return;
        act(done, function () { return call('POST', '/emergencies/' + e.id + '/resolve'); });
      });
      row.appendChild(done);
      card.appendChild(row);
      list.appendChild(card);
    });
  }

  // ---- integrations (Google login, verification codes) ----
  function renderIntegrations(data) {
    var list = $('list');
    var g = data.google || {};
    var card = el('div', null, 'card');
    card.appendChild(el('h2', 'Google login'));
    card.appendChild(el('p', g.enabled ? 'Connected — the rider app shows "Continue with Google".' : 'Not configured — the rider app hides the Google button until the keys are set.', 'tag ' + (g.enabled ? 'ok' : 'wait')));
    card.appendChild(el('p', 'Client ID: ' + (g.clientId || 'not set'), 'muted'));
    card.appendChild(el('p', 'Authorized redirect URI to register in the Google Cloud console: ' + (g.redirectUri || 'not available — set PUBLIC_URL on the server'), 'muted'));
    list.appendChild(card);

    var o = data.otp || {};
    var wa = o.whatsapp || {};
    var sms = o.sms || {};
    var otp = el('div', null, 'card');
    otp.appendChild(el('h2', 'Verification codes (OTP)'));
    var line;
    if (wa.active) line = ['WhatsApp: connected — codes go to WhatsApp' + (sms.configured ? ', with SMS (' + sms.provider + ') as the fallback.' : '. No SMS fallback.'), 'ok'];
    else if (o.channel === 'whatsapp') line = ['WhatsApp: selected but not configured — set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.', 'wait'];
    else line = ['WhatsApp: off (OTP_CHANNEL=sms).' + (sms.configured ? ' Codes go by SMS through ' + sms.provider + '.' : ''), sms.configured ? 'ok' : 'wait'];
    otp.appendChild(el('p', line[0], 'tag ' + line[1]));
    if (!o.ready) otp.appendChild(el('p', 'No delivery channel is configured: riders cannot receive codes on this server.', 'error'));
    var label = el('label', 'Send yourself a test code (international format)');
    label.htmlFor = 'testPhone';
    var input = el('input');
    input.id = 'testPhone';
    input.type = 'tel';
    input.placeholder = '+2507XXXXXXXX';
    input.autocomplete = 'tel';
    var row = el('div', null, 'row');
    var send = button('Send test code', 'primary', function () {
      var phone = input.value.trim();
      if (!phone) { setStatus('Enter a phone number first.'); return; }
      send.disabled = true;
      setStatus('Sending…');
      call('POST', '/integrations/otp/test', { phone: phone })
        .then(function (r) { setStatus(r.message); })
        .catch(function (err) { setStatus('Not sent: ' + err.message); })
        .finally(function () { send.disabled = false; });
    });
    row.appendChild(send);
    otp.appendChild(label);
    otp.appendChild(input);
    otp.appendChild(row);
    list.appendChild(otp);
  }

  var TABS = {
    drivers: { path: '/drivers?verified=false', render: renderDrivers },
    verified: { path: '/drivers?verified=true', render: renderVerified },
    cases: { path: '/payment-exceptions', render: renderCases },
    sos: { path: '/emergencies', render: renderSos },
    // Static settings and a form: no automatic refresh (it would wipe the input).
    integrations: { path: '/integrations', render: renderIntegrations, noRefresh: true },
  };

  function load() {
    $('list').textContent = '';
    setStatus('Loading…');
    return call('GET', TABS[tab].path).then(function (data) {
      setStatus('Updated ' + new Date().toLocaleTimeString() + (TABS[tab].noRefresh ? '' : ' · refreshes every 15 s'));
      TABS[tab].render(data);
    }).catch(function (err) { setStatus('Could not load: ' + err.message); throw err; })
      .finally(scheduleRefresh);
  }

  function stopRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function scheduleRefresh() {
    stopRefresh();
    if (document.hidden || TABS[tab].noRefresh) return;
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      // Never wipe a preview the operator is looking at: reload only when
      // nothing is open and no prompt is up.
      if (document.querySelector('.doc-preview')) { scheduleRefresh(); return; }
      load().catch(function () {});
    }, REFRESH_MS);
  }

  $('reload').addEventListener('click', function () { load().catch(function () {}); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopRefresh();
    else load().catch(function () {});
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
    b.addEventListener('click', function () {
      tab = b.getAttribute('data-tab');
      Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      load().catch(function () {});
    });
  });

  load().catch(function () {});
})();
