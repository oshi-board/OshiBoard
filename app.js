
"use strict";

/* ========================================
   推しボード 公開準備版
   画面操作・全体制御
======================================== */

const $ = id => document.getElementById(id);

const DEFAULT_TYPES = ["ヨリ", "チュウ", "ヒキ"];

// ========================================
// シリーズID生成
// AndroidのHTTP接続にも対応
// ========================================

function generateSeriesId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // HTTP接続などでrandomUUIDが使えない場合
  return "series-" +
    Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2, 12);
}

let state = null;
let memberMaster = [];
let masterLoaded = false;

let selectedGroup = "";
let draftMembers = new Set();
let currentStatus = "active";

let editingSeriesId = null;
let draftSeriesTypes = [];

let currentTradeSeriesId = null;
let currentTradeMode = "want";

let currentBoardMode = "both";

// ========================================
// 共通
// ========================================

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(
    screen => screen.classList.add("hidden")
  );

  $(id).classList.remove("hidden");
  window.scrollTo(0, 0);
}

function saveState(next) {
  try {
    OshiData.save(next);
    state = next;
    return true;

  } catch (error) {
    console.error(error);
    alert(error.message);
    return false;
  }
}

function cloneState() {
  return OshiData.copy(state);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function sortedSelectedMembers() {
  const ids = new Set(
    state.members[selectedGroup] || []
  );

  return memberMaster
    .filter(member =>
      member.group === selectedGroup &&
      ids.has(member.id)
    )
    .sort((a, b) =>
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id)
    );
}

function currentSeriesList() {
  return state.series[selectedGroup] || [];
}

function findSeries(id) {
  return currentSeriesList().find(
    series => series.id === id
  ) || null;
}

// ========================================
// メンバーマスタ
// ========================================

async function loadMemberMaster() {
  try {
    const response = await fetch(
      "members.json",
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data = await response.json();

    if (!Array.isArray(data.members)) {
      throw new Error("members.jsonの形式が不正です。");
    }

    const ids = new Set();

    for (const member of data.members) {
      if (
        typeof member.id !== "string" ||
        !member.id ||
        typeof member.group !== "string" ||
        typeof member.name !== "string" ||
        !Number.isInteger(member.generation) ||
        !["active", "graduated"].includes(member.status) ||
        !Number.isFinite(member.sortOrder) ||
        ids.has(member.id)
      ) {
        throw new Error(
          "メンバーマスタに不正な項目があります。"
        );
      }

      ids.add(member.id);
    }

    memberMaster = data.members;
    masterLoaded = true;

    console.log(
      "メンバーマスタ読込成功:",
      memberMaster.length
    );

  } catch (error) {
    masterLoaded = false;
    console.error(error);

    alert(
      "メンバーマスタを読み込めませんでした。\n" +
      "members.json とLive Serverを確認してください。"
    );
  }
}

// ========================================
// グループ選択
// ========================================

document.querySelectorAll(".group").forEach(button => {
  button.addEventListener("click", () => {
    selectedGroup = button.dataset.group;

    document.querySelectorAll(".group").forEach(
      item => item.classList.toggle(
        "selected",
        item === button
      )
    );

    $("groupNext").disabled = false;
  });
});

$("groupNext").addEventListener("click", () => {
  if (!selectedGroup || !masterLoaded) {
    alert("グループまたはマスタを確認してください。");
    return;
  }

  showEditor();
});

$("changeGroup").addEventListener(
  "click",
  () => showScreen("groupScreen")
);

// ========================================
// 編集トップ
// ========================================

function showEditor() {
  $("editorGroupName").textContent = selectedGroup;

  renderSelectedMembers();
  renderSeriesList();

  showScreen("editorScreen");
}

function renderSelectedMembers() {
  const container = $("selectedMembers");
  container.replaceChildren();

  const members = sortedSelectedMembers();

  if (!members.length) {
    container.appendChild(createElement(
      "span",
      "empty-message",
      "まだメンバーが選択されていません。"
    ));
    return;
  }

  members.forEach(member => {
    container.appendChild(createElement(
      "span",
      "member-chip",
      member.name
    ));
  });
}

// ========================================
// メンバー選択
// ========================================

$("openMembers").addEventListener("click", () => {
  draftMembers = new Set(
    state.members[selectedGroup] || []
  );

  currentStatus = "active";
  $("memberGroupName").textContent = selectedGroup;
  $("memberSearch").value = "";

  updateStatusTabs();
  updateGenerationFilter();
  renderMemberList();

  showScreen("memberScreen");
});

function updateStatusTabs() {
  $("activeTab").classList.toggle(
    "active",
    currentStatus === "active"
  );

  $("graduatedTab").classList.toggle(
    "active",
    currentStatus === "graduated"
  );
}

function changeStatus(status) {
  currentStatus = status;

  updateStatusTabs();
  updateGenerationFilter();
  renderMemberList();
}

$("activeTab").addEventListener(
  "click",
  () => changeStatus("active")
);

$("graduatedTab").addEventListener(
  "click",
  () => changeStatus("graduated")
);

function updateGenerationFilter() {
  const select = $("generationFilter");
  select.replaceChildren();

  const all = new Option("すべての期", "all");
  select.appendChild(all);

  const generations = [
    ...new Set(
      memberMaster
        .filter(member =>
          member.group === selectedGroup &&
          member.status === currentStatus
        )
        .map(member => member.generation)
    )
  ].sort((a, b) => a - b);

  generations.forEach(generation => {
    select.appendChild(
      new Option(
        generation + "期",
        String(generation)
      )
    );
  });

  select.value = "all";
}

function filteredMembers() {
  const search = $("memberSearch")
    .value.trim().toLowerCase();

  const generation = $("generationFilter").value;

  return memberMaster
    .filter(member =>
      member.group === selectedGroup &&
      member.status === currentStatus
    )
    .filter(member =>
      generation === "all" ||
      String(member.generation) === generation
    )
    .filter(member =>
      member.name.toLowerCase().includes(search)
    )
    .sort((a, b) =>
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id)
    );
}

function renderMemberList() {
  const container = $("memberList");
  container.replaceChildren();

  const members = filteredMembers();

  if (!members.length) {
    const empty = createElement(
      "p",
      "empty-message",
      "該当するメンバーがいません。"
    );

    empty.style.padding = "15px";
    container.appendChild(empty);
  }

  members.forEach(member => {
    const row = createElement("label", "member-row");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draftMembers.has(member.id);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        draftMembers.add(member.id);
      } else {
        draftMembers.delete(member.id);
      }

      updateSelectionCount();
    });

    row.append(
      checkbox,
      createElement(
        "span",
        "",
        member.name + "（" +
          member.generation + "期）"
      )
    );

    container.appendChild(row);
  });

  updateSelectionCount();
}

function updateSelectionCount() {
  $("selectionCount").textContent =
    draftMembers.size + "人選択中";
}

$("generationFilter").addEventListener(
  "change",
  renderMemberList
);

$("memberSearch").addEventListener(
  "input",
  renderMemberList
);

$("selectAll").addEventListener("click", () => {
  filteredMembers().forEach(member =>
    draftMembers.add(member.id)
  );

  renderMemberList();
});

$("clearAll").addEventListener("click", () => {
  draftMembers.clear();
  renderMemberList();
});

$("cancelMembers").addEventListener(
  "click",
  showEditor
);

$("confirmMembers").addEventListener("click", () => {
  const next = cloneState();

  next.members[selectedGroup] = memberMaster
    .filter(member =>
      member.group === selectedGroup &&
      draftMembers.has(member.id)
    )
    .map(member => member.id);

  if (saveState(next)) {
    showEditor();
  }
});

// ========================================
// シリーズ一覧
// ========================================

function renderSeriesList() {
  const container = $("seriesList");
  container.replaceChildren();

  const list = currentSeriesList();

  if (!list.length) {
    container.appendChild(createElement(
      "p",
      "empty-message",
      "まだシリーズが登録されていません。"
    ));
    return;
  }

  list.forEach(series => {
    const card = createElement("div", "series-card");

    const title = createElement(
      "div",
      "series-card-title",
      series.name
    );

    const types = createElement(
      "div",
      "series-card-types",
      "種類：" + series.types.join("・")
    );

    const actions = createElement(
      "div",
      "series-card-actions"
    );

    const edit = createElement("button", "", "編集");
    edit.type = "button";
    edit.addEventListener(
      "click",
      () => openSeriesEditor(series.id)
    );

    const remove = createElement(
      "button",
      "delete-button",
      "削除"
    );
    remove.type = "button";
    remove.addEventListener(
      "click",
      () => deleteSeries(series.id)
    );

    actions.append(edit, remove);

    const trade = createElement(
      "button",
      "trade-open-button",
      "求・譲を登録"
    );

    trade.type = "button";
    trade.addEventListener(
      "click",
      () => openTradeEditor(series.id)
    );

    card.append(title, types, actions, trade);
    container.appendChild(card);
  });
}

// ========================================
// シリーズ編集
// ========================================

function openSeriesEditor(id = null) {
  editingSeriesId = id;

  const series = id ? findSeries(id) : null;

  $("seriesScreenTitle").textContent =
    series ? "シリーズ編集" : "シリーズ登録";

  $("seriesGroupName").textContent = selectedGroup;
  $("seriesName").value = series ? series.name : "";
  $("newTypeName").value = "";

  draftSeriesTypes = series
    ? [...series.types]
    : [...DEFAULT_TYPES];

  renderSeriesTypes();
  showScreen("seriesScreen");
}

function renderSeriesTypes() {
  const container = $("seriesTypes");
  container.replaceChildren();

  draftSeriesTypes.forEach(type => {
    const chip = createElement("span", "type-chip");

    const label = createElement("span", "", type);
    const remove = createElement("button", "", "×");

    remove.type = "button";
    remove.setAttribute(
      "aria-label",
      type + "を削除"
    );

    remove.addEventListener("click", () => {
      draftSeriesTypes = draftSeriesTypes.filter(
        item => item !== type
      );

      renderSeriesTypes();
    });

    chip.append(label, remove);
    container.appendChild(chip);
  });
}

function addSeriesType() {
  const input = $("newTypeName");
  const value = input.value.trim();

  if (!value) return;

  if (draftSeriesTypes.includes(value)) {
    alert("同じ種類がすでにあります。");
    return;
  }

  draftSeriesTypes.push(value);
  input.value = "";

  renderSeriesTypes();
}

$("addSeries").addEventListener(
  "click",
  () => openSeriesEditor()
);

$("addType").addEventListener(
  "click",
  addSeriesType
);

$("newTypeName").addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSeriesType();
    }
  }
);

$("cancelSeries").addEventListener(
  "click",
  showEditor
);

function cleanRemovedTypes(trades, id, removedTypes) {
  const entry = trades[id];
  if (!entry) return;

  for (const mode of ["want", "offer"]) {
    const members = entry[mode] || {};

    for (const memberId of Object.keys(members)) {
      members[memberId] = members[memberId].filter(
        type => !removedTypes.includes(type)
      );

      if (!members[memberId].length) {
        delete members[memberId];
      }
    }
  }
}

$("saveSeries").addEventListener("click", () => {
  const name = $("seriesName").value.trim();

  if (!name) {
    alert("シリーズ名を入力してください。");
    return;
  }

  if (!draftSeriesTypes.length) {
    alert("種類を1つ以上登録してください。");
    return;
  }

  if (currentSeriesList().some(series =>
    series.name === name &&
    series.id !== editingSeriesId
  )) {
    alert("同じ名前のシリーズがすでにあります。");
    return;
  }

  const next = cloneState();

  if (!next.series[selectedGroup]) {
    next.series[selectedGroup] = [];
  }

  const list = next.series[selectedGroup];

  if (editingSeriesId) {
    const series = list.find(
      item => item.id === editingSeriesId
    );

    if (!series) {
      alert("編集対象が見つかりません。");
      return;
    }

    const removedTypes = series.types.filter(
      type => !draftSeriesTypes.includes(type)
    );

    if (removedTypes.length) {
      const ok = confirm(
        "次の種類を削除します。\n\n" +
        removedTypes.join("・") +
        "\n\n関連する求・譲も削除されます。\n" +
        "続行しますか？"
      );

      if (!ok) return;

      cleanRemovedTypes(
        next.trades,
        editingSeriesId,
        removedTypes
      );
    }

    series.name = name;
    series.types = [...draftSeriesTypes];

  } else {
    next.series[selectedGroup].push({
      id: generateSeriesId(),
      name,
      types: [...draftSeriesTypes]
    });
  }

  if (saveState(next)) {
    showEditor();
  }
});

function deleteSeries(id) {
  const series = findSeries(id);
  if (!series) return;

  const ok = confirm(
    "「" + series.name + "」を削除しますか？\n" +
    "関連する求・譲も削除されます。"
  );

  if (!ok) return;

  const next = cloneState();

  next.series[selectedGroup] =
    next.series[selectedGroup].filter(
      item => item.id !== id
    );

  delete next.trades[id];

  if (saveState(next)) {
    renderSeriesList();
  }
}

// ========================================
// 求・譲登録
// ========================================

function getTradeTypes(seriesId, mode, memberId) {
  return state.trades[seriesId]?.[mode]?.[memberId] || [];
}

function openTradeEditor(id) {
  const series = findSeries(id);

  if (!series) {
    alert("シリーズが見つかりません。");
    return;
  }

  currentTradeSeriesId = id;
  currentTradeMode = "want";

  $("tradeSeriesName").textContent =
    selectedGroup + "｜" + series.name;

  updateTradeTabs();
  renderTradeMemberList();

  showScreen("tradeScreen");
}

function updateTradeTabs() {
  $("wantTab").classList.toggle(
    "active",
    currentTradeMode === "want"
  );

  $("offerTab").classList.toggle(
    "active",
    currentTradeMode === "offer"
  );
}

function changeTradeMode(mode) {
  currentTradeMode = mode;
  updateTradeTabs();
  renderTradeMemberList();
}

$("wantTab").addEventListener(
  "click",
  () => changeTradeMode("want")
);

$("offerTab").addEventListener(
  "click",
  () => changeTradeMode("offer")
);

$("backFromTrade").addEventListener(
  "click",
  () => {
    currentTradeSeriesId = null;
    showEditor();
  }
);

function updateTradeCheck(memberId, type, checked) {
  const series = findSeries(currentTradeSeriesId);

  if (!series || !series.types.includes(type)) {
    return false;
  }

  const next = cloneState();

  if (!next.trades[series.id]) {
    next.trades[series.id] = {
      want: {},
      offer: {}
    };
  }

  const members = next.trades[
    series.id
  ][currentTradeMode];

  const current = members[memberId] || [];

  if (checked) {
    members[memberId] = [
      ...new Set([...current, type])
    ];
  } else {
    const remaining = current.filter(
      item => item !== type
    );

    if (remaining.length) {
      members[memberId] = remaining;
    } else {
      delete members[memberId];
    }
  }

  return saveState(next);
}

function updateTradeCount() {
  const series = findSeries(currentTradeSeriesId);
  if (!series) return;

  let count = 0;

  for (const member of sortedSelectedMembers()) {
    count += getTradeTypes(
      series.id,
      currentTradeMode,
      member.id
    ).filter(type =>
      series.types.includes(type)
    ).length;
  }

  $("tradeSelectionCount").textContent =
    (currentTradeMode === "want" ? "求" : "譲") +
    "：" + count + "件登録中";
}

function renderTradeMemberList() {
  const container = $("tradeMemberList");
  container.replaceChildren();

  const series = findSeries(currentTradeSeriesId);
  if (!series) return;

  const members = sortedSelectedMembers();

  if (!members.length) {
    container.appendChild(createElement(
      "p",
      "trade-empty-message",
      "先にメンバーを選択してください。"
    ));
  }

  members.forEach(member => {
    const card = createElement(
      "div",
      "trade-member-card"
    );

    const name = createElement(
      "div",
      "trade-member-name",
      member.name + "（" +
        member.generation + "期）"
    );

    const typeList = createElement(
      "div",
      "trade-type-list"
    );

    series.types.forEach(type => {
      const label = createElement(
        "label",
        "trade-type-label"
      );

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";

      checkbox.checked = getTradeTypes(
        series.id,
        currentTradeMode,
        member.id
      ).includes(type);

      checkbox.addEventListener("change", () => {
        const success = updateTradeCheck(
          member.id,
          type,
          checkbox.checked
        );

        if (!success) {
          checkbox.checked = !checkbox.checked;
        } else {
          updateTradeCount();
        }
      });

      label.append(
        checkbox,
        createElement("span", "", type)
      );

      typeList.appendChild(label);
    });

    card.append(name, typeList);
    container.appendChild(card);
  });

  updateTradeCount();
}

// ========================================
// 交換ボード
// ========================================

$("openBoard").addEventListener("click", () => {
  currentBoardMode = "both";

  $("boardGroupName").textContent =
    selectedGroup + "｜交換ボード";

  updateBoardModeButtons();
  applyBoardSettings();
  renderBoard();

  showScreen("boardScreen");
});

$("backFromBoard").addEventListener(
  "click",
  async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.error(error);
      }
    }

    document.body.classList.remove(
      "board-fullscreen"
    );

    showEditor();
  }
);

document.querySelectorAll(".board-mode").forEach(
  button => {
    button.addEventListener("click", () => {
      currentBoardMode = button.dataset.mode;
      updateBoardModeButtons();
      renderBoard();
    });
  }
);

function updateBoardModeButtons() {
  document.querySelectorAll(".board-mode").forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.mode === currentBoardMode
      );
    }
  );
}

function boardEntries(mode) {
  const result = [];
  const members = sortedSelectedMembers();

  for (const series of currentSeriesList()) {
    const lines = [];

    for (const member of members) {
      const registered = getTradeTypes(
        series.id,
        mode,
        member.id
      );

      const types = series.types.filter(
        type => registered.includes(type)
      );

      if (types.length) {
        lines.push({
          name: member.name,
          types
        });
      }
    }

    if (lines.length) {
      result.push({
        name: series.name,
        lines
      });
    }
  }

  return result;
}

function renderBoardPanel(mode, containerId) {
  const container = $(containerId);
  container.replaceChildren();

  const entries = boardEntries(mode);

  if (!entries.length) {
    container.appendChild(createElement(
      "p",
      "board-empty",
      "登録されている生写真はありません。"
    ));
    return;
  }

  entries.forEach(series => {
    const section = createElement(
      "div",
      "board-series"
    );

    section.appendChild(createElement(
      "div",
      "board-series-name",
      series.name
    ));

    series.lines.forEach(member => {
      section.appendChild(createElement(
        "div",
        "board-member-line",
        member.name + "　" +
          member.types.join("・")
      ));
    });

    container.appendChild(section);
  });
}

function renderBoard() {
  const showWant =
    currentBoardMode !== "offer";

  const showOffer =
    currentBoardMode !== "want";

  $("wantBoard").hidden = !showWant;
  $("offerBoard").hidden = !showOffer;

  $("boardLayout").classList.toggle(
    "single-mode",
    currentBoardMode !== "both"
  );

  if (showWant) {
    renderBoardPanel(
      "want",
      "wantBoardContent"
    );
  }

  if (showOffer) {
    renderBoardPanel(
      "offer",
      "offerBoardContent"
    );
  }
}

// ========================================
// 文字サイズ
// ========================================

function applyBoardSettings() {
  const size = state.settings.fontSize || "medium";

  $("boardFontSize").value = size;

  $("boardLayout").classList.remove(
    "font-small",
    "font-medium",
    "font-large",
    "font-xlarge"
  );

  $("boardLayout").classList.add(
    "font-" + size
  );
}

$("boardFontSize").addEventListener(
  "change",
  () => {
    const next = cloneState();
    next.settings.fontSize =
      $("boardFontSize").value;

    if (saveState(next)) {
      applyBoardSettings();
    } else {
      $("boardFontSize").value =
        state.settings.fontSize || "medium";
    }
  }
);

// ========================================
// 全画面表示
// ========================================

function updateFullscreenButton() {
  const active =
    document.fullscreenElement !== null ||
    document.body.classList.contains(
      "board-fullscreen"
    );

  $("toggleFullscreen").textContent =
    active ? "全画面を終了" : "全画面表示";
}

$("toggleFullscreen").addEventListener(
  "click",
  async () => {
    const screen = $("boardScreen");

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.error(error);
      }

      document.body.classList.remove(
        "board-fullscreen"
      );

    } else if (document.body.classList.contains(
      "board-fullscreen"
    )) {
      document.body.classList.remove(
        "board-fullscreen"
      );

    } else {
      document.body.classList.add(
        "board-fullscreen"
      );

      // 対応ブラウザでは本当の全画面へ
      if (screen.requestFullscreen) {
        try {
          await screen.requestFullscreen();
        } catch (error) {
          // 非対応環境では画面内の拡大表示を維持
          console.log(
            "ブラウザ全画面は利用できません。",
            error
          );
        }
      }
    }

    updateFullscreenButton();
  }
);

document.addEventListener(
  "fullscreenchange",
  () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove(
        "board-fullscreen"
      );
    }

    updateFullscreenButton();
  }
);

// ========================================
// PWA
// ========================================

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // localhost または HTTPS でのみ登録
  if (
    location.protocol !== "https:" &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => {
        console.log("PWA準備完了");
      })
      .catch(error => {
        console.warn(
          "Service Worker登録失敗:",
          error
        );
      });
  });
}

// ========================================
// 起動
// ========================================

async function initializeApp() {
  try {
    state = OshiData.load();

  } catch (error) {
    console.error(error);

    alert(
      "保存データを読み込めませんでした。\n" +
      "既存データを保護するため、操作を停止します。\n\n" +
      error.message
    );

    document.querySelectorAll("button").forEach(
      button => button.disabled = true
    );

    return;
  }

  await loadMemberMaster();
  registerServiceWorker();
}

initializeApp();
