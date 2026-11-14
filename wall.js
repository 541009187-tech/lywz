(function () {
  'use strict';

  var NOTE_CLASS = {
    yellow: 'note--yellow', pink: 'note--pink', blue: 'note--blue',
    green: 'note--green', lilac: 'note--lilac'
  };
  var state = { order: 'new', q: '', offset: 0, limit: 9, total: 0, items: [], clock: 0, loading: false, admin: '' };
  var freshIds = new Set();
  var bannedNames = [];

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

  function readUsedName() {
    try { return localStorage.getItem('wall_name') || ''; } catch (e) { return ''; }
  }

  function saveUsedName(n) {
    try {
      if (n) localStorage.setItem('wall_name', n);
      else localStorage.removeItem('wall_name');
    } catch (e) {}
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
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
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

  function nickName() {
    return (nameInput.value || '').trim() || '匿名访客';
  }

  /* 省份英文名转中文（Cloudflare 返回的 region 是英文） */
  var PROVINCE = {
    'beijing': '北京', 'shanghai': '上海', 'tianjin': '天津', 'chongqing': '重庆',
    'guangdong': '广东', 'guangxi': '广西', 'jiangsu': '江苏', 'zhejiang': '浙江',
    'fujian': '福建', 'hubei': '湖北', 'hunan': '湖南', 'henan': '河南', 'hebei': '河北',
    'shandong': '山东', 'shanxi': '山西', 'shaanxi': '陕西', 'anhui': '安徽', 'jiangxi': '江西',
    'sichuan': '四川', 'hainan': '海南', 'guizhou': '贵州', 'yunnan': '云南', 'gansu': '甘肃',
    'qinghai': '青海', 'liaoning': '辽宁', 'jilin': '吉林', 'heilongjiang': '黑龙江',
    'inner mongolia': '内蒙古', 'neimenggu': '内蒙古', 'xinjiang': '新疆', 'xizang': '西藏',
    'tibet': '西藏', 'ningxia': '宁夏', 'hong kong': '香港', 'macau': '澳门', 'macao': '澳门',
    'taiwan': '台湾'
  };

  function geoText(geo) {
    if (!geo) return '';
    var region = (geo.region || '').trim();
    var regionCn = PROVINCE[region.toLowerCase()] || region;
    var parts = [];
    if (regionCn) parts.push(regionCn);
    if (geo.city) parts.push(geo.city);
    if (!parts.length && geo.country) parts.push(geo.country);
    return parts.join(' · ');
  }

  /* 采集浏览器 / 系统 / 设备类型，随发帖一起上报，用于名字占用比对 */
  function readSys() {
    var ua = navigator.userAgent || '';
    var os = '未知系统', browser = '未知浏览器', device = '桌面';
    if (/Android/i.test(ua)) {
      os = 'Android';
      device = /Mobile/i.test(ua) ? '手机' : '平板';
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      os = 'iOS';
      device = /iPad/i.test(ua) ? '平板' : '手机';
    } else if (/Windows/i.test(ua)) {
      os = 'Windows';
    } else if (/Mac OS X/i.test(ua)) {
      os = 'macOS';
    } else if (/CrOS/i.test(ua)) {
      os = 'ChromeOS';
    } else if (/Linux/i.test(ua)) {
      os = 'Linux';
    }

    if (/MicroMessenger/i.test(ua)) browser = '微信内置浏览器';
    else if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua)) browser = 'Safari';

    return { os: os, browser: browser, device: device, ua: ua.slice(0, 200) };
  }

  function sysText(sys) {
    if (!sys) return '';
    var parts = [];
    if (sys.browser) parts.push(sys.browser);
    if (sys.os) parts.push(sys.os);
    if (sys.device) parts.push(sys.device);
    return parts.join(' · ');
  }

  /* ---------------- 禁用名字 ---------------- */
  function normName(v) {
    return String(v || '').replace(/[\u3000\s]+/g, ' ').trim().toLowerCase();
  }

  function isBannedName(name) {
    var t = normName(name);
    if (!t) return false;
    return bannedNames.some(function (b) { return normName(b) === t; });
  }

  function loadBannedNames() {
    return api('/api/banned').then(function (data) {
      bannedNames = Array.isArray(data.names) ? data.names : [];
      return bannedNames;
    }).catch(function () {
      bannedNames = [];
      return bannedNames;
    });
  }

  /* 通用提示弹层 */
  function showNotice(titleText, lines) {
    var wrap = document.getElementById('noticeModal');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.id = 'noticeModal';
      wrap.hidden = true;
      wrap.innerHTML = [
        '<div class="modal-card" role="dialog" aria-modal="true">',
        '  <h3 id="noticeTitle"></h3>',
        '  <p class="notice-text" id="noticeLine1"></p>',
        '  <p class="notice-text" id="noticeLine2"></p>',
        '  <div class="modal-actions"><button type="button" class="solid" id="noticeOk">我知道了</button></div>',
        '</div>'
      ].join('');
      document.body.appendChild(wrap);
      wrap.querySelector('#noticeOk').addEventListener('click', function () { wrap.hidden = true; });
    }
    wrap.querySelector('#noticeTitle').textContent = titleText;
    wrap.querySelector('#noticeLine1').textContent = lines[0] || '';
    wrap.querySelector('#noticeLine2').textContent = lines[1] || '';
    wrap.hidden = false;
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
    if (state.admin && m.geo) {
      var geo = document.createElement('span');
      geo.className = 'geo';
      geo.textContent = geoText(m.geo);
      head.appendChild(geo);
    }
    if (state.admin && m.sys) {
      var sysEl = document.createElement('span');
      sysEl.className = 'sys';
      sysEl.textContent = sysText(m.sys);
      head.appendChild(sysEl);
    }
    head.appendChild(when);

    var said = document.createElement('p');
    said.className = 'said';
    said.textContent = m.content;

    var replies = Array.isArray(m.replies) ? m.replies : [];
    var replyWrap = null;
    if (replies.length) {
      replyWrap = document.createElement('div');
      replyWrap.className = 'replies';
      replies.forEach(function (r) { replyWrap.appendChild(replyEl(m, r)); });
    }

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

    var replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'reply-btn';
    replyBtn.textContent = replies.length ? '回复 ' + replies.length : '回复';
    replyBtn.addEventListener('click', function () { toggleReplyForm(el, m, replyBtn); });
    foot.appendChild(replyBtn);

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
    if (replyWrap) el.appendChild(replyWrap);
    el.appendChild(foot);

    if (freshIds.has(m.id)) {
      el.classList.add('fresh');
      freshIds.delete(m.id);
    }
    return el;
  }

  function replyEl(m, r) {
    var wrap = document.createElement('div');
    wrap.className = 'reply';

    var head = document.createElement('p');
    head.className = 'reply-head';
    var who = document.createElement('span');
    who.className = 'reply-who';
    who.textContent = r.name;
    var when = document.createElement('span');
    when.className = 'reply-when';
    when.textContent = timeText(r.created_ms);
    head.appendChild(who);
    if (state.admin && r.geo) {
      var geo = document.createElement('span');
      geo.className = 'geo reply-geo';
      geo.textContent = geoText(r.geo);
      head.appendChild(geo);
    }
    if (state.admin && r.sys) {
      var sysEl = document.createElement('span');
      sysEl.className = 'sys reply-sys';
      sysEl.textContent = sysText(r.sys);
      head.appendChild(sysEl);
    }
    head.appendChild(when);

    var said = document.createElement('p');
    said.className = 'reply-said';
    said.textContent = r.content;

    wrap.appendChild(head);
    wrap.appendChild(said);

    var tokens = readTokens();
    if (tokens['r' + r.id] || state.admin) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'reply-del';
      del.textContent = '删';
      del.addEventListener('click', function () { removeReply(m.id, r.id); });
      wrap.appendChild(del);
    }

    return wrap;
  }

  /* ---------------- 回复输入框 ---------------- */
  function toggleReplyForm(noteElRef, m, btn) {
    var existing = noteElRef.querySelector('.reply-form');
    if (existing) { existing.remove(); return; }

    var box = document.createElement('div');
    box.className = 'reply-form';

    var input = document.createElement('textarea');
    input.className = 'reply-input';
    input.maxLength = 120;
    input.rows = 2;
    input.placeholder = '回复 ' + m.name + '：';

    var row = document.createElement('div');
    row.className = 'reply-actions';

    var hint = document.createElement('span');
    hint.className = 'reply-hint';
    hint.textContent = '可以用 ' + nickName() + ' 的身份回复';

    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'reply-send';
    send.textContent = '发出';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'reply-cancel';
    cancel.textContent = '算了';

    row.appendChild(hint);
    row.appendChild(cancel);
    row.appendChild(send);

    box.appendChild(input);
    box.appendChild(row);
    noteElRef.insertBefore(box, noteElRef.querySelector('.note-foot'));

    setTimeout(function () { input.focus(); }, 20);

    cancel.addEventListener('click', function () { box.remove(); });

    send.addEventListener('click', function () {
      var text = input.value.trim();
      var who = nickName();
      if (!text) { toast('还没写内容'); input.focus(); return; }
      if (isBannedName(who)) {
        toast('该名字已被禁用，请更换名字');
        nameInput.focus();
        return;
      }
      send.disabled = true;
      api('/api/messages/' + m.id + '/replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: who, content: text, client_id: CLIENT_ID, sys: readSys() })
      }).then(function (data) {
        m.replies = Array.isArray(m.replies) ? m.replies : [];
        m.replies.push(data.reply);
        m.reply_total = data.reply_total;
        saveUsedName(nameInput.value.trim());

        var tokens = readTokens();
        tokens['r' + data.reply.id] = data.token;
        writeTokens(tokens);

        render();
        toast('回复已经贴上了');
      }).catch(function (err) {
        toast(err.message || '回复没贴上');
        if (err.message && err.message.indexOf('已被占用') >= 0) nameInput.focus();
        send.disabled = false;
      });
    });

    input.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        send.click();
      }
    });
  }

  function removeReply(messageId, replyId) {
    var tokens = readTokens();
    if (!tokens['r' + replyId] && !state.admin) return;
    if (!window.confirm('删掉这条回复吗？')) return;

    var headers = {};
    if (tokens['r' + replyId]) headers['X-Delete-Token'] = tokens['r' + replyId];
    if (state.admin) headers['X-Admin-Token'] = state.admin;

    api('/api/messages/' + messageId + '/replies/' + replyId, { method: 'DELETE', headers: headers })
      .then(function (data) {
        delete tokens['r' + replyId];
        writeTokens(tokens);
        var item = state.items.filter(function (x) { return x.id === messageId; })[0];
        if (item) {
          item.replies = (item.replies || []).filter(function (r) { return r.id !== replyId; });
          item.reply_total = data.reply_total;
        }
        render();
        toast('回复已经删掉');
      }).catch(function (err) {
        toast(err.message);
      });
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

    var headers = state.admin ? { 'X-Admin-Token': state.admin } : {};
    api('/api/messages?' + params.toString(), { headers: headers }).then(function (data) {
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

    var usedName = nameInput.value.trim();
    if (isBannedName(usedName || '匿名访客')) {
      toast('该名字已被禁用，请更换名字');
      nameInput.focus();
      return;
    }

    var colorInput = form.querySelector('input[name="color"]:checked');
    var color = colorInput ? colorInput.value : 'yellow';

    submitBtn.disabled = true;
    api('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: usedName,
        content: content,
        color: color,
        client_id: CLIENT_ID,
        sys: readSys()
      })
    }).then(function (data) {
      var tokens = readTokens();
      tokens[data.message.id] = data.token;
      writeTokens(tokens);
      saveUsedName(usedName);

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
      if (err.message && err.message.indexOf('已被禁用') >= 0) {
        nameInput.focus();
        loadBannedNames();
      } else if (err.message && err.message.indexOf('已被占用') >= 0) {
        nameInput.focus();
      }
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

  /* ---------------- 撤下留言 ---------------- */
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
    tag.textContent = '管理员模式：可以查看留言来自哪里、撤下留言和回复，也可以禁用名字';

    var actions = document.createElement('div');
    actions.className = 'admin-actions';

    var banBtn = document.createElement('button');
    banBtn.type = 'button';
    banBtn.className = 'admin-out';
    banBtn.textContent = '禁用名字';
    banBtn.addEventListener('click', openBanModal);

    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'admin-out';
    out.textContent = '退出管理';
    out.addEventListener('click', function () { exitAdmin(false); });

    actions.appendChild(banBtn);
    actions.appendChild(out);

    bar.appendChild(tag);
    bar.appendChild(actions);
    wallBar.parentNode.insertBefore(bar, wallBar.nextSibling);
  }

  function exitAdmin(silent) {
    var token = state.admin;
    saveAdminToken('');
    updateAdminUI();
    render();
    if (banModal) banModal.hidden = true;
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
      '  <label class="mfield"><span>密码</span><input id="adminPass" type="password" maxlength="32" autocomplete="current-password" placeholder="输入密码"></label>',
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
      loadBannedNames();
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

  /* ---------------- 禁用名字管理 ---------------- */
  var banModal = null;

  function buildBanModal() {
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.id = 'banModal';
    wrap.hidden = true;
    wrap.innerHTML = [
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="banTitle">',
      '  <h3 id="banTitle">禁用名字</h3>',
      '  <p class="ban-hint">禁用之后这个名字就不能再用来发帖或回复（不分大小写），它以前发的留言和回复会一起清掉。</p>',
      '  <div class="ban-input-row">',
      '    <input id="banInput" type="text" maxlength="12" placeholder="要禁用的名字，例如 sb">',
      '    <button type="button" class="solid" id="banAdd">禁用</button>',
      '  </div>',
      '  <div class="ban-list" id="banList"></div>',
      '  <div class="modal-actions"><button type="button" class="ghost" id="banClose">关闭</button></div>',
      '</div>'
    ].join('');
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.hidden = true; });
    wrap.querySelector('#banClose').addEventListener('click', function () { wrap.hidden = true; });
    wrap.querySelector('#banAdd').addEventListener('click', addBan);
    wrap.querySelector('#banInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addBan(); }
    });
    return wrap;
  }

  function openBanModal() {
    if (!banModal) banModal = buildBanModal();
    banModal.hidden = false;
    refreshBanList();
  }

  function refreshBanList() {
    if (!state.admin) return;
    api('/api/admin/banned', { method: 'GET', headers: { 'X-Admin-Token': state.admin } })
      .then(function (data) {
        bannedNames = Array.isArray(data.names) ? data.names : [];
        renderBanList(bannedNames);
      }).catch(function (err) {
        renderBanList([]);
        toast(err.message);
      });
  }

  function renderBanList(names) {
    var box = banModal.querySelector('#banList');
    box.textContent = '';
    if (!names.length) {
      var empty = document.createElement('p');
      empty.className = 'ban-empty';
      empty.textContent = '还没有禁用任何名字。';
      box.appendChild(empty);
      return;
    }
    names.forEach(function (n) {
      var row = document.createElement('div');
      row.className = 'ban-row';
      var span = document.createElement('span');
      span.className = 'ban-name';
      span.textContent = n;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ban-del';
      btn.textContent = '解除';
      btn.addEventListener('click', function () { removeBan(n, btn); });
      row.appendChild(span);
      row.appendChild(btn);
      box.appendChild(row);
    });
  }

  function addBan() {
    var input = banModal.querySelector('#banInput');
    var addBtn = banModal.querySelector('#banAdd');
    var name = input.value.trim();
    if (!name) { toast('先写要禁用的名字'); input.focus(); return; }

    addBtn.disabled = true;
    api('/api/admin/banned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.admin },
      body: JSON.stringify({ name: name })
    }).then(function (data) {
      bannedNames = Array.isArray(data.names) ? data.names : [];
      renderBanList(bannedNames);
      input.value = '';
      toast('已禁用「' + name + '」，清掉留言 ' + data.removed_messages + ' 条、回复 ' + data.removed_replies + ' 条');
      load(true);
    }).catch(function (err) {
      toast(err.message);
    }).then(function () {
      addBtn.disabled = false;
    });
  }

  function removeBan(name, btn) {
    btn.disabled = true;
    api('/api/admin/banned', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.admin },
      body: JSON.stringify({ name: name })
    }).then(function (data) {
      bannedNames = Array.isArray(data.names) ? data.names : [];
      renderBanList(bannedNames);
      toast('「' + name + '」已经解除禁用');
    }).catch(function (err) {
      toast(err.message);
      btn.disabled = false;
    });
  }

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

  /* 打开页面先拿禁用名单：用过被禁名字的人会看到提示 */
  loadBannedNames().then(function () {
    var used = readUsedName();
    if (used && isBannedName(used)) {
      showNotice('名字已被禁用', [
        '你好，你使用的名称「' + used + '」已被禁用，请更换名称。',
        '你的所有留言已经被删除，请重新发送。'
      ]);
      saveUsedName('');
      writeTokens({});
      nameInput.value = '';
      if (state.admin) refreshBanList();
    } else {
      nameInput.value = nameInput.value || used;
    }
  });

  load(true);
})();
