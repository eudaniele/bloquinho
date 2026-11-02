/* Meu Bloquinho — anotações e tarefas. Dados salvos no aparelho; sincronização opcional com um repositório privado do GitHub. */
(function () {
  'use strict';

  var DATA_KEY = 'bloquinho.dados.v1';
  var SYNC_KEY = 'bloquinho.sync.v1';
  var UI_KEY = 'bloquinho.ui.v1';
  var DRAFT_KEY = 'bloquinho.rascunho.v1';
  var SYNC_FILE = 'bloquinho.json';
  var TOMBSTONE_DAYS = 90;

  var $ = function (id) { return document.getElementById(id); };

  /* ================= armazenamento local ================= */
  function readJSON(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  var storageOK = true;
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { storageOK = false; return false; }
  }

  function emptyData() { return { notes: [], tasks: [] }; }
  var data = normalize(readJSON(DATA_KEY, emptyData()));
  var sync = readJSON(SYNC_KEY, null); // {owner, repo, token, sha, lastSync, lastError}
  var ui = readJSON(UI_KEY, { view: 'notes', showDone: false, lastExport: 0 });
  var draft = readJSON(DRAFT_KEY, { note: '', task: '' });

  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    var out = emptyData();
    (Array.isArray(d.notes) ? d.notes : []).forEach(function (n) {
      if (!n || !n.id) return;
      out.notes.push({ id: String(n.id), text: String(n.text || ''), date: validDate(n.date), created: +n.created || Date.now(), updated: +n.updated || +n.created || Date.now(), del: n.del ? 1 : 0 });
    });
    (Array.isArray(d.tasks) ? d.tasks : []).forEach(function (t) {
      if (!t || !t.id) return;
      out.tasks.push({ id: String(t.id), text: String(t.text || ''), date: validDate(t.date), done: !!t.done, doneAt: +t.doneAt || 0, created: +t.created || Date.now(), updated: +t.updated || +t.created || Date.now(), del: t.del ? 1 : 0 });
    });
    return out;
  }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }

  function save() {
    var ok = writeJSON(DATA_KEY, data);
    if (!ok) toast('Não consegui salvar neste aparelho. Faça um backup agora.');
    lastSavedAt = Date.now();
    updateStatus();
    scheduleSync(1500);
  }
  var lastSavedAt = 0;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ================= datas ================= */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return iso(new Date()); }
  function addDays(isoStr, n) { var p = isoStr.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MO_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function shortDate(s) {
    var d = parseISO(s); var t = todayISO();
    var base = d.getDate() + ' ' + MO[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) base += ' ' + d.getFullYear();
    if (s === t) return 'hoje';
    if (s === addDays(t, 1)) return 'amanhã';
    if (s === addDays(t, -1)) return 'ontem';
    return base;
  }
  function dayHeading(s) {
    var t = todayISO();
    if (s === t) return 'Hoje';
    if (s === addDays(t, 1)) return 'Amanhã';
    var d = parseISO(s);
    var txt = WD[d.getDay()] + ', ' + d.getDate() + ' de ' + MO_FULL[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) txt += ' de ' + d.getFullYear();
    return txt;
  }
  function stampDate(ms) {
    var d = new Date(ms); return shortDate(iso(d));
  }
  function clock(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ================= utilidades de tela ================= */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var toastTimer = null;
  function toast(text, actionLabel, action) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    clearTimeout(toastTimer);
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = '<span>' + esc(text) + '</span>' + (actionLabel ? '<button type="button">' + esc(actionLabel) + '</button>' : '');
    if (actionLabel) el.querySelector('button').addEventListener('click', function () { el.remove(); action(); });
    document.body.appendChild(el);
    toastTimer = setTimeout(function () { el.remove(); }, actionLabel ? 6000 : 3200);
  }
  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.4) + 'px'; }

  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5.5 12.5 4 4 9-9.5"/></svg>';

  /* ================= navegação ================= */
  function setView(v) {
    ui.view = v === 'tasks' ? 'tasks' : 'notes';
    writeJSON(UI_KEY, ui);
    $('view-notes').hidden = ui.view !== 'notes';
    $('view-tasks').hidden = ui.view !== 'tasks';
    $('tab-notes').setAttribute('aria-selected', ui.view === 'notes');
    $('tab-tasks').setAttribute('aria-selected', ui.view === 'tasks');
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.dataset.view); });
  });

  /* ================= ANOTAÇÕES ================= */
  var noteText = $('noteText'), noteDate = $('noteDate'), noteSave = $('noteSave');
  function refreshNoteComposer() {
    noteSave.disabled = !noteText.value.trim();
    var has = !!noteDate.value;
    $('noteDateLabel').textContent = has ? shortDate(noteDate.value) : 'Data';
    $('noteDateChip').setAttribute('aria-pressed', has);
    $('noteDateClear').hidden = !has;
  }
  noteText.addEventListener('input', function () { autoGrow(noteText); refreshNoteComposer(); draft.note = noteText.value; writeJSON(DRAFT_KEY, draft); });
  noteDate.addEventListener('change', refreshNoteComposer);
  $('noteDateClear').addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); noteDate.value = ''; refreshNoteComposer(); });
  $('noteForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = noteText.value.trim(); if (!text) return;
    var now = Date.now();
    data.notes.push({ id: uid(), text: text, date: validDate(noteDate.value), created: now, updated: now, del: 0 });
    noteText.value = ''; noteDate.value = ''; draft.note = ''; writeJSON(DRAFT_KEY, draft);
    autoGrow(noteText); refreshNoteComposer();
    save(); renderNotes();
  });

  function renderNotes() {
    var notes = data.notes.filter(function (n) { return !n.del; }).sort(function (a, b) { return b.created - a.created; });
    var el = $('notesList');
    if (!notes.length) {
      el.innerHTML = '<div class="empty">Folha em branco.<small>Escreva acima e toque em Guardar.</small></div>';
      return;
    }
    var html = '<ul class="list">';
    notes.forEach(function (n) {
      var meta = n.date
        ? '<span class="item-meta dated">' + esc(dayHeading(n.date)) + '</span>'
        : '<span class="item-meta">' + esc(stampDate(n.created)) + '</span>';
      html += '<li class="item note"><button type="button" class="item-body" data-edit-note="' + esc(n.id) + '">' +
        '<span class="item-text">' + esc(n.text) + '</span>' + meta + '</button></li>';
    });
    el.innerHTML = html + '</ul>';
  }
  $('notesList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit-note]'); if (b) openEditor('note', b.dataset.editNote);
  });

  /* ================= TAREFAS ================= */
  var taskText = $('taskText'), taskDate = $('taskDate'), taskSave = $('taskSave');
  var taskWhen = 'today';
  function selectedTaskDate() {
    var t = todayISO();
    if (taskWhen === 'today') return t;
    if (taskWhen === 'tomorrow') return addDays(t, 1);
    if (taskWhen === 'pick') return validDate(taskDate.value);
    return '';
  }
  function refreshTaskComposer() {
    taskSave.disabled = !taskText.value.trim();
    document.querySelectorAll('#taskForm [data-when]').forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.when === taskWhen); });
    $('taskDateChip').setAttribute('aria-pressed', taskWhen === 'pick');
    $('taskDateLabel').textContent = taskWhen === 'pick' && taskDate.value ? shortDate(taskDate.value) : 'Outra';
  }
  document.querySelectorAll('#taskForm [data-when]').forEach(function (c) {
    c.addEventListener('click', function () { taskWhen = c.dataset.when; taskDate.value = ''; refreshTaskComposer(); });
  });
  taskDate.addEventListener('change', function () { taskWhen = taskDate.value ? 'pick' : 'today'; refreshTaskComposer(); });
  taskText.addEventListener('input', function () { refreshTaskComposer(); draft.task = taskText.value; writeJSON(DRAFT_KEY, draft); });
  $('taskForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = taskText.value.trim(); if (!text) return;
    var now = Date.now();
    data.tasks.push({ id: uid(), text: text, date: selectedTaskDate(), done: false, doneAt: 0, created: now, updated: now, del: 0 });
    taskText.value = ''; draft.task = ''; writeJSON(DRAFT_KEY, draft);
    refreshTaskComposer();
    save(); renderTasks();
  });

  function taskRow(t, isLate) {
    var meta = '';
    if (t.done) meta = '<span class="item-meta">feita ' + esc(stampDate(t.doneAt || t.updated)) + (t.date ? ' · era para ' + esc(shortDate(t.date)) : '') + '</span>';
    else if (isLate) meta = '<span class="item-meta late">era para ' + esc(shortDate(t.date)) + '</span>';
    return '<li class="item task' + (t.done ? ' done' : '') + (isLate ? ' is-late' : '') + '">' +
      '<button type="button" class="check" data-toggle="' + esc(t.id) + '" role="checkbox" aria-checked="' + t.done + '" aria-label="' + (t.done ? 'Desmarcar' : 'Concluir') + ': ' + esc(t.text) + '"><span>' + CHECK_SVG + '</span></button>' +
      '<button type="button" class="item-body" data-edit-task="' + esc(t.id) + '"><span class="item-text">' + esc(t.text) + '</span>' + meta + '</button></li>';
  }

  function lateCount() {
    var t = todayISO();
    return data.tasks.filter(function (x) { return !x.del && !x.done && x.date && x.date < t; }).length;
  }

  function renderTasks() {
    var t = todayISO();
    var live = data.tasks.filter(function (x) { return !x.del; });
    var pending = live.filter(function (x) { return !x.done; });
    var done = live.filter(function (x) { return x.done; }).sort(function (a, b) { return (b.doneAt || b.updated) - (a.doneAt || a.updated); });
    var byCreated = function (a, b) { return a.created - b.created; };
    var late = pending.filter(function (x) { return x.date && x.date < t; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : byCreated(a, b); });
    var dated = pending.filter(function (x) { return x.date && x.date >= t; });
    var undated = pending.filter(function (x) { return !x.date; }).sort(byCreated);

    var groups = {};
    dated.forEach(function (x) { (groups[x.date] = groups[x.date] || []).push(x); });
    var days = Object.keys(groups).sort();

    var html = '';
    if (late.length) {
      html += '<div class="section-label late"><span>Atrasadas</span><span class="n">' + late.length + '</span></div>';
      html += '<div class="late-band"><ul class="list">' + late.map(function (x) { return taskRow(x, true); }).join('') + '</ul></div>';
    }
    if (!days.length || days[0] !== t) {
      // sempre mostra "Hoje" para o dia ter um lugar fixo
      html += '<div class="section-label"><span>Hoje</span><span class="n">0</span></div><div class="empty" style="padding:14px 20px 4px;font-size:16px">Nada para hoje.</div>';
    }
    days.forEach(function (d) {
      var list = groups[d].sort(byCreated);
      html += '<div class="section-label"><span>' + esc(dayHeading(d)) + '</span><span class="n">' + list.length + '</span></div>';
      html += '<ul class="list">' + list.map(function (x) { return taskRow(x, false); }).join('') + '</ul>';
    });
    if (undated.length) {
      html += '<div class="section-label"><span>Sem data</span><span class="n">' + undated.length + '</span></div>';
      html += '<ul class="list">' + undated.map(function (x) { return taskRow(x, false); }).join('') + '</ul>';
    }
    if (done.length) {
      html += '<button type="button" class="toggle-done" id="toggleDone">' + (ui.showDone ? 'Esconder concluídas' : 'Ver concluídas (' + done.length + ')') + '</button>';
      if (ui.showDone) {
        html += '<div class="section-label"><span>Concluídas</span><span class="n">' + done.length + '</span></div>';
        html += '<ul class="list">' + done.map(function (x) { return taskRow(x, false); }).join('') + '</ul>';
      }
    }
    if (!live.length) html = '<div class="empty">Nenhuma tarefa.<small>Escreva acima, escolha o dia e toque em Adicionar.</small></div>';
    $('tasksList').innerHTML = html;
    var lc = late.length; var badge = $('lateBadge');
    badge.hidden = !lc; badge.textContent = lc; badge.setAttribute('aria-label', lc + ' atrasadas');
  }

  $('tasksList').addEventListener('click', function (e) {
    var tg = e.target.closest('[data-toggle]');
    if (tg) {
      var task = findTask(tg.dataset.toggle); if (!task) return;
      task.done = !task.done; task.doneAt = task.done ? Date.now() : 0; task.updated = Date.now();
      // marca na hora e reorganiza logo depois, para o toque ficar visível
      var li = tg.closest('.item'); li.classList.toggle('done', task.done); tg.setAttribute('aria-checked', task.done);
      save();
      setTimeout(renderTasks, 380);
      return;
    }
    var ed = e.target.closest('[data-edit-task]'); if (ed) { openEditor('task', ed.dataset.editTask); return; }
    if (e.target.closest('#toggleDone')) { ui.showDone = !ui.showDone; writeJSON(UI_KEY, ui); renderTasks(); }
  });
  function findTask(id) { return data.tasks.find(function (x) { return x.id === id; }); }
  function findNote(id) { return data.notes.find(function (x) { return x.id === id; }); }

  /* ================= edição ================= */
  function closeLayer() { backupOpen = false; $('layer').innerHTML = ''; document.body.style.overflow = ''; }
  function openLayer(html) {
    $('layer').innerHTML = '<div class="scrim" id="scrim"><div class="panel" role="dialog" aria-modal="true"><div class="grip"></div>' + html + '</div></div>';
    document.body.style.overflow = 'hidden';
    $('scrim').addEventListener('click', function (e) { if (e.target.id === 'scrim') closeLayer(); });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('layer').firstChild) closeLayer(); });

  function openEditor(kind, id) {
    var item = kind === 'note' ? findNote(id) : findTask(id); if (!item) return;
    openLayer(
      '<h2>' + (kind === 'note' ? 'Editar anotação' : 'Editar tarefa') + '</h2>' +
      '<textarea class="edit" id="edText" aria-label="Texto">' + esc(item.text) + '</textarea>' +
      '<div class="composer-row" style="margin-top:12px">' +
        '<span class="chip" id="edDateChip" aria-pressed="' + !!item.date + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>' +
          '<span id="edDateLabel"></span><input type="date" id="edDate" value="' + esc(item.date) + '" aria-label="Data">' +
          '<button type="button" class="clear" id="edDateClear" aria-label="Tirar data">×</button>' +
        '</span>' +
      '</div>' +
      '<div class="panel-actions">' +
        '<button type="button" class="btn-ghost btn-danger" id="edDelete">Excluir</button>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn-ghost" id="edCancel">Cancelar</button>' +
        '<button type="button" class="btn-primary" id="edSave">Salvar</button>' +
      '</div>'
    );
    var ta = $('edText'), dt = $('edDate');
    function refresh() {
      $('edDateLabel').textContent = dt.value ? dayHeading(dt.value) : 'Sem data';
      $('edDateChip').setAttribute('aria-pressed', !!dt.value);
      $('edDateClear').hidden = !dt.value;
      $('edSave').disabled = !ta.value.trim();
    }
    refresh();
    dt.addEventListener('change', refresh);
    ta.addEventListener('input', refresh);
    $('edDateClear').addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); dt.value = ''; refresh(); });
    $('edCancel').addEventListener('click', closeLayer);
    $('edSave').addEventListener('click', function () {
      var text = ta.value.trim(); if (!text) return;
      item.text = text; item.date = validDate(dt.value); item.updated = Date.now();
      save(); closeLayer(); renderAll();
    });
    $('edDelete').addEventListener('click', function () {
      item.del = 1; item.updated = Date.now();
      save(); closeLayer(); renderAll();
      toast(kind === 'note' ? 'Anotação excluída' : 'Tarefa excluída', 'Desfazer', function () {
        item.del = 0; item.updated = Date.now(); save(); renderAll();
      });
    });
  }

  /* ================= mesclagem (para sincronizar e restaurar) ================= */
  function mergeLists(a, b) {
    var map = {};
    a.forEach(function (x) { map[x.id] = x; });
    b.forEach(function (y) { var x = map[y.id]; if (!x || y.updated > x.updated) map[y.id] = y; });
    var cutoff = Date.now() - TOMBSTONE_DAYS * 864e5;
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (x) { return !(x.del && x.updated < cutoff); });
  }
  function mergeData(local, remote) {
    return { notes: mergeLists(local.notes, remote.notes), tasks: mergeLists(local.tasks, remote.tasks) };
  }
  function canonical(d) {
    var s = function (arr) { return arr.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }); };
    return JSON.stringify({ notes: s(d.notes), tasks: s(d.tasks) });
  }

  /* ================= sincronização com o GitHub ================= */
  var syncTimer = null, syncing = false, syncAgain = false, syncState = 'off', syncMsg = '';
  function scheduleSync(ms) {
    if (!sync) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(runSync, ms || 0);
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + sync.token, 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, { method: opts.method || 'GET', headers: headers, body: opts.body, cache: 'no-store' });
  }
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function fileUrl() { return '/repos/' + encodeURIComponent(sync.owner) + '/' + encodeURIComponent(sync.repo) + '/contents/' + SYNC_FILE; }

  function httpError(res) {
    var e = new Error('http ' + res.status); e.status = res.status; return e;
  }
  function explain(e) {
    if (!navigator.onLine || e instanceof TypeError) return { state: 'offline', msg: 'Sem internet. Tudo continua salvo no aparelho e sincroniza quando a conexão voltar.' };
    if (e.status === 401) return { state: 'error', msg: 'O GitHub recusou a chave de acesso. Ela pode ter expirado: gere uma nova e conecte de novo.' };
    if (e.status === 403) return { state: 'error', msg: 'A chave de acesso não tem permissão para escrever no repositório (precisa de "Contents: Read and write").' };
    if (e.status === 404) return { state: 'error', msg: 'Repositório não encontrado. Confira o usuário e o nome do repositório, e se a chave tem acesso a ele.' };
    if (e.public) return { state: 'error', msg: 'Esse repositório é público. Torne-o privado no GitHub antes de sincronizar.' };
    return { state: 'error', msg: 'A sincronização falhou (' + (e.status || e.message) + '). Seus dados continuam salvos no aparelho.' };
  }

  function getRemote() {
    return api(fileUrl()).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw httpError(res);
      return res.json().then(function (j) {
        var parsed = {};
        try { parsed = JSON.parse(b64decode(j.content || '')); } catch (e) { parsed = {}; }
        return { sha: j.sha, data: normalize(parsed) };
      });
    });
  }
  function putRemote(d, sha) {
    var payload = { app: 'meu-bloquinho', version: 1, savedAt: new Date().toISOString(), notes: d.notes, tasks: d.tasks };
    var body = { message: 'Bloquinho ' + new Date().toISOString().slice(0, 16).replace('T', ' '), content: b64encode(JSON.stringify(payload)) };
    if (sha) body.sha = sha;
    return api(fileUrl(), { method: 'PUT', body: JSON.stringify(body) }).then(function (res) {
      if (!res.ok) throw httpError(res);
      return res.json().then(function (j) { return j.content && j.content.sha; });
    });
  }

  function runSync(attempt) {
    if (!sync) return Promise.resolve();
    if (syncing) { syncAgain = true; return Promise.resolve(); }
    if (!navigator.onLine) { setSyncState('offline', 'Sem internet. Tudo continua salvo no aparelho e sincroniza quando a conexão voltar.'); return Promise.resolve(); }
    syncing = true; setSyncState('busy', '');
    return getRemote().then(function (remote) {
      var before = canonical(data);
      if (remote) data = mergeData(data, remote.data);
      if (canonical(data) !== before) { writeJSON(DATA_KEY, data); renderAll(); }
      var mine = canonical(data);
      if (remote && canonical(remote.data) === mine) return remote.sha;
      return putRemote(data, remote && remote.sha);
    }).then(function (sha) {
      sync.sha = sha; sync.lastSync = Date.now(); sync.lastError = '';
      writeJSON(SYNC_KEY, sync);
      setSyncState('ok', '');
    }).catch(function (e) {
      if ((e.status === 409 || e.status === 422) && !attempt) { syncing = false; return runSync(1); }
      var x = explain(e); sync.lastError = x.msg; writeJSON(SYNC_KEY, sync); setSyncState(x.state, x.msg);
    }).then(function () {
      syncing = false;
      if (syncAgain) { syncAgain = false; scheduleSync(300); }
    });
  }

  function setSyncState(state, msg) { syncState = state; syncMsg = msg; updateStatus(); if (backupOpen) renderBackup(); }

  function updateStatus() {
    var el = $('status'); var txt = 'Salvo no aparelho'; var warn = false;
    if (!storageOK) { txt = 'Atenção: não foi possível salvar no aparelho'; warn = true; }
    else if (sync) {
      if (syncState === 'busy') txt = 'Salvo · sincronizando…';
      else if (syncState === 'ok' && sync.lastSync) txt = 'Salvo · na nuvem às ' + clock(sync.lastSync);
      else if (syncState === 'offline') txt = 'Salvo no aparelho · sem internet';
      else if (syncState === 'error') { txt = 'Salvo no aparelho · nuvem com problema'; warn = true; }
      else if (sync.lastSync) txt = 'Salvo · na nuvem às ' + clock(sync.lastSync);
    }
    el.textContent = txt; el.classList.toggle('warn', warn);
  }

  /* ================= backup / restaurar ================= */
  var backupOpen = false;
  function exportPayload() {
    return {
      app: 'meu-bloquinho', version: 1, exportedAt: new Date().toISOString(),
      notes: data.notes.filter(function (n) { return !n.del; }),
      tasks: data.tasks.filter(function (t) { return !t.del; })
    };
  }
  function doExport() {
    var name = 'meu-bloquinho-' + todayISO() + '.json';
    var json = JSON.stringify(exportPayload(), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var done = function () { ui.lastExport = Date.now(); writeJSON(UI_KEY, ui); if (backupOpen) renderBackup(); };
    var download = function () {
      try {
        var url = URL.createObjectURL(blob); var a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        done(); toast('Cópia salva em Downloads: ' + name);
      } catch (e) { toast('Não consegui gerar o arquivo neste navegador.'); }
    };
    var file;
    try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (isApple && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Backup do Meu Bloquinho' }).then(function () { done(); toast('Cópia de segurança enviada'); })
        .catch(function (e) { if (e && e.name !== 'AbortError') download(); });
    } else download();
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { toast('Esse arquivo não é um backup do Bloquinho.'); return; }
      if (!parsed || (!Array.isArray(parsed.notes) && !Array.isArray(parsed.tasks))) { toast('Esse arquivo não é um backup do Bloquinho.'); return; }
      var incoming = normalize(parsed); var now = Date.now(); var restored = { notes: 0, tasks: 0 };
      ['notes', 'tasks'].forEach(function (kind) {
        incoming[kind].forEach(function (it) {
          if (it.del) return;
          var cur = data[kind].find(function (x) { return x.id === it.id; });
          if (!cur) { it.updated = now; data[kind].push(it); restored[kind]++; }
          else if (cur.del) { Object.assign(cur, it, { del: 0, updated: now }); restored[kind]++; }
          else if (it.updated > cur.updated) { Object.assign(cur, it); }
        });
      });
      save(); renderAll();
      toast('Restaurado: ' + restored.notes + ' anotações e ' + restored.tasks + ' tarefas');
      if (backupOpen) renderBackup();
    };
    reader.onerror = function () { toast('Não consegui ler o arquivo.'); };
    reader.readAsText(file);
  }
  $('importFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (f) doImport(f); e.target.value = '';
  });

  function counts() {
    return { n: data.notes.filter(function (x) { return !x.del; }).length, t: data.tasks.filter(function (x) { return !x.del; }).length };
  }

  function renderBackup() {
    var c = counts();
    var cloud;
    if (sync) {
      var dotCls = syncState === 'ok' ? 'ok' : syncState === 'error' ? 'warn' : '';
      var line = syncState === 'busy' ? 'Sincronizando…'
        : syncState === 'error' ? 'Não sincronizou'
        : syncState === 'offline' ? 'Aguardando internet'
        : sync.lastSync ? 'Na nuvem · última vez ' + stampDate(sync.lastSync) + ' às ' + clock(sync.lastSync) : 'Conectado';
      cloud =
        '<div class="box"><div class="sync-state"><span class="dot ' + dotCls + '"></span>' + esc(line) + '</div>' +
        '<p>Repositório privado <strong>' + esc(sync.owner + '/' + sync.repo) + '</strong> no GitHub. Cada alteração vai para lá em poucos segundos.</p>' +
        (syncMsg ? '<div class="msg err">' + esc(syncMsg) + '</div>' : '') +
        '<div class="panel-actions"><button type="button" class="btn-primary" id="bkSyncNow">Sincronizar agora</button>' +
        '<span class="spacer"></span><button type="button" class="btn-ghost" id="bkDisconnect">Desconectar</button></div>' +
        '<div id="bkConfirm"></div></div>';
    } else {
      cloud =
        '<div class="box"><div class="sync-state"><span class="dot"></span>Nuvem desligada</div>' +
        '<p>Para guardar uma cópia automática na nuvem e recuperar tudo em outro celular, conecte um repositório <strong>privado</strong> do GitHub (gratuito). O passo a passo está no guia de instalação.</p>' +
        '<div class="field"><label for="bkOwner">Seu usuário do GitHub</label><input id="bkOwner" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ex.: maria-silva"></div>' +
        '<div class="field"><label for="bkRepo">Repositório privado</label><input id="bkRepo" autocapitalize="off" autocorrect="off" spellcheck="false" value="bloquinho-dados"></div>' +
        '<div class="field"><label for="bkToken">Chave de acesso (token)</label><input id="bkToken" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="github_pat_…"></div>' +
        '<div class="panel-actions"><button type="button" class="btn-primary" id="bkConnect">Conectar</button></div>' +
        '<div id="bkConnectMsg" class="msg"></div></div>';
    }
    if (window.BLOQUINHO_PREVIEW) cloud = '<div class="box"><p>A nuvem só funciona no app instalado pelo seu endereço próprio, não nesta prévia.</p></div>';
    var lastExp = ui.lastExport ? 'Última cópia: ' + stampDate(ui.lastExport) + '.' : 'Você ainda não salvou nenhuma cópia.';
    var html =
      '<h2>Backup e sincronização</h2>' +
      '<div class="box"><div class="sync-state"><span class="dot ' + (storageOK ? 'ok' : 'warn') + '"></span>' + (storageOK ? 'Tudo salvo neste aparelho' : 'Não foi possível salvar neste aparelho') + '</div>' +
      '<p>' + c.n + ' anotações e ' + c.t + ' tarefas. Cada alteração é salva na hora, mesmo sem internet.</p></div>' +
      '<h3>Nuvem</h3>' + cloud +
      '<h3>Cópia de segurança em arquivo</h3>' +
      '<div class="box"><p>Gera um arquivo com tudo. Guarde no Google Drive, no iCloud, no e-mail ou no WhatsApp. ' + lastExp + '</p>' +
      '<div class="panel-actions"><button type="button" class="btn-primary" id="bkExport">Salvar cópia</button>' +
      '<button type="button" class="btn-ghost" id="bkImport">Restaurar de um arquivo</button></div>' +
      '<p style="font-size:13px">Restaurar não apaga nada: traz de volta o que está no arquivo e mantém o que já existe aqui.</p></div>' +
      '<h3>Instalação no celular</h3>' +
      '<div class="box">' + installSummary() +
      '<div class="panel-actions">' + (deferredInstall ? '<button type="button" class="btn-primary" id="bkInstall">Instalar app</button>' : '') +
      '<button type="button" class="btn-ghost" id="bkCheck">Verificar instalação</button></div>' +
      '<ul class="checks" id="bkChecks"></ul></div>' +
      '<div class="panel-actions"><span class="spacer"></span><button type="button" class="btn-ghost" id="bkClose">Fechar</button></div>';
    var panel = document.querySelector('.panel');
    if (!panel) { openLayer(html); } else { panel.innerHTML = '<div class="grip"></div>' + html; }
    bindBackup();
  }

  function bindBackup() {
    $('bkClose').addEventListener('click', function () { backupOpen = false; closeLayer(); });
    $('bkCheck').addEventListener('click', runInstallChecks);
    if ($('bkInstall')) $('bkInstall').addEventListener('click', promptInstall);
    $('bkExport').addEventListener('click', doExport);
    $('bkImport').addEventListener('click', function () { $('importFile').click(); });
    if (sync) {
      $('bkSyncNow').addEventListener('click', function () { runSync(); });
      $('bkDisconnect').addEventListener('click', function () {
        $('bkConfirm').innerHTML = '<p>Desconectar este aparelho da nuvem? Nada é apagado, nem aqui nem no GitHub.</p>' +
          '<div class="panel-actions"><button type="button" class="btn-ghost btn-danger" id="bkDiscYes">Desconectar</button><button type="button" class="btn-ghost" id="bkDiscNo">Manter</button></div>';
        $('bkDiscYes').addEventListener('click', function () { sync = null; try { localStorage.removeItem(SYNC_KEY); } catch (e) {} syncState = 'off'; syncMsg = ''; updateStatus(); renderBackup(); });
        $('bkDiscNo').addEventListener('click', function () { $('bkConfirm').innerHTML = ''; });
      });
    } else {
      $('bkConnect').addEventListener('click', connect);
    }
  }

  function connect() {
    var owner = $('bkOwner').value.trim().replace(/^@/, ''), repo = $('bkRepo').value.trim(), token = $('bkToken').value.trim();
    var msg = $('bkConnectMsg');
    if (!owner || !repo || !token) { msg.className = 'msg err'; msg.textContent = 'Preencha os três campos.'; return; }
    if (!navigator.onLine) { msg.className = 'msg err'; msg.textContent = 'Conecte-se à internet para ligar a nuvem.'; return; }
    msg.className = 'msg'; msg.textContent = 'Verificando…';
    $('bkConnect').disabled = true;
    var candidate = { owner: owner, repo: repo, token: token, sha: '', lastSync: 0, lastError: '' };
    var prev = sync; sync = candidate;
    api('/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)).then(function (res) {
      if (!res.ok) throw httpError(res);
      return res.json();
    }).then(function (r) {
      if (!r.private) { var e = new Error('public'); e.public = true; throw e; }
      writeJSON(SYNC_KEY, sync);
      return runSync();
    }).then(function () {
      if (syncState === 'ok') toast('Nuvem conectada. Tudo sincronizado.');
      renderBackup();
    }).catch(function (e) {
      sync = prev;
      var x = explain(e); msg.className = 'msg err'; msg.textContent = x.msg;
      if ($('bkConnect')) $('bkConnect').disabled = false;
    });
  }

  $('openBackup').addEventListener('click', function () { closeLayer(); backupOpen = true; renderBackup(); });

  // no computador, um clique no campo de data também abre o calendário
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('input[type="date"]') && t.showPicker) { try { t.showPicker(); } catch (err) {} }
  });

  /* ================= início ================= */
  function renderAll() { renderNotes(); renderTasks(); }
  function renderHeader() {
    var d = new Date();
    $('today').textContent = WD[d.getDay()] + ', ' + d.getDate() + ' de ' + MO_FULL[d.getMonth()];
  }

  noteText.value = draft.note || ''; taskText.value = draft.task || '';
  renderHeader(); refreshNoteComposer(); refreshTaskComposer(); autoGrow(noteText);
  setView(ui.view); renderAll(); updateStatus();

  // pede ao navegador para não apagar os dados quando faltar espaço
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }

  window.addEventListener('online', function () { scheduleSync(500); });
  window.addEventListener('offline', function () { if (sync) setSyncState('offline', 'Sem internet. Tudo continua salvo no aparelho e sincroniza quando a conexão voltar.'); });
  var lastDay = todayISO();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (todayISO() !== lastDay) { lastDay = todayISO(); renderHeader(); renderAll(); }
    if (sync && (!sync.lastSync || Date.now() - sync.lastSync > 20000)) scheduleSync(200);
  });
  // outro aba/janela alterou os dados
  window.addEventListener('storage', function (e) { if (e.key === DATA_KEY) { data = normalize(readJSON(DATA_KEY, emptyData())); renderAll(); } });
  if (sync) scheduleSync(400);

  // funciona sem internet depois da primeira abertura
  var swError = '';
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function (e) { swError = (e && e.message) || 'erro'; });
  }

  /* ================= instalação (Android/Chrome) ================= */
  var deferredInstall = null;
  function isInstalled() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function installSummary() {
    if (isInstalled()) return '<div class="sync-state"><span class="dot ok"></span>Aberto como app instalado</div>';
    if (deferredInstall) return '<div class="sync-state"><span class="dot ok"></span>Pronto para instalar</div><p>Toque em Instalar app. O Bloquinho vai para a gaveta de apps como qualquer outro aplicativo.</p>';
    return '<div class="sync-state"><span class="dot"></span>Aberto pelo navegador</div><p>No Chrome do Android, use o menu ⋮ → Instalar app. Se não der certo, toque em Verificar instalação para ver o que falta.</p>';
  }
  function promptInstall() {
    if (!deferredInstall) return;
    var ev = deferredInstall; deferredInstall = null;
    ev.prompt();
    (ev.userChoice || Promise.resolve({})).then(function (c) {
      if (c && c.outcome === 'accepted') toast('Instalando o Bloquinho…');
      renderInstallBanner(); if (backupOpen) renderBackup();
    });
  }
  function renderInstallBanner() {
    var el = $('installBanner'); if (!el) return;
    el.hidden = !(deferredInstall && !isInstalled());
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferredInstall = e; renderInstallBanner(); if (backupOpen) renderBackup();
  });
  window.addEventListener('appinstalled', function () {
    deferredInstall = null; renderInstallBanner(); toast('Bloquinho instalado. Procure o ícone na tela inicial.');
  });
  if ($('installBtn')) $('installBtn').addEventListener('click', promptInstall);
  if ($('installLater')) $('installLater').addEventListener('click', function () { $('installBanner').hidden = true; });

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function () { resolve({ ok: false }); };
      img.src = src + (src.indexOf('?') < 0 ? '?v=' : '&v=') + Date.now();
    });
  }
  function runInstallChecks() {
    var out = $('bkChecks'); if (!out) return;
    out.innerHTML = '<li>Verificando…</li>';
    var rows = [];
    var add = function (ok, label, detail) { rows.push({ ok: ok, label: label, detail: detail || '' }); };
    add(window.isSecureContext, 'Endereço seguro (HTTPS)', window.isSecureContext ? '' : 'Abra pelo endereço https://…github.io/bloquinho/');
    var link = document.querySelector('link[rel="manifest"]');
    var manifestUrl = link ? new URL(link.getAttribute('href'), location.href).href : '';
    fetch(manifestUrl, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('O arquivo manifest.json não foi encontrado no site (erro ' + r.status + '). Envie-o para o repositório.');
      return r.json().catch(function () { throw new Error('O manifest.json está corrompido. Envie de novo o arquivo do pacote.'); });
    }).then(function (m) {
      var miss = ['name', 'short_name', 'start_url', 'display', 'icons'].filter(function (k) { return !m[k]; });
      add(!miss.length && m.display === 'standalone', 'Manifesto do app', miss.length ? 'Faltam: ' + miss.join(', ') : '');
      var icons = (m.icons || []).map(function (i) { return { url: new URL(i.src, manifestUrl).href, sizes: i.sizes, name: i.src }; });
      return Promise.all(icons.map(function (ic) { return loadImage(ic.url).then(function (r) { return { ic: ic, r: r }; }); }));
    }).then(function (res) {
      var need = { '192x192': false, '512x512': false };
      res.forEach(function (x) {
        var real = x.r.ok ? x.r.w + 'x' + x.r.h : '';
        var good = x.r.ok && real === x.ic.sizes;
        if (good && need.hasOwnProperty(real)) need[real] = true;
        add(good, 'Ícone ' + x.ic.sizes, x.r.ok ? (good ? '' : 'O arquivo tem ' + real) : 'O arquivo ' + x.ic.name + ' não está no site. Envie-o para o repositório.');
      });
      if (!need['192x192'] || !need['512x512']) add(false, 'Ícones 192 e 512', 'O Chrome exige os dois para instalar.');
    }).catch(function (e) {
      add(false, 'Manifesto do app', e.message);
    }).then(function () {
      if (!('serviceWorker' in navigator)) { add(false, 'Funcionamento offline', 'Este navegador não suporta. Use o Chrome.'); return; }
      return navigator.serviceWorker.getRegistration().then(function (reg) {
        var active = !!(reg && reg.active);
        add(active, 'Funcionamento offline (service worker)', active ? (navigator.serviceWorker.controller ? '' : 'Ativo. Feche e abra a página uma vez.') : 'Não iniciou' + (swError ? ': ' + swError : '. Confira se o arquivo sw.js está no repositório.'));
      });
    }).then(function () {
      add(isInstalled() || !!deferredInstall, 'Pronto para instalar', isInstalled() ? 'Já está aberto como app.' : deferredInstall ? 'Toque em Instalar app.' : 'Se tudo acima está certo, o Chrome libera a instalação em alguns segundos. Recarregue a página e tente o menu ⋮ → Instalar app.');
      out.innerHTML = rows.map(function (r) {
        return '<li class="' + (r.ok ? 'ok' : 'bad') + '"><span class="dot ' + (r.ok ? 'ok' : 'warn') + '"></span><span><strong>' + esc(r.label) + '</strong>' + (r.detail ? '<br>' + esc(r.detail) : '') + '</span></li>';
      }).join('');
    });
  }

  // ganchos para testes
  window.__bloquinho = { mergeData: mergeData, normalize: normalize };
})();
