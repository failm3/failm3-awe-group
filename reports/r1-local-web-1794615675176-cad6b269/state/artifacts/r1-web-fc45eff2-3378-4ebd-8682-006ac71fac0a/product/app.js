/*
 * Local task tracker. Classic script, no dependencies, no network access.
 * All DOM is built with createElement / textContent so task text renders literally.
 * List items are reused between renders (keyed by task id) so keyboard focus is
 * not lost when a task is added, toggled, filtered or deleted.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "task-tracker-state-v1";

  var form = document.getElementById("task-form");
  var input = document.getElementById("new-task");
  var filterSelect = document.getElementById("filter");
  var list = document.getElementById("tasks");

  var tasks = [];
  var idCounter = 0;
  var nodes = Object.create(null);

  function safeGetItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function normalize(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    var out = [];
    for (var i = 0; i < raw.length; i += 1) {
      var item = raw[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (typeof item.text !== "string") {
        continue;
      }
      var id;
      if (typeof item.id === "number" && isFinite(item.id)) {
        id = item.id;
      } else {
        idCounter += 1;
        id = Date.now() + idCounter;
      }
      out.push({
        id: id,
        text: item.text,
        completed: item.completed === true
      });
    }
    return out;
  }

  function load() {
    var stored = safeGetItem(STORAGE_KEY);
    if (stored === null || stored === undefined || stored === "") {
      tasks = [];
      return;
    }
    var parsed = null;
    try {
      parsed = JSON.parse(stored);
    } catch (error) {
      tasks = [];
      return;
    }
    tasks = normalize(parsed);
  }

  function save() {
    var payload = [];
    for (var i = 0; i < tasks.length; i += 1) {
      payload.push({
        id: tasks[i].id,
        text: tasks[i].text,
        completed: tasks[i].completed
      });
    }
    var serialized = "";
    try {
      serialized = JSON.stringify(payload);
    } catch (error) {
      return;
    }
    safeSetItem(STORAGE_KEY, serialized);
  }

  function nextId() {
    var taken = true;
    var candidate = 0;
    while (taken) {
      idCounter += 1;
      candidate = Date.now() + idCounter;
      taken = false;
      for (var i = 0; i < tasks.length; i += 1) {
        if (tasks[i].id === candidate) {
          taken = true;
          break;
        }
      }
    }
    return candidate;
  }

  function currentFilter() {
    if (!filterSelect) {
      return "all";
    }
    var value = filterSelect.value;
    if (value === "active" || value === "completed") {
      return value;
    }
    return "all";
  }

  function isVisible(task) {
    var filter = currentFilter();
    if (filter === "active") {
      return task.completed === false;
    }
    if (filter === "completed") {
      return task.completed === true;
    }
    return true;
  }

  function addTask(text) {
    tasks.push({
      id: nextId(),
      text: text,
      completed: false
    });
  }

  function removeTask(task) {
    for (var i = 0; i < tasks.length; i += 1) {
      if (tasks[i] === task) {
        tasks.splice(i, 1);
        return;
      }
    }
  }

  function buildItem(task) {
    var item = document.createElement("li");
    item.setAttribute("data-task-id", String(task.id));

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed === true;

    var span = document.createElement("span");
    span.className = "task-text";
    span.textContent = task.text;

    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Delete";

    checkbox.addEventListener("change", function () {
      task.completed = checkbox.checked === true;
      save();
      render();
    });

    button.addEventListener("click", function () {
      var destination = neighbourControl(item);
      removeTask(task);
      save();
      render();
      if (destination && document.contains(destination)) {
        destination.focus();
      }
    });

    item.appendChild(checkbox);
    item.appendChild(span);
    item.appendChild(button);

    return { item: item, checkbox: checkbox, span: span, button: button, task: task };
  }

  /* Choose a sensible keyboard destination before a list item is removed. */
  function neighbourControl(item) {
    var candidate = item.nextElementSibling || item.previousElementSibling;
    if (!candidate) {
      return null;
    }
    var toggle = candidate.querySelector("input");
    return toggle || null;
  }

  function syncNode(node, task) {
    var completeLabel = "Complete " + task.text;
    var deleteLabel = "Delete " + task.text;
    if (node.checkbox.getAttribute("aria-label") !== completeLabel) {
      node.checkbox.setAttribute("aria-label", completeLabel);
    }
    if (node.button.getAttribute("aria-label") !== deleteLabel) {
      node.button.setAttribute("aria-label", deleteLabel);
    }
    if (node.span.textContent !== task.text) {
      node.span.textContent = task.text;
    }
    if (node.checkbox.checked !== (task.completed === true)) {
      node.checkbox.checked = task.completed === true;
    }
    var desiredClass = task.completed === true ? "task-text completed" : "task-text";
    if (node.span.className !== desiredClass) {
      node.span.className = desiredClass;
    }
  }

  function describeFocus(element) {
    if (!element || element === document.body || !list || !list.contains(element)) {
      return null;
    }
    var item = element.parentNode;
    while (item && item !== list && item.nodeName !== "LI") {
      item = item.parentNode;
    }
    if (!item || item === list) {
      return null;
    }
    var key = item.getAttribute("data-task-id");
    if (key === null) {
      return null;
    }
    if (element.nodeName === "INPUT") {
      return { key: key, control: "checkbox" };
    }
    if (element.nodeName === "BUTTON") {
      return { key: key, control: "button" };
    }
    return null;
  }

  function restoreFocus(previousFocus, hint) {
    if (!previousFocus || previousFocus === document.body) {
      return;
    }
    if (
      document.contains(previousFocus) &&
      previousFocus !== document.activeElement
    ) {
      previousFocus.focus();
      return;
    }
    if (previousFocus === document.activeElement) {
      return;
    }
    if (hint && nodes[hint.key] && hint.control) {
      var replacement = nodes[hint.key][hint.control];
      if (replacement && document.contains(replacement)) {
        replacement.focus();
        return;
      }
    }
    var fallback = list ? list.querySelector("input") : null;
    if (fallback) {
      fallback.focus();
    } else if (input) {
      input.focus();
    }
  }

  function render() {
    if (!list) {
      return;
    }

    var previousFocus = document.activeElement;
    var hint = describeFocus(previousFocus);

    var desired = [];
    var wanted = Object.create(null);
    var i;

    for (i = 0; i < tasks.length; i += 1) {
      var task = tasks[i];
      if (!isVisible(task)) {
        continue;
      }
      var key = String(task.id);
      var node = nodes[key];
      if (!node) {
        node = buildItem(task);
        nodes[key] = node;
      }
      syncNode(node, task);
      desired.push(node.item);
      wanted[key] = true;
    }

    var stale = [];
    for (i = 0; i < list.children.length; i += 1) {
      var child = list.children[i];
      var childKey = child.getAttribute("data-task-id");
      if (childKey === null || !wanted[childKey]) {
        stale.push(child);
      }
    }
    for (i = 0; i < stale.length; i += 1) {
      var staleKey = stale[i].getAttribute("data-task-id");
      if (staleKey !== null && nodes[staleKey] && nodes[staleKey].item === stale[i]) {
        delete nodes[staleKey];
      }
      if (stale[i].parentNode === list) {
        list.removeChild(stale[i]);
      }
    }

    for (i = 0; i < desired.length; i += 1) {
      var target = desired[i];
      var current = list.children[i] || null;
      if (current !== target) {
        list.insertBefore(target, current);
      }
    }

    restoreFocus(previousFocus, hint);
  }

  function onSubmit(event) {
    event.preventDefault();
    var text = "";
    if (input && typeof input.value === "string") {
      text = input.value.trim();
    }
    if (text === "") {
      if (input) {
        input.focus();
      }
      return;
    }
    addTask(text);
    save();
    if (input) {
      input.value = "";
    }
    render();
    if (input) {
      input.focus();
    }
  }

  if (form) {
    form.addEventListener("submit", onSubmit);
  }

  if (filterSelect) {
    filterSelect.addEventListener("change", function () {
      render();
    });
  }

  load();
  render();
})();
