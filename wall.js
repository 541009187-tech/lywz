(function () {
  'use strict';

  var NOTE_CLASS = {
    yellow: 'note--yellow', pink: 'note--pink', blue: 'note--blue',
    green: 'note--green', lilac: 'note--lilac'
  };
  var state = { order: 'new', q: '', offset: 0, limit: 9, total: 0, items: [], clock: 0, loading: false, admin: '' };
  var freshIds = new Set();

  var notesEl = document.getElementById('notes');
  var totalEl = document.getElementById('total');
  var emptyEl = document.getElementById('empty');
  var emptyTitle = emptyEl.querySelector('.empty-title');
  var emptyText = emptyEl.querySelectorAll('p')[1];
  var moreBtn = document.getElementById('moreBtn');
  var form = document.getElementById('composer');
  var nameInput = document.getElementById('name');
  var contentInput = document.getElementById('content');
  var counterEl = document.getElementById('counter');
  var submitBtn = document.getElementById('submitBtn');
  var searchInput = document.getElementById('search');
  var toastEl = document.getElementById('toast');
  var wallBar = document.querySelector('.wall-bar');
  var adminBtn = document.getElementById('adminBtn');

  var CLIENT_ID = getClientId();
  state.admin = readAdminToken();

  if (location.protocol === 'file:') {
    document.getElementById('fileWarn').hidden = false;
  }

  /* ---------------- 本地存的访客标识、撤下凭证、管理员凭证 ---------------- */
  function getClientId() {
    var id = '';
    try { id = localStorage.getItem('wall_client_id') || ''; } catch (e) {}
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('wall_client_id', id); } catch (e) {}
    }
    return id;
  }

  function readTokens() {
    try { return JSON.parse(localStorage.getItem('wall_tokens') || '{}') || {}; }
    catch (e) { return {}; }
  }

  function writeTokens(t) {
    try { localStorage.setItem('wall_tokens', JSON.stringify(t)); } catch (e) {}
  }

  function readAdminToken() {
    try { return localStorage.getItem('wall_admin_token') || ''; } catch (e) { return ''; }
  }

  function saveAdminToken(token) {
    state.admin = token || '';
    try {
      if (token) localStorage.setItem('wall_admin_token', token);
      else localStorage.removeItem('wall_admin_token');
    } catch (e) {}
  }

  /* ---------------- 小工具 ---------------- */
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  function api(path, options) {
    return fetch(path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || ('请求没成功（' + res.status + '）'));
        }
        return data;
      });
    });
  }

  function timeText(ms) {
    var now = Date.now() + state.clock;
    var diff = Math.max(0, now - ms);
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < 864e5) return Math.floor(diff / 3600e3) + ' 小时前';
    if (diff < 7 * 864e5) return Math.floor(diff / 864e5) + ' 天前';
    var d = new Date(ms), t = new Date(now);
    var md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() === t.getFullYear() ? md : d.getFullYear() + '年' + md;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    totalEl.textContent = state.total;
    notesEl.textContent = '';
    state.items.forEach(function (m) { notesEl.appendChild(noteEl(m)); });

    var nothing = state.items.length === 0;
    emptyEl.hidden = !nothing;
    if (nothing) {
      if (state.q) {
        emptyTitle.textContent = '没找到这样的话';
        emptyText.textContent = '换个词试试，或者干脆自己写一条。';
      } else {
        emptyTitle.textContent = '墙上还空着';
        emptyText.textContent = '写下第一条留言，让这里有点人气。';
      }
    }
    moreBtn.hidden = state.q !== '' || state.items.length >= state.total;
  }

  function noteEl(m) {
    var rot = (((m.id * 7) % 9) - 4) * 0.45;

    var el = document.createElement('article');
    el.className = 'note ' + (NOTE_CLASS[m.color] || NOTE_CLASS.yellow);
    el.style.setProperty('--rot', rot.toFixed(2) + 'deg');
    el.dataset.id = String(m.id);
    if (state.admin) el.classList.add('is-admin');

    var pin = document.createElement('span');
    pin.className = 'pin';
    pin.setAttribute('aria-hidden', 'true');

    var head = document.createElement('div');
    head.className = 'note-head';
    var who = document.createElement('span');
    who.className = 'who';
    who.textContent = m.name;
    var when = document.createElement('span');
    when.className = 'when';
    when.textContent = timeText(m.created_ms);
    head.appendChild(who);
    head.appendChild(when);

    var said = document.createElement('p');
    said.className = 'said';
    said.textContent = m.content;

    var foot = document.createElement('div');
    foot.className = 'note-foot';

    var like = document.createElement('button');
    like.type = 'button';
    like.className = 'like';
    like.setAttribute('aria-pressed', m.liked ? 'true' : 'false');
    like.setAttribute('aria-label', '给这条留言点赞');
    like.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S5 15.6 5 10.8A4 4 0 0 1 12 7a4 4 0 0 1 7 3.8C19 15.6 12 20 12 20Z"/></svg>';
    var cnt = document.createElement('span');
    cnt.textContent = String(m.likes);
    like.appendChild(cnt);
    like.addEventListener('click', function () { likeMessage(m.id, like, cnt); });
    foot.appendChild(like);

    var tokens = readTokens();
    if (tokens[m.id] || state.admin) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'take-down';
      del.textContent = (state.admin && !tokens[m.id]) ? '管理员撤下' : '撤下';
      del.addEventListener('click', function () { removeMessage(m.id); });
      foot.appendChild(del);
    }

    el.appendChild(pin);
    el.appendChild(head);
    el.appendChild(said);
    el.appendChild(foot);

    if (freshIds.has(m.id)) {
      el.classList.add('fresh');
      freshIds.delete(m.id);
    }
    return el;
  }

  /* ---------------- 读留言 ---------------- */
  function load(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.items = []; state.offset = 0; }

    var params = new URLSearchParams({
      limit: String(state.limit),
      offset: String(state.offset),
      order: state.order,
      client_id: CLIENT_ID
    });
    if (state.q) params.set('q', state.q);

    api('/api/messages?' + params.toString()).then(function (data) {
      state.clock = data.now - Date.now();
      state.total = data.total;
      state.items = reset ? data.messages : state.items.concat(data.messages);
      state.offset = state.items.length;
      render();
    }).catch(function (err) {
      toast(err.message || '连不上服务器，稍后再试');
      if (reset) render();
    }).then(function () {
      state.loading = false;
    });
  }

  /* ---------------- 贴留言 ---------------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var content = contentInput.value.trim();
    if (!content) {
      toast('先写点什么吧');
      contentInput.focus();
      return;
    }
    var colorInput = form.querySelector('input[name="color"]:checked');
    var color = colorInput ? colorInput.value : 'yellow';

    submitBtn.disabled = true;
    api('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        content: content,
        color: color,
        client_id: CLIENT_ID
      })
    }).then(function (data) {
      var tokens = readTokens();
      tokens[data.message.id] = data.token;
      writeTokens(tokens);

      contentInput.value = '';
      counterEl.textContent = '0';
      state.total = data.total;

      if (state.order === 'new' && !state.q) {
        freshIds.add(data.message.id);
        state.items.unshift(data.message);
        state.offset += 1;
        render();
      } else {
        state.order = 'new';
        document.querySelectorAll('.tab').forEach(function (t) {
          t.setAttribute('aria-selected', t.dataset.order === 'new' ? 'true' : 'false');
        });
        state.q = '';
        searchInput.value = '';
        load(true);
      }
      toast('已经贴上墙了');
      notesEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(function (err) {
      toast(err.message || '没贴上，后台可能没开');
    }).then(function () {
      submitBtn.disabled = false;
      contentInput.focus();
    });
  });

  contentInput.addEventListener('input', function () {
    counterEl.textContent = String(contentInput.value.length);
  });

  contentInput.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (form.requestSubmit) form.requestSubmit(); else form.submit();
    }
  });

  /* ---------------- 点赞 ---------------- */
  function likeMessage(id, btn, cnt) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    api('/api/messages/' + id + '/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID })
    }).then(function (data) {
      cnt.textContent = String(data.likes);
      btn.setAttribute('aria-pressed', 'true');
      var item = state.items.filter(function (x) { return x.id === id; })[0];
      if (item) { item.likes = data.likes; item.liked = true; }
      if (data.already) toast('这条你已经点过赞了');
    }).catch(function (err) {
      toast(err.message);
    }).then(function () {
      delete btn.dataset.busy;
    });
  }

  /* ---------------- 撤下 ---------------- */
  function removeMessage(id) {
    var tokens = readTokens();
    if (!tokens[id] && !state.admin) return;
    if (!window.confirm('确定把这条留言从墙上撤下吗？撤下就找不回来了。')) return;

    var headers = {};
    if (tokens[id]) headers['X-Delete-Token'] = tokens[id];
    if (state.admin) headers['X-Admin-Token'] = state.admin;

    api('/api/messages/' + id, { method: 'DELETE', headers: headers })
      .then(function (data) {
        if (tokens[id]) { delete tokens[id]; writeTokens(tokens); }
        state.items = state.items.filter(function (m) { return m.id !== id; });
        state.total = (data.total !== undefined) ? data.total : Math.max(0, state.total - 1);
        render();
        toast('已经从墙上撤下');
      }).catch(function (err) {
        toast(err.message);
      });
  }

  /* ---------------- 管理员 ---------------- */
  function updateAdminUI() {
    var old = document.querySelector('.admin-bar');
    if (old) old.remove();

    if (!state.admin) {
      if (adminBtn) adminBtn.textContent = '管理员';
      return;
    }
    if (adminBtn) adminBtn.textContent = '管理员模式';

    var bar = document.createElement('div');
    bar.className = 'admin-bar';
    var tag = document.createElement('span');
    tag.textContent = '管理员模式：可以撤下任何一条留言';
    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'admin-out';
    out.textContent = '退出管理';
    out.addEventListener('click', function () { exitAdmin(false); });
    bar.appendChild(tag);
    bar.appendChild(out);
    wallBar.parentNode.insertBefore(bar, wallBar.nextSibling);
  }

  function exitAdmin(silent) {
    var token = state.admin;
    saveAdminToken('');
    updateAdminUI();
    render();
    if (!token) return;
    api('/api/admin/logout', { method: 'POST', headers: { 'X-Admin-Token': token } })
      .catch(function () {});
    if (!silent) toast('已退出管理员模式');
  }

  var modal = null;

  function buildModal() {
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.id = 'adminModal';
    wrap.hidden = true;
    wrap.innerHTML = [
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="adminTitle">',
      '  <h3 id="adminTitle">管理员登录</h3>',
      '  <label class="mfield"><span>名字</span><input id="adminName" type="text" maxlength="12" autocomplete="username" placeholder="管理员"></label>',
      '  <label class="mfield"><span>密码</span><input id="adminPass" type="password" maxlength="32" autocomplete="current-password" placeholder="默认 123456"></label>',
      '  <p class="modal-hint">名字要填「管理员」，只有管理员能撤下别人的留言。</p>',
      '  <div class="modal-actions">',
      '    <button type="button" class="ghost" id="adminCancel">取消</button>',
      '    <button type="button" class="solid" id="adminOk">进入</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeModal(); });
    wrap.querySelector('#adminCancel').addEventListener('click', closeModal);
    wrap.querySelector('#adminOk').addEventListener('click', submitAdmin);
    wrap.querySelector('#adminName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitAdmin(); }
    });
    wrap.querySelector('#adminPass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitAdmin(); }
    });
    return wrap;
  }

  function openModal() {
    if (!modal) modal = buildModal();
    modal.hidden = false;
    var nameEl = modal.querySelector('#adminName');
    var passEl = modal.querySelector('#adminPass');
    if (!nameEl.value) nameEl.value = '管理员';
    passEl.value = '';
    setTimeout(function () { passEl.focus(); }, 30);
  }

  function closeModal() {
    if (modal) modal.hidden = true;
  }

  function submitAdmin() {
    var nameEl = modal.querySelector('#adminName');
    var passEl = modal.querySelector('#adminPass');
    var okBtn = modal.querySelector('#adminOk');
    var name = nameEl.value.trim();
    var password = passEl.value;

    if (!name) { toast('名字要填「管理员」'); nameEl.focus(); return; }
    if (!password) { toast('请输入密码'); passEl.focus(); return; }

    okBtn.disabled = true;
    api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, password: password })
    }).then(function (data) {
      saveAdminToken(data.token);
      closeModal();
      updateAdminUI();
      render();
      toast('管理员模式已开启');
    }).catch(function (err) {
      toast(err.message || '进不去');
    }).then(function () {
      okBtn.disabled = false;
    });
  }

  if (adminBtn) {
    adminBtn.addEventListener('click', function () {
      if (state.admin) { exitAdmin(false); return; }
      openModal();
    });
  }

  /* 如果本地存着凭证，先静默确认它还有效 */
  if (state.admin) {
    api('/api/admin/check', { method: 'GET', headers: { 'X-Admin-Token': state.admin } })
      .then(function (data) {
        if (!data.admin) saveAdminToken('');
        updateAdminUI();
      }).catch(function () {
        saveAdminToken('');
        updateAdminUI();
      });
  }

  updateAdminUI();

  /* ---------------- 排序、搜索、翻页 ---------------- */
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (state.order === tab.dataset.order) return;
      document.querySelectorAll('.tab').forEach(function (t) {
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      state.order = tab.dataset.order;
      load(true);
    });
  });

  var searchTimer = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      var q = searchInput.value.trim();
      if (q === state.q) return;
      state.q = q;
      load(true);
    }, 350);
  });

  moreBtn.addEventListener('click', function () { load(false); });

  document.getElementById('emptyBtn').addEventListener('click', function () {
    contentInput.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* 相对时间每分钟刷新一次 */
  setInterval(function () {
    if (!state.loading && state.items.length) render();
  }, 60000);

  load(true);
})();
