(() => {
  "use strict";

  const STORAGE_KEY = "todo-journal:v1";
  const MAX_LEN = 200;

  const $ = (sel) => document.querySelector(sel);
  const form = $("#add-form");
  const input = $("#new-task");
  const addBtn = $("#add-btn");
  const list = $("#list");
  const empty = $("#empty");
  const summary = $("#summary");
  const clearBtn = $("#clear-done");
  const tpl = $("#task-tpl");
  const filterBtns = document.querySelectorAll(".filter");

  const newDueWrap = $("#new-due-wrap");
  const newDueBtn = $("#new-due-btn");
  const newDueLabel = $("#new-due-label");
  const newDueClear = $("#new-due-clear");

  /** @type {{id: string, text: string, done: boolean, due: string|null, time: string|null, createdAt: number}[]} */
  let tasks = load();
  let filter = "all";
  let dayFilter = null; // ISO date picked in the week strip
  let sortMode = loadSort(); // "manual" | "due"
  const nodes = new Map(); // id -> <li>

  function loadSort() {
    try { return localStorage.getItem(STORAGE_KEY + ":sort") === "due" ? "due" : "manual"; }
    catch { return "manual"; }
  }

  function saveSort() {
    try { localStorage.setItem(STORAGE_KEY + ":sort", sortMode); } catch { /* ignore */ }
  }

  /** tasks in display order: own order, or by deadline (no deadline last) */
  function ordered() {
    if (sortMode !== "due") return tasks;
    return tasks
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        // same day: tasks with a time go first, in time order
        const da = (a.t.due || "9999-99-99") + " " + (a.t.time || "99:99");
        const db = (b.t.due || "9999-99-99") + " " + (b.t.time || "99:99");
        return da < db ? -1 : da > db ? 1 : a.i - b.i;
      })
      .map((x) => x.t);
  }

  // ---------- storage ----------

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data
        .filter((t) => t && typeof t.id === "string" && typeof t.text === "string")
        .map((t) => ({
          id: t.id,
          text: t.text.slice(0, MAX_LEN),
          done: Boolean(t.done),
          due: isISODate(t.due) ? t.due : null,
          time: isISODate(t.due) && isTime(t.time) ? t.time : null,
          createdAt: Number(t.createdAt) || Date.now(),
        }));
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      /* private mode or full storage: the list still works until reload */
    }
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ---------- dates ----------

  function isISODate(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function daysUntil(iso) {
    return Math.round((parseISO(iso) - startOfToday()) / 86400000);
  }

  function shortDate(iso) {
    const date = parseISO(iso);
    const opts = { day: "numeric", month: "short" };
    if (date.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return date.toLocaleDateString("ru-RU", opts);
  }

  function weekdayShort(iso) {
    return parseISO(iso).toLocaleDateString("ru-RU", { weekday: "short" });
  }

  function isTime(v) {
    return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
  }

  function nowHHMM() {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  }

  function isLate(task) {
    if (task.done || !task.due) return false;
    const d = daysUntil(task.due);
    return d < 0 || (d === 0 && Boolean(task.time) && task.time <= nowHHMM());
  }

  /** text and tone for a deadline chip */
  function dueInfo(task) {
    const iso = task.due;
    const at = task.time ? `, ${task.time}` : "";
    const d = daysUntil(iso);
    if (d < 0) return { text: `просрочено, ${shortDate(iso)}${at}`, tone: "late" };
    if (d === 0) {
      if (isLate(task)) return { text: `просрочено, сегодня${at}`, tone: "late" };
      return { text: task.time ? `сегодня в ${task.time}` : "сегодня", tone: "soon" };
    }
    if (d === 1) return { text: task.time ? `завтра в ${task.time}` : "завтра", tone: "soon" };
    if (d < 7) return { text: `${task.time ? "" : "до "}${weekdayShort(iso)}, ${shortDate(iso)}${at}`, tone: "" };
    return { text: `${task.time ? "" : "до "}${shortDate(iso)}${at}`, tone: "" };
  }

  function pickerLabel(iso) {
    const d = daysUntil(iso);
    if (d === 0) return "Сегодня";
    if (d === 1) return "Завтра";
    return shortDate(iso);
  }

  // ---------- header ----------

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function renderDate() {
    const now = new Date();
    $("#date").textContent = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const day = now.toLocaleDateString("ru-RU", { weekday: "long" });
    return day.charAt(0).toUpperCase() + day.slice(1);
  }


  function visible(task) {
    if (dayFilter && task.due !== dayFilter) return false;
    if (filter === "active") return !task.done;
    if (filter === "done") return task.done;
    return true;
  }

  // ---------- rendering ----------

  function createNode(task) {
    const li = tpl.content.firstElementChild.cloneNode(true);
    li.dataset.id = task.id;
    li.classList.add("is-new");
    li.addEventListener("animationend", (e) => {
      if (e.animationName === "task-in") li.classList.remove("is-new");
    });
    nodes.set(task.id, li);
    return li;
  }

  function updateNode(li, task) {
    const text = li.querySelector(".text");
    if (text.textContent !== task.text) text.textContent = task.text;
    li.classList.toggle("is-done", task.done);

    const cb = li.querySelector(".check-input");
    cb.checked = task.done;
    cb.setAttribute("aria-label", task.done ? `Вернуть в работу: ${task.text}` : `Отметить выполненной: ${task.text}`);

    const due = li.querySelector(".due");
    if (task.due) {
      const info = dueInfo(task);
      due.hidden = false;
      due.className = "due" + (info.tone ? ` is-${info.tone}` : "");
      due.textContent = "";
      due.insertAdjacentHTML("afterbegin", '<svg class="icon" aria-hidden="true"><use href="#i-cal"/></svg>');
      due.append(info.text);
    } else {
      due.hidden = true;
    }
  }

  function markMultiline() {
    // read everything first, then write, so the browser lays out once
    const rows = [...list.children].map((li) => {
      const text = li.querySelector(".text");
      const lh = parseFloat(getComputedStyle(text).lineHeight) || 24;
      return [li, text.offsetHeight > lh * 1.5];
    });
    rows.forEach(([li, multi]) => li.classList.toggle("is-multiline", multi));
  }

  function render() {
    const ids = new Set(tasks.map((t) => t.id));
    for (const [id, li] of nodes) {
      if (!ids.has(id)) { li.remove(); nodes.delete(id); }
    }

    list.classList.toggle("is-auto", sortMode === "due");
    const wanted = [];
    for (const task of ordered()) {
      let li = nodes.get(task.id);
      if (!visible(task)) { if (li) li.remove(); continue; }
      if (!li) li = createNode(task);
      li.classList.remove("is-leaving");
      if (!li.classList.contains("is-editing")) updateNode(li, task);
      wanted.push(li);
    }
    // move only rows that are out of place, so existing rows keep their state
    wanted.forEach((li, i) => {
      if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
    });
    while (list.children.length > wanted.length) list.lastElementChild.remove();

    renderCounts();
    markMultiline();
  }

  function renderCounts() {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const active = total - done;
    const late = tasks.filter(isLate).length;

    document.querySelector('[data-count="all"]').textContent = total;
    document.querySelector('[data-count="active"]').textContent = active;
    document.querySelector('[data-count="done"]').textContent = done;

    const weekday = renderDate(); // recomputed so the header rolls over at midnight
    summary.textContent = "";
    if (total === 0) {
      summary.textContent = `${weekday}, пока ни одной задачи`;
    } else if (active === 0) {
      summary.append(`${weekday}, `, Object.assign(document.createElement("b"), { textContent: "всё сделано" }));
    } else {
      summary.append(`${weekday}, осталось ${active} ${plural(active, "дело", "дела", "дел")} из ${total}`);
      if (late) {
        summary.append(", ", Object.assign(document.createElement("span"), {
          className: "late",
          textContent: `${late} ${plural(late, "просрочено", "просрочены", "просрочено")}`,
        }));
      }
    }

    renderWeek();

    const shown = tasks.filter(visible).length;
    empty.hidden = shown !== 0;
    if (shown === 0) {
      empty.textContent =
        total === 0 ? "Здесь пусто. Запишите первое дело, оно останется на месте, даже если закрыть вкладку."
        : dayFilter ? "На этот день задач нет. Новая задача сейчас получит этот срок."
        : filter === "active" ? "Всё сделано. Можно выдохнуть."
        : "Пока ничего не отмечено.";
    }

    clearBtn.hidden = done === 0;
    $(".hint").hidden = total < 2 || sortMode === "due";
  }

  // ---------- week strip ----------

  const week = $("#week");
  const dayChip = $("#day-chip");

  function isoOf(date) {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
  }

  function renderWeek() {
    const counts = new Map();
    tasks.forEach((t) => { if (t.due && !t.done) counts.set(t.due, (counts.get(t.due) || 0) + 1); });

    const today = startOfToday();
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const iso = isoOf(date);
      const n = counts.get(iso) || 0;
      const name = date.toLocaleDateString("ru-RU", { weekday: "short" });
      const full = date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
      const label = `${i === 0 ? "Сегодня, " : ""}${full}: ${n ? `${n} ${plural(n, "задача", "задачи", "задач")}` : "задач нет"}`;
      const wd = date.getDay();
      const cls = ["day", i === 0 ? "is-today" : "", wd === 0 || wd === 6 ? "is-weekend" : ""].join(" ").trim();
      const dots = "<i></i>".repeat(Math.min(n, 3));
      cells.push(
        `<button type="button" class="${cls}" data-day="${iso}" aria-pressed="${dayFilter === iso}" aria-label="${label}">` +
        `<span class="day-name" aria-hidden="true">${name}</span>` +
        `<span class="day-num" aria-hidden="true">${date.getDate()}</span>` +
        `<span class="day-dots" aria-hidden="true">${dots}</span></button>`
      );
    }
    const html = cells.join("");
    if (week.dataset.html !== html) {
      const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.day : null;
      week.innerHTML = html;
      week.dataset.html = html;
      if (focused) { const b = week.querySelector(`[data-day="${focused}"]`); if (b) b.focus(); }
    }

    dayChip.hidden = !dayFilter;
    if (dayFilter) $("#day-chip-text").textContent = pickerLabel(dayFilter);
    dayChip.setAttribute("aria-label", dayFilter ? `Показать задачи за все дни, сейчас выбран ${pickerLabel(dayFilter)}` : "");
  }

  function setDay(iso) {
    const prev = dayFilter;
    dayFilter = iso;
    // a new task added while a day is picked gets that day as its deadline
    if (iso) setNewDue(iso);
    else if (prev && newDue === prev) setNewDue(null);
    render();
  }

  week.addEventListener("click", (e) => {
    const b = e.target.closest(".day");
    if (!b) return;
    setDay(dayFilter === b.dataset.day ? null : b.dataset.day);
  });

  dayChip.addEventListener("click", () => setDay(null));

  const sortBtn = $("#sort-btn");
  function syncSortBtn() {
    sortBtn.setAttribute("aria-pressed", String(sortMode === "due"));
    sortBtn.title = sortMode === "due" ? "Сейчас по сроку. Нажмите, чтобы вернуть свой порядок" : "Отсортировать по сроку";
  }
  sortBtn.addEventListener("click", () => {
    sortMode = sortMode === "due" ? "manual" : "due";
    saveSort();
    syncSortBtn();
    render();
  });
  syncSortBtn();

  // ---------- actions ----------

  function addTask(text, due, time) {
    tasks.unshift({ id: uid(), text, done: false, due, time: due ? time : null, createdAt: Date.now() });
    if (dayFilter && due !== dayFilter) dayFilter = null;
    if (filter === "done") setFilter("all");
    save();
    render();
  }

  function toggleTask(id, done) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = done;
    save();
    // let the strike animation play before a filter hides the row
    if (filter !== "all") { renderCounts(); setTimeout(render, 450); }
    else render();
  }

  /** apply a new order of the currently visible tasks to the full list */
  function reorderVisible(orderedIds) {
    if (sortMode === "due") return;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const slots = [];
    tasks.forEach((t, i) => { if (visible(t)) slots.push(i); });
    const next = tasks.slice();
    slots.forEach((slot, i) => { next[slot] = byId.get(orderedIds[i]); });
    tasks = next;
    save();
    render();
  }

  function moveByKeyboard(li, step) {
    if (sortMode === "due") return;
    const ids = [...list.children].map((el) => el.dataset.id);
    const from = ids.indexOf(li.dataset.id);
    const to = from + step;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderVisible(ids);
    li.querySelector(".grip").focus();
  }

  // ---------- undo ----------

  const toast = $("#toast");
  const toastText = $("#toast-text");
  let undoSnapshot = null;
  let toastTimer;

  function showUndo(snapshot, count) {
    undoSnapshot = snapshot;
    toastText.textContent = count === 1 ? "Задача удалена" : `Удалено задач: ${count}`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideUndo, 5000);
  }

  function hideUndo() {
    toast.hidden = true;
    undoSnapshot = null;
  }

  $("#toast-undo").addEventListener("click", () => {
    if (!undoSnapshot) return;
    // deleted tasks return to their old places; tasks added or changed since stay as they are
    const current = new Map(tasks.map((t) => [t.id, t]));
    const snapIds = new Set(undoSnapshot.map((t) => t.id));
    const addedSince = tasks.filter((t) => !snapIds.has(t.id));
    tasks = [...addedSince, ...undoSnapshot.map((s) => current.get(s.id) || s)];
    save();
    hideUndo();
    render();
    input.focus();
  });

  function removeTasks(ids) {
    const set = new Set(ids);
    if (!set.size) return;
    const leaving = [...set].map((id) => nodes.get(id)).filter((li) => li && li.isConnected);
    const snapshot = tasks.map((t) => ({ ...t }));
    tasks = tasks.filter((t) => !set.has(t.id));
    save();
    renderCounts();
    showUndo(snapshot, set.size);

    if (!leaving.length) { render(); return; }
    let finished = false;
    const done = () => { if (!finished) { finished = true; render(); } };
    leaving.forEach((li) => li.classList.add("is-leaving"));
    leaving[0].addEventListener("animationend", done, { once: true });
    setTimeout(done, 450);
  }

  // ---------- date & time picker ----------

  const picker = $("#picker");
  let pk = null; // { anchor, mode, date, time, onChange, view }

  const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const pad = (n) => String(n).padStart(2, "0");
  const chevron = (dir) => `<svg class="icon" aria-hidden="true"><path d="${dir < 0 ? "M14.5 6l-6 6 6 6" : "M9.5 6l6 6-6 6"}"/></svg>`;

  function addDays(n) {
    const t = startOfToday();
    return isoOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
  }

  /** open the picker under an anchor button; onChange(date, time) fires on every pick */
  function openDT({ anchor, mode, date, time, onChange }) {
    if (pk && pk.anchor === anchor && pk.mode === mode) { closeDT(); return; }
    if (pk) closeDT(false);
    const base = date ? parseISO(date) : startOfToday();
    pk = { anchor, mode, date, time, onChange, view: new Date(base.getFullYear(), base.getMonth(), 1) };
    anchor.setAttribute("aria-expanded", "true");
    drawPicker();
    picker.hidden = false;
    alignWheels();
    placePicker();
    void picker.offsetWidth; // commit the closed state so the open transition plays
    picker.classList.add("is-open");
    const first = picker.querySelector(".wheel") || picker.querySelector(".is-selected") || picker.querySelector(".is-today") || picker.querySelector("button");
    if (first) first.focus({ preventScroll: true });
    document.addEventListener("pointerdown", pickerOutside, true);
  }

  function closeDT(returnFocus = true) {
    if (!pk) return;
    const { anchor } = pk;
    pk = null;
    anchor.setAttribute("aria-expanded", "false");
    picker.classList.remove("is-open");
    picker.hidden = true;
    document.removeEventListener("pointerdown", pickerOutside, true);
    if (returnFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  function pickerOutside(e) {
    if (!pk) return;
    if (picker.contains(e.target) || pk.anchor.contains(e.target)) return;
    closeDT(false);
  }

  function placePicker() {
    if (window.matchMedia("(max-width: 480px)").matches) {
      picker.style.top = picker.style.left = "";
      return;
    }
    const r = pk.anchor.getBoundingClientRect();
    const w = picker.offsetWidth;
    const h = picker.offsetHeight;
    let left = r.right - w;
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 12 && r.top - h - 8 > 12) top = r.top - h - 8;
    picker.style.left = `${left + window.scrollX}px`;
    picker.style.top = `${top + window.scrollY}px`;
  }

  function emit() { pk.onChange(pk.date, pk.time); }

  function drawPicker() {
    if (pk.mode === "date") drawCalendar();
    else drawTime();
  }

  function drawCalendar() {
    const { view } = pk;
    const today = isoOf(startOfToday());
    const first = view.getDay() === 0 ? 6 : view.getDay() - 1; // Monday first
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span class="pk-blank"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${view.getFullYear()}-${pad(view.getMonth() + 1)}-${pad(d)}`;
      const cls = ["pk-day", iso === today ? "is-today" : "", iso === pk.date ? "is-selected" : "", iso < today ? "is-past" : ""].join(" ").trim();
      const label = parseISO(iso).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
      cells.push(`<button type="button" class="${cls}" data-date="${iso}" aria-label="${label}" aria-pressed="${iso === pk.date}">${d}</button>`);
    }
    const quick = [["Сегодня", addDays(0)], ["Завтра", addDays(1)], ["Через неделю", addDays(7)]]
      .map(([t, iso]) => `<button type="button" class="pk-chip${iso === pk.date ? " is-selected" : ""}" data-date="${iso}">${t}</button>`).join("");

    picker.innerHTML = `
      <div class="pk-quick">${quick}</div>
      <div class="pk-head">
        <button type="button" class="pk-nav" data-nav="-1" aria-label="Предыдущий месяц">${chevron(-1)}</button>
        <span class="pk-title">${MONTHS[view.getMonth()]} ${view.getFullYear()}</span>
        <button type="button" class="pk-nav" data-nav="1" aria-label="Следующий месяц">${chevron(1)}</button>
      </div>
      <div class="pk-week" aria-hidden="true"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>
      <div class="pk-grid">${cells.join("")}</div>
      <div class="pk-foot">
        <button type="button" class="pk-link" data-act="clear">Без срока</button>
        <button type="button" class="pk-link pk-link-strong" data-act="to-time">
          <svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>${pk.time ? pk.time : "Добавить время"}
        </button>
      </div>`;
    picker.setAttribute("aria-label", "Выбор даты");
  }

  // time is picked on two scroll wheels; nothing is saved until "Готово"
  const ITEM = 40; // px, must match .wheel-item height
  const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
  const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));
  const PRESETS = ["09:00", "12:00", "15:00", "18:00", "21:00"];

  function defaultTime() {
    const h = new Date().getHours();
    return h >= 23 ? "23:55" : `${pad(h + 1)}:00`;
  }

  function nearestMinute(mm) {
    const i = Math.min(11, Math.round(Number(mm) / 5));
    return MINUTES[i];
  }

  function wheelHTML(kind, values, current, label) {
    const items = values
      .map((v) => `<div class="wheel-item${v === current ? " is-current" : ""}" data-v="${v}" role="option" aria-selected="${v === current}">${v}</div>`)
      .join("");
    return `<div class="wheel" data-wheel="${kind}" tabindex="0" role="listbox" aria-label="${label}">` +
      `<div class="wheel-pad"></div>${items}<div class="wheel-pad"></div></div>`;
  }

  function drawTime() {
    const start = pk.time || defaultTime();
    const [h, m] = start.split(":");
    pk.draft = `${h}:${nearestMinute(m)}`;
    const [dh, dm] = pk.draft.split(":");
    const dayLabel = pk.date ? pickerLabel(pk.date) : "Сегодня";
    const presets = PRESETS
      .map((t) => `<button type="button" class="pk-chip pk-preset" data-preset="${t}">${t}</button>`).join("");

    picker.innerHTML = `
      <div class="pk-head">
        <button type="button" class="pk-nav" data-act="to-date" aria-label="Назад к дате">${chevron(-1)}</button>
        <span class="pk-title">${dayLabel}</span>
        <span class="pk-nav-space"></span>
      </div>
      <div class="pk-presets">${presets}</div>
      <div class="wheels">
        <div class="wheel-band" aria-hidden="true"></div>
        ${wheelHTML("h", HOURS, dh, "Часы")}
        <span class="wheel-colon" aria-hidden="true">:</span>
        ${wheelHTML("m", MINUTES, dm, "Минуты")}
      </div>
      <div class="pk-foot">
        <button type="button" class="pk-link" data-act="no-time">Без времени</button>
        <button type="button" class="pk-done" data-act="done">Готово, ${pk.draft}</button>
      </div>`;
    picker.setAttribute("aria-label", "Выбор времени");

    picker.querySelectorAll(".wheel").forEach((wheel) => {
      wheel.addEventListener("scroll", () => syncWheel(wheel), { passive: true });
    });
    alignWheels();
  }

  /** put both wheels on the draft time; only works while the picker is visible */
  function alignWheels() {
    if (!pk || pk.mode !== "time" || picker.hidden) return;
    const [h, m] = pk.draft.split(":");
    picker.querySelectorAll(".wheel").forEach((wheel) => {
      wheel.scrollTop = wheelValues(wheel).indexOf(wheel.dataset.wheel === "h" ? h : m) * ITEM;
    });
  }

  function wheelValues(wheel) {
    return wheel.dataset.wheel === "h" ? HOURS : MINUTES;
  }

  function syncWheel(wheel) {
    if (!pk || pk.mode !== "time") return;
    const values = wheelValues(wheel);
    const i = Math.max(0, Math.min(values.length - 1, Math.round(wheel.scrollTop / ITEM)));
    const v = values[i];
    const [h, m] = pk.draft.split(":");
    const next = wheel.dataset.wheel === "h" ? `${v}:${m}` : `${h}:${v}`;
    if (next === pk.draft) return;
    pk.draft = next;
    wheel.querySelectorAll(".wheel-item").forEach((el) => {
      const on = el.dataset.v === v;
      el.classList.toggle("is-current", on);
      el.setAttribute("aria-selected", String(on));
    });
    picker.querySelector(".pk-done").textContent = `Готово, ${pk.draft}`;
  }

  // mouse users can grab a wheel and drag it; touch and trackpad scroll natively
  let wheelDrag = null;

  picker.addEventListener("pointerdown", (e) => {
    const wheel = e.target.closest(".wheel");
    if (!wheel || e.pointerType === "touch" || e.button !== 0) return;
    e.preventDefault();
    wheel.focus({ preventScroll: true });
    wheelDrag = { wheel, startY: e.clientY, startTop: wheel.scrollTop, lastY: e.clientY, lastT: performance.now(), v: 0, moved: false };
    wheel.setPointerCapture(e.pointerId);
  });

  picker.addEventListener("pointermove", (e) => {
    if (!wheelDrag) return;
    const d = wheelDrag;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 4) return;
    if (!d.moved) { d.moved = true; d.wheel.classList.add("is-dragging"); }
    const now = performance.now();
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT); // px per ms
    d.lastY = e.clientY;
    d.lastT = now;
    d.wheel.scrollTop = d.startTop - dy;
  });

  function endWheelDrag() {
    if (!wheelDrag) return;
    const { wheel, moved, v } = wheelDrag;
    wheelDrag = null;
    if (!moved) return;
    // ignore the click that follows a drag
    wheel.dataset.dragged = "1";
    setTimeout(() => { delete wheel.dataset.dragged; }, 0);
    const values = wheelValues(wheel);
    const projected = wheel.scrollTop - v * 150; // a little momentum
    const i = Math.max(0, Math.min(values.length - 1, Math.round(projected / ITEM)));
    wheel.classList.remove("is-dragging");
    scrollWheelTo(wheel, values[i]);
  }

  picker.addEventListener("pointerup", endWheelDrag);
  picker.addEventListener("pointercancel", endWheelDrag);

  function scrollWheelTo(wheel, value) {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    wheel.scrollTo({ top: wheelValues(wheel).indexOf(value) * ITEM, behavior: smooth ? "smooth" : "auto" });
  }

  picker.addEventListener("click", (e) => {
    if (!pk) return;

    const item = e.target.closest(".wheel-item");
    if (item && item.closest(".wheel").dataset.dragged) return;
    if (item) { scrollWheelTo(item.closest(".wheel"), item.dataset.v); return; }

    const b = e.target.closest("button");
    if (!b || b.disabled) return;

    if (b.dataset.date) {
      pk.date = b.dataset.date;
      emit();
      closeDT();
      return;
    }
    if (b.dataset.nav) {
      pk.view = new Date(pk.view.getFullYear(), pk.view.getMonth() + Number(b.dataset.nav), 1);
      drawPicker();
      picker.querySelector(`[data-nav="${b.dataset.nav}"]`).focus();
      return;
    }
    if (b.dataset.preset) {
      const [h, m] = b.dataset.preset.split(":");
      scrollWheelTo(picker.querySelector('[data-wheel="h"]'), h);
      scrollWheelTo(picker.querySelector('[data-wheel="m"]'), m);
      return;
    }
    const act = b.dataset.act;
    if (act === "clear") { pk.date = null; pk.time = null; emit(); closeDT(); }
    else if (act === "no-time") { pk.time = null; emit(); closeDT(); }
    else if (act === "done") {
      if (pk.mode === "time") {
        pk.time = pk.draft;
        if (!pk.date) pk.date = addDays(0);
        emit();
      }
      closeDT();
    }
    else if (act === "to-time") { pk.mode = "time"; drawPicker(); placePicker(); picker.querySelector(".wheel").focus({ preventScroll: true }); }
    else if (act === "to-date") { pk.mode = "date"; drawPicker(); placePicker(); (picker.querySelector(".pk-day.is-selected") || picker.querySelector(".is-today") || picker.querySelector("button")).focus(); }
  });

  picker.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeDT(); return; }
    const wheel = e.target.closest && e.target.closest(".wheel");
    if (!wheel || !pk) return;
    const values = wheelValues(wheel);
    const [h, m] = pk.draft.split(":");
    const i = values.indexOf(wheel.dataset.wheel === "h" ? h : m);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(values.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      scrollWheelTo(wheel, values[next]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      picker.querySelector(".pk-done").click();
    }
  });

  window.addEventListener("resize", () => { if (pk) placePicker(); });

  // ---------- inline edit ----------

  function startEdit(li, openDate = false) {
    if (li.classList.contains("is-editing")) return;
    const task = tasks.find((t) => t.id === li.dataset.id);
    if (!task) return;

    const body = li.querySelector(".body");
    const shown = [...body.children];
    shown.forEach((el) => { el.dataset.wasHidden = el.hidden ? "1" : ""; el.hidden = true; });

    const draft = { due: task.due, time: task.time };
    const box = document.createElement("div");
    box.className = "edit-form";
    box.innerHTML = `
      <input type="text" class="edit-input" maxlength="${MAX_LEN}" aria-label="Текст задачи">
      <div class="edit-row">
        <button type="button" class="edit-pick" data-pick="date" aria-haspopup="dialog" aria-expanded="false">
          <svg class="icon" aria-hidden="true"><use href="#i-cal"/></svg><span></span>
        </button>
        <button type="button" class="edit-pick" data-pick="time" aria-haspopup="dialog" aria-expanded="false">
          <svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg><span></span>
        </button>
        <button type="button" class="edit-link">Без срока</button>
        <button type="button" class="edit-save">Сохранить</button>
      </div>`;
    const field = box.querySelector(".edit-input");
    const dateBtn = box.querySelector('[data-pick="date"]');
    const timeBtn = box.querySelector('[data-pick="time"]');
    field.value = task.text;

    const paint = () => {
      dateBtn.querySelector("span").textContent = draft.due ? pickerLabel(draft.due) : "Дата";
      timeBtn.querySelector("span").textContent = draft.time || "Время";
      dateBtn.classList.toggle("is-empty", !draft.due);
      timeBtn.classList.toggle("is-empty", !draft.time);
      dateBtn.setAttribute("aria-label", draft.due ? `Срок: ${pickerLabel(draft.due)}. Изменить` : "Выбрать дату");
      timeBtn.setAttribute("aria-label", draft.time ? `Время: ${draft.time}. Изменить` : "Выбрать время");
      box.querySelector(".edit-link").hidden = !draft.due;
    };
    paint();

    const pick = (mode, anchor) => openDT({
      anchor, mode, date: draft.due, time: draft.time,
      onChange: (d, t) => { draft.due = d; draft.time = d ? t : null; paint(); },
    });
    dateBtn.addEventListener("click", () => pick("date", dateBtn));
    timeBtn.addEventListener("click", () => pick("time", timeBtn));

    body.append(box);
    li.classList.add("is-editing");

    if (openDate) pick("date", dateBtn);
    else {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }

    let closed = false;
    const close = (commit) => {
      if (closed) return;
      closed = true;
      closeDT(false);
      if (commit) {
        const value = field.value.trim();
        if (value) task.text = value;
        task.due = draft.due;
        task.time = draft.due ? draft.time : null;
        save();
      }
      box.remove();
      shown.forEach((el) => { el.hidden = el.dataset.wasHidden === "1"; delete el.dataset.wasHidden; });
      li.classList.remove("is-editing");
      document.removeEventListener("pointerdown", outside, true);
      render();
      li.querySelector(".edit").focus({ preventScroll: true });
    };

    const outside = (e) => {
      if (li.contains(e.target) || picker.contains(e.target)) return;
      close(true);
    };
    document.addEventListener("pointerdown", outside, true);

    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      if (e.key === "Enter" && e.target === field) { e.preventDefault(); close(true); }
    });
    box.querySelector(".edit-link").addEventListener("click", () => { draft.due = null; draft.time = null; paint(); field.focus(); });
    box.querySelector(".edit-save").addEventListener("click", () => close(true));
  }

  // ---------- drag to reorder ----------

  let drag = null;

  list.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest(".grip");
    if (!grip || e.button !== 0 || drag || sortMode === "due") return;
    const li = grip.closest(".task");
    if (list.querySelector(".is-editing")) return;
    e.preventDefault();

    const items = [...list.children];
    const rects = items.map((el) => el.getBoundingClientRect());
    const idx = items.indexOf(li);
    drag = { li, grip, items, rects, idx, target: idx, h: rects[idx].height, startY: e.clientY, moved: false };
    grip.setPointerCapture(e.pointerId);
  });

  list.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { li, items, rects, idx, h } = drag;
    let dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dy) < 4) return;
      drag.moved = true;
      list.classList.add("is-sorting");
      li.classList.add("is-dragging");
    }
    const minDy = rects[0].top - rects[idx].top;
    const maxDy = rects[rects.length - 1].bottom - rects[idx].bottom;
    dy = Math.max(minDy, Math.min(maxDy, dy));
    li.style.transform = `translateY(${dy}px)`;

    const center = rects[idx].top + h / 2 + dy;
    let target = idx;
    for (let i = 0; i < idx; i++) {
      if (center < rects[i].top + rects[i].height / 2) { target = i; break; }
    }
    if (target === idx) {
      for (let i = items.length - 1; i > idx; i--) {
        if (center > rects[i].top + rects[i].height / 2) { target = i; break; }
      }
    }
    drag.target = target;

    items.forEach((el, i) => {
      if (i === idx) return;
      let shift = 0;
      if (target > idx && i > idx && i <= target) shift = -h;
      if (target < idx && i >= target && i < idx) shift = h;
      el.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  });

  function endDrag() {
    if (!drag) return;
    const { li, items, idx, target, moved } = drag;
    drag = null;
    list.classList.remove("is-sorting");
    li.classList.remove("is-dragging");
    items.forEach((el) => { el.style.transform = ""; });
    if (!moved || target === idx) return;
    const ids = items.map((el) => el.dataset.id);
    ids.splice(target, 0, ids.splice(idx, 1)[0]);
    reorderVisible(ids);
  }

  list.addEventListener("pointerup", endDrag);
  list.addEventListener("pointercancel", endDrag);
  list.addEventListener("lostpointercapture", endDrag);

  list.addEventListener("keydown", (e) => {
    const grip = e.target.closest(".grip");
    if (!grip) return;
    if (e.key === "ArrowUp") { e.preventDefault(); moveByKeyboard(grip.closest(".task"), -1); }
    if (e.key === "ArrowDown") { e.preventDefault(); moveByKeyboard(grip.closest(".task"), 1); }
  });

  // ---------- form deadline ----------

  const newTimeBtn = $("#new-time-btn");
  const newTimeLabel = $("#new-time-label");
  let newDue = null;
  let newTime = null;

  function setNewDue(iso, time) {
    const has = isISODate(iso);
    newDue = has ? iso : null;
    if (!has) newTime = null;
    else if (time !== undefined) newTime = isTime(time) ? time : null;
    newDueWrap.classList.toggle("has-date", has);
    newDueLabel.textContent = has ? pickerLabel(iso) : "";
    newTimeLabel.textContent = newTime || "";
    newDueClear.hidden = !has;
    newDueBtn.setAttribute("aria-label", has ? `Срок: ${pickerLabel(iso)}. Изменить` : "Выбрать срок");
    newTimeBtn.setAttribute("aria-label", newTime ? `Время: ${newTime}. Изменить` : "Выбрать время");
  }

  const formPick = (mode, anchor) => openDT({
    anchor, mode, date: newDue, time: newTime,
    onChange: (d, t) => setNewDue(d, t),
  });
  newDueBtn.addEventListener("click", () => formPick("date", newDueBtn));
  newTimeBtn.addEventListener("click", () => formPick("time", newTimeBtn));
  newDueClear.addEventListener("click", () => { setNewDue(null); input.focus(); });

  // ---------- events ----------

  input.addEventListener("input", () => {
    addBtn.disabled = input.value.trim() === "";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addTask(text.slice(0, MAX_LEN), newDue, newTime);
    input.value = "";
    setNewDue(null);
    addBtn.disabled = true;
    input.focus();
  });

  list.addEventListener("change", (e) => {
    if (!e.target.classList.contains("check-input")) return;
    toggleTask(e.target.closest(".task").dataset.id, e.target.checked);
  });

  list.addEventListener("click", (e) => {
    const li = e.target.closest(".task");
    if (!li) return;
    if (e.target.closest(".del")) removeTasks([li.dataset.id]);
    else if (e.target.closest(".edit")) startEdit(li);
    else if (e.target.closest(".due")) startEdit(li, true);
  });

  list.addEventListener("dblclick", (e) => {
    if (e.target.closest(".text")) startEdit(e.target.closest(".task"));
  });

  filterBtns.forEach((b) => b.addEventListener("click", () => setFilter(b.dataset.filter)));

  function setFilter(next) {
    filter = next;
    filterBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === next)));
    render();
  }

  clearBtn.addEventListener("click", () => {
    removeTasks(tasks.filter((t) => t.done).map((t) => t.id));
  });

  // another open tab changed the list
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && !drag && !list.querySelector(".is-editing")) { tasks = load(); render(); }
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(markMultiline, 120);
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(markMultiline);

  // deadlines like "today" change at midnight
  setInterval(() => { if (!drag && !list.querySelector(".is-editing")) render(); }, 60000);

  render();
  // first paint should not animate every saved row
  nodes.forEach((li) => li.classList.remove("is-new"));
})();
