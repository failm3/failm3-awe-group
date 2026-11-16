(function () {
  'use strict';
  var KEY = 'r1-task-tracker-v1';
  var tasks = [];
  var nextId = 1;
  var form = document.getElementById('task-form');
  var input = document.getElementById('new-task');
  var select = document.getElementById('filter');
  var list = document.getElementById('task-list');

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) { return; }
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) { return; }
      data.forEach(function (t) {
        if (t && typeof t.text === 'string' && t.text.length > 0) {
          tasks.push({ id: nextId++, text: t.text, done: t.done === true });
        }
      });
    } catch (e) {
      tasks = [];
      nextId = 1;
    }
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(tasks.map(function (t) { return { text: t.text, done: t.done }; })));
    } catch (e) {}
  }

  function render() {
    var f = select.value;
    list.textContent = '';
    tasks.forEach(function (t) {
      if (f === 'active' && t.done) { return; }
      if (f === 'completed' && !t.done) { return; }
      var li = document.createElement('li');
      li.className = 'task' + (t.done ? ' done' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = t.done;
      cb.setAttribute('aria-label', 'Complete ' + t.text);
      cb.setAttribute('data-id', String(t.id));
      var span = document.createElement('span');
      span.className = 'task-text';
      span.textContent = t.text;
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete ' + t.text);
      del.setAttribute('data-id', String(t.id));
      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function focusControl(selector, id) {
    var nodes = list.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-id') === String(id)) {
        nodes[i].focus();
        return;
      }
    }
  }

  function indexOfId(id) {
    for (var i = 0; i < tasks.length; i++) {
      if (String(tasks[i].id) === String(id)) { return i; }
    }
    return -1;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var text = input.value.trim();
    if (text === '') {
      input.value = '';
      input.focus();
      return;
    }
    tasks.push({ id: nextId++, text: text, done: false });
    input.value = '';
    save();
    render();
    input.focus();
  });

  select.addEventListener('change', function () {
    render();
  });

  list.addEventListener('change', function (ev) {
    var target = ev.target;
    if (!target || target.type !== 'checkbox') { return; }
    var id = target.getAttribute('data-id');
    var idx = indexOfId(id);
    if (idx < 0) { return; }
    tasks[idx].done = target.checked;
    save();
    render();
    focusControl('input[type=checkbox]', id);
  });

  list.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || target.tagName !== 'BUTTON') { return; }
    var idx = indexOfId(target.getAttribute('data-id'));
    if (idx < 0) { return; }
    tasks.splice(idx, 1);
    save();
    render();
    input.focus();
  });

  load();
  render();
})();
