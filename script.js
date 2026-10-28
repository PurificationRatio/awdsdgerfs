(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const presets = {
    easy: { rows: 9, cols: 9, mines: 10, label: "Лёгкая" },
    medium: { rows: 16, cols: 16, mines: 40, label: "Средняя" },
    hard: { rows: 16, cols: 30, mines: 99, label: "Сложная" }
  };
  let difficulty = $("difficulty").value;
  let rows, cols, mineTotal, cells, started, ended, flags, opened, seconds, timerId, firstMove;
  let touchTimer = null, longPressTriggered = false;

  function initGame() {
    clearInterval(timerId);
    difficulty = $("difficulty").value;
    ({ rows, cols, mines: mineTotal } = presets[difficulty]);
    cells = Array.from({ length: rows * cols }, () => ({
      mine: false, adjacent: 0, opened: false, flagged: false
    }));
    started = false; ended = false; firstMove = true; flags = 0; opened = 0; seconds = 0;
    $("timer").textContent = "000";
    $("mineCount").textContent = String(mineTotal).padStart(3, "0");
    $("restartBtn").textContent = "🙂";
    $("message").textContent = "Нажми на любую клетку, чтобы начать.";
    $("modal").classList.add("hidden");
    renderBoard();
  }

  function neighbors(index) {
    const r = Math.floor(index / cols), c = index % cols, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
    return out;
  }

  function plantMines(safeIndex) {
    const forbidden = new Set([safeIndex, ...neighbors(safeIndex)]);
    const available = cells.map((_, i) => i).filter(i => !forbidden.has(i));
    // Fisher–Yates shuffle; the first move and its neighbors are always safe.
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    for (const i of available.slice(0, mineTotal)) cells[i].mine = true;
    cells.forEach((cell, i) => {
      if (!cell.mine) cell.adjacent = neighbors(i).filter(n => cells[n].mine).length;
    });
  }

  function startTimer() {
    if (started) return;
    started = true;
    timerId = setInterval(() => {
      if (!ended && seconds < 999) {
        seconds++;
        $("timer").textContent = String(seconds).padStart(3, "0");
      }
    }, 1000);
  }

  function renderBoard() {
    const board = $("board");
    board.innerHTML = "";
    board.style.gridTemplateColumns = `repeat(${cols}, max-content)`;
    cells.forEach((cell, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `Строка ${Math.floor(i / cols) + 1}, столбец ${i % cols + 1}`);
      if (cell.opened) {
        button.classList.add("opened");
        if (cell.mine) {
          button.textContent = "💣";
          if (cell.hit) button.classList.add("mine-hit");
        } else if (cell.adjacent) {
          button.textContent = cell.adjacent;
          button.classList.add(`n${Math.min(cell.adjacent, 4)}`);
        }
      } else if (cell.flagged) {
        button.textContent = "🚩";
        button.classList.add("flagged");
      }
      button.disabled = ended || (cell.opened && !cell.mine);
      button.addEventListener("click", () => {
        if (longPressTriggered) { longPressTriggered = false; return; }
        openCell(i);
      });
      button.addEventListener("contextmenu", e => {
        e.preventDefault();
        toggleFlag(i);
      });
      button.addEventListener("touchstart", () => {
        longPressTriggered = false;
        touchTimer = setTimeout(() => {
          longPressTriggered = true;
          toggleFlag(i);
        }, 420);
      }, { passive: true });
      button.addEventListener("touchend", () => clearTimeout(touchTimer), { passive: true });
      button.addEventListener("touchmove", () => clearTimeout(touchTimer), { passive: true });
      board.appendChild(button);
    });
  }

  function openCell(index) {
    const cell = cells[index];
    if (ended || cell.opened || cell.flagged) return;
    if (firstMove) {
      plantMines(index);
      firstMove = false;
    }
    startTimer();
    cell.opened = true;
    opened++;
    if (cell.mine) {
      cell.hit = true;
      loseGame();
      return;
    }
    if (cell.adjacent === 0) {
      const queue = [index], seen = new Set([index]);
      while (queue.length) {
        const current = queue.shift();
        for (const n of neighbors(current)) {
          if (seen.has(n) || cells[n].flagged || cells[n].opened) continue;
          seen.add(n);
          cells[n].opened = true;
          opened++;
          if (!cells[n].mine && cells[n].adjacent === 0) queue.push(n);
        }
      }
    }
    renderBoard();
    if (opened >= cells.length - mineTotal) winGame();
  }

  function toggleFlag(index) {
    if (ended || cells[index].opened) return;
    cells[index].flagged = !cells[index].flagged;
    flags += cells[index].flagged ? 1 : -1;
    $("mineCount").textContent = String(Math.max(0, mineTotal - flags)).padStart(3, "0");
    renderBoard();
    $("message").textContent = flags === mineTotal ? "Все флажки расставлены? Проверь их и открой оставшиеся клетки!" : "Отмечено флажков: " + flags;
  }

  function loseGame() {
    ended = true;
    clearInterval(timerId);
    cells.forEach(c => { if (c.mine) c.opened = true; });
    $("restartBtn").textContent = "😵";
    $("message").textContent = "Бум! Попробуй ещё раз.";
    renderBoard();
    showModal("💥", "Упс, мина!", `Ты продержался ${seconds} сек. Не сдавайся — следующая попытка может быть удачной.`);
  }

  function winGame() {
    ended = true;
    clearInterval(timerId);
    $("restartBtn").textContent = "😎";
    $("message").textContent = `Победа! Все безопасные клетки открыты за ${seconds} сек.`;
    // Automatically flag remaining mines to make the win state clear.
    cells.forEach(c => { if (c.mine) c.flagged = true; });
    flags = mineTotal;
    $("mineCount").textContent = "000";
    saveRecord();
    renderBoard();
    showModal("🏆", "Победа!", `Поле очищено за ${seconds} секунд. Отличная работа!`);
  }

  function showModal(emoji, title, message) {
    $("modalEmoji").textContent = emoji;
    $("modalTitle").textContent = title;
    $("modalText").textContent = message;
    $("modal").classList.remove("hidden");
  }

  function saveRecord() {
    const key = `minesweeper_record_${difficulty}`;
    const previous = Number(localStorage.getItem(key));
    if (!previous || seconds < previous) localStorage.setItem(key, String(seconds));
    renderRecords();
  }

  function renderRecords() {
    Object.keys(presets).forEach(key => {
      const value = localStorage.getItem(`minesweeper_record_${key}`);
      $(`record-${key}`).textContent = value === null ? "—" : `${value} сек`;
    });
  }

  $("newGameBtn").addEventListener("click", initGame);
  $("restartBtn").addEventListener("click", initGame);
  $("difficulty").addEventListener("change", initGame);
  $("modalNewGame").addEventListener("click", initGame);
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) $("modal").classList.add("hidden"); });
  $("resetRecordsBtn").addEventListener("click", () => {
    if (confirm("Точно сбросить все рекорды?")) {
      Object.keys(presets).forEach(key => localStorage.removeItem(`minesweeper_record_${key}`));
      renderRecords();
    }
  });
  $("themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀" : "☾";
    localStorage.setItem("minesweeper_theme", document.body.classList.contains("dark") ? "dark" : "light");
  });

  if (localStorage.getItem("minesweeper_theme") === "dark") {
    document.body.classList.add("dark");
    $("themeBtn").textContent = "☀";
  }
  renderRecords();
  initGame();
})();
