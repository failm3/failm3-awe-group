import * as fs from 'node:fs';
import * as path from 'node:path';

/** Independently authored verifier fixture, NOT solver or autonomous mission output. */
export function writeStaticTaskTracker(root: string) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Task tracker fixture</title>
<link rel="stylesheet" href="style.css"><link rel="icon" href="icon.svg"></head><body><main>
<h1>Task tracker</h1><form id="form"><label>New task <input id="task"></label>
<button type="submit">Add task</button></form><label>Filter tasks <select id="filter">
<option value="all">All</option><option value="active">Active</option><option value="completed">Completed</option>
</select></label><ul id="tasks" aria-label="Tasks"></ul></main><script src="app.js" defer></script></body></html>`);
  fs.writeFileSync(path.join(root, 'app.js'), `const input = document.querySelector('#task');
const filter = document.querySelector('#filter');
const list = document.querySelector('#tasks');
let tasks = JSON.parse(localStorage.getItem('fixture-tasks') || '[]');
function save() { localStorage.setItem('fixture-tasks', JSON.stringify(tasks)); }
function render() {
  list.replaceChildren();
  for (const task of tasks) {
    if (filter.value === 'active' && task.done || filter.value === 'completed' && !task.done) continue;
    const item = document.createElement('li');
    const title = document.createElement('span'); title.textContent = task.text;
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = task.done;
    box.setAttribute('aria-label', 'Complete ' + task.text);
    box.addEventListener('change', () => { task.done = box.checked; save(); render(); });
    const remove = document.createElement('button'); remove.textContent = 'Delete';
    remove.setAttribute('aria-label', 'Delete ' + task.text);
    remove.addEventListener('click', () => { tasks = tasks.filter(other => other.id !== task.id); save(); render(); });
    item.append(title, box, remove); list.append(item);
  }
}
document.querySelector('#form').addEventListener('submit', event => {
  event.preventDefault(); const text = input.value.trim(); if (!text) return;
  tasks.push({ id: crypto.randomUUID(), text, done: false }); input.value = ''; save(); render();
});
filter.addEventListener('change', render); render();`);
  fs.writeFileSync(path.join(root, 'style.css'), '* { box-sizing: border-box } body { margin: 0; padding: 12px; font: 16px sans-serif } main { max-width: 700px; margin: auto } input { max-width: 100% } li { overflow-wrap: anywhere; margin: 8px 0 }');
  fs.writeFileSync(path.join(root, 'icon.svg'), '<svg width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>');
}
