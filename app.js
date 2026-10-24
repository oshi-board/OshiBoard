
"use strict";

/* ========================================
   推しボード
   画面操作・全体制御
======================================== */

const $ = id => document.getElementById(id);

const DEFAULT_TYPES = ["ヨリ", "チュウ", "ヒキ"];

// ========================================
// ID生成
// ========================================

function generateSeriesId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "series-" +
    Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2, 12);
}

let state = null;
let memberMaster = [];
let masterLoaded = false;

let selectedGroup = "";
let draftMembers = new Set();
let editingMemberId = null;
let memberDefaults = [];

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

function normalizeMember(member) {
  return {
    id: member.id,
    group: member.group,
    name: member.name,
    generation: member.generation,
    sortOrder: member.sortOrder
  };
}

function rebuildMemberMaster(defaults = memberDefaults) {
  const c = state.memberCustomizations;
  const byId = new Map();

  for (const m of c.cachedDefaults) {
    byId.set(m.id, { ...m });
  }

  for (const m of defaults) {
    byId.set(m.id, { ...m });
  }

  for (const m of c.added) {
    if (byId.has(m.id)) {
      throw new Error("メンバーIDが重複しています。");
    }
    byId.set(m.id, { ...m });
  }

  memberMaster = [...byId.values()].map(m => ({
    ...m,
    ...(c.edits[m.id] || {})
  }));
}

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
      throw new Error("マスタ形式が不正です。");
    }

    const ids = new Set();

    for (const m of data.members) {
      if (
        !m ||
        typeof m.id !== "string" ||
        !m.id ||
        ![
          "乃木坂46",
          "櫻坂46",
          "日向坂46"
        ].includes(m.group) ||
        typeof m.name !== "string" ||
        !m.name.trim() ||
        !Number.isInteger(m.generation) ||
        m.generation < 1 ||
        m.generation > 99 ||
        !Number.isFinite(m.sortOrder) ||
        ids.has(m.id)
      ) {
        throw new Error(
          "メンバーマスタに不正な項目があります。"
        );
      }

      ids.add(m.id);
    }

    memberDefaults = data.members.map(normalizeMember);

    const next = cloneState();

    const history = new Map(
      next.memberCustomizations.cachedDefaults.map(
        m => [m.id, m]
      )
    );

    for (const m of memberDefaults) {
      history.set(m.id, m);
    }

    next.memberCustomizations.cachedDefaults =
      [...history.values()];

    if (!saveState(next)) {
      throw new Error(
        "メンバー履歴を保存できませんでした。"
      );
    }

    rebuildMemberMaster();
    masterLoaded = true;

  } catch (error) {
    console.error(error);

    if (
      state.memberCustomizations.cachedDefaults.length ||
      state.memberCustomizations.added.length
    ) {
      try {
        memberDefaults = [];
        rebuildMemberMaster();
        masterLoaded = true;
        return;
      } catch (inner) {
        console.error(inner);
      }
    }

    masterLoaded = false;

    alert(
      "メンバーマスタを読み込めませんでした。\n" +
      error.message
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
    alert(
      "グループまたはマスタを確認してください。"
    );
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

function isHidden(id) {
  return state.memberCustomizations.hidden.includes(id);
}

function visibleSelectionMembers() {
  const selected = new Set(
    state.members[selectedGroup] || []
  );

  return memberMaster.filter(m =>
    m.group === selectedGroup &&
    (!isHidden(m.id) || selected.has(m.id))
  );
}

function fillGenerationFilter(
  id,
  members,
  preserve = false
) {
  const el = $(id);
  const old = preserve ? el.value : "all";

  el.replaceChildren(
    new Option("すべての期", "all")
  );

  [...new Set(
    members.map(m => m.generation)
  )]
    .sort((a, b) => a - b)
    .forEach(g => {
      el.appendChild(
        new Option(g + "期", String(g))
      );
    });

  el.value = [...el.options].some(
    o => o.value === old
  ) ? old : "all";
}

function openMemberSelector() {
  $("memberGroupName").textContent = selectedGroup;
  $("memberSearch").value = "";

  fillGenerationFilter(
    "generationFilter",
    visibleSelectionMembers()
  );

  renderMemberList();
  showScreen("memberScreen");
}

$("openMembers").addEventListener("click", () => {
  draftMembers = new Set(
    state.members[selectedGroup] || []
  );

  openMemberSelector();
});

function filteredMembers() {
  const search = $("memberSearch")
    .value.trim().toLowerCase();

  const gen = $("generationFilter").value;

  return visibleSelectionMembers()
    .filter(m =>
      gen === "all" ||
      String(m.generation) === gen
    )
    .filter(m =>
      m.name.toLowerCase().includes(search)
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
    container.appendChild(createElement(
      "p",
      "empty-message",
      "該当するメンバーがいません。"
    ));
  }

  members.forEach(member => {
    const row = createElement(
      "label",
      "member-row"
    );

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = draftMembers.has(member.id);

    check.addEventListener("change", () => {
      if (check.checked) {
        draftMembers.add(member.id);
      } else {
        draftMembers.delete(member.id);
      }

      updateSelectionCount();
    });

    row.append(
      check,
      createElement(
        "span",
        "",
        member.name +
          "（" + member.generation + "期）"
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
  filteredMembers().forEach(
    m => draftMembers.add(m.id)
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

  next.members[selectedGroup] = [...draftMembers];

  if (saveState(next)) {
    showEditor();
  }
});

// ========================================
// メンバー管理
// ========================================

function groupMembers() {
  return memberMaster
    .filter(m => m.group === selectedGroup)
    .sort((a, b) =>
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id)
    );
}

function openMemberManager(preserve = false) {
  $("managerGroupName").textContent = selectedGroup;

  if (!preserve) {
    $("managerSearch").value = "";
    $("managerShowHidden").checked = false;
  }

  fillGenerationFilter(
    "managerGenerationFilter",
    groupMembers(),
    preserve
  );

  renderManagerList();
  showScreen("memberManagerScreen");
}

$("openMemberManager").addEventListener(
  "click",
  () => openMemberManager()
);

$("backFromMemberManager").addEventListener(
  "click",
  () => {
    fillGenerationFilter(
      "generationFilter",
      visibleSelectionMembers(),
      true
    );

    renderMemberList();
    showScreen("memberScreen");
  }
);

/* ========================================
   メンバー管理一覧
======================================== */

function filteredManagerMembers() {
  const search = $("managerSearch")
    .value.trim().toLowerCase();

  const generation =
    $("managerGenerationFilter").value;

  const showHidden =
    $("managerShowHidden").checked;

  return groupMembers()
    .filter(member =>
      showHidden || !isHidden(member.id)
    )
    .filter(member =>
      generation === "all" ||
      String(member.generation) === generation
    )
    .filter(member =>
      member.name.toLowerCase().includes(search)
    );
}

function renderManagerList() {
  const container = $("managerMemberList");
  container.replaceChildren();

  const members = filteredManagerMembers();

  if (!members.length) {
    container.appendChild(createElement(
      "p",
      "empty-message",
      "該当するメンバーがいません。"
    ));
    return;
  }

  members.forEach(member => {
    const hidden = isHidden(member.id);

    const card = createElement(
      "div",
      "manager-member-card" +
        (hidden ? " is-hidden" : "")
    );

    const info = createElement(
      "div",
      "manager-member-info"
    );

    const name = createElement(
      "span",
      "manager-member-name",
      member.name
    );

    const generation = createElement(
      "span",
      "manager-member-generation",
      member.generation + "期"
    );

    info.append(name, generation);

    if (hidden) {
      info.appendChild(createElement(
        "span",
        "manager-hidden-label",
        "非表示"
      ));
    }

    const actions = createElement(
      "div",
      "manager-member-actions"
    );

    const editButton = createElement(
      "button",
      "",
      "編集"
    );

    editButton.type = "button";

    editButton.addEventListener("click", () => {
      openMemberEdit(member.id);
    });

    const visibilityButton = createElement(
      "button",
      hidden ? "show-button" : "hide-button",
      hidden ? "再表示" : "非表示"
    );

    visibilityButton.type = "button";

    visibilityButton.addEventListener(
      "click",
      () => toggleMemberVisibility(member.id)
    );

   
actions.append(
  editButton,
  visibilityButton
);

// 自分で追加したメンバーだけ削除ボタンを表示
const isCustomMember =
  state.memberCustomizations.added.some(
    item => item.id === member.id
  );

if (isCustomMember) {
  const deleteButton = createElement(
    "button",
    "hide-button",
    "削除"
  );

  deleteButton.type = "button";

  deleteButton.addEventListener("click", () => {
    deleteCustomMember(member.id);
  });

  actions.appendChild(deleteButton);
}


    card.append(info, actions);
    container.appendChild(card);
  });
}

$("managerGenerationFilter").addEventListener(
  "change",
  renderManagerList
);

$("managerSearch").addEventListener(
  "input",
  renderManagerList
);

$("managerShowHidden").addEventListener(
  "change",
  renderManagerList
);

// ========================================
// メンバーID生成
// ========================================

function generateMemberId() {
  let id;

  do {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      id = "CUSTOM-" + crypto.randomUUID();
    } else {
      id = "CUSTOM-" +
        Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2, 12);
    }
  } while (
    memberMaster.some(member => member.id === id)
  );

  return id;
}

// ========================================
// メンバー追加・編集
// ========================================

function openMemberEdit(id = null) {
  editingMemberId = id;

  const member = id
    ? memberMaster.find(item => item.id === id)
    : null;

  if (id && !member) {
    alert("対象のメンバーが見つかりません。");
    return;
  }

  $("memberEditTitle").textContent =
    member ? "メンバー編集" : "メンバー追加";

  $("memberEditGroupName").textContent =
    selectedGroup;

  $("editMemberName").value =
    member ? member.name : "";

  $("editMemberGeneration").value =
    member ? String(member.generation) : "";

  showScreen("memberEditScreen");
}

$("addCustomMember").addEventListener(
  "click",
  () => openMemberEdit()
);

$("cancelMemberEdit").addEventListener(
  "click",
  () => openMemberManager(true)
);

$("saveMemberEdit").addEventListener(
  "click",
  () => {
    const name =
      $("editMemberName").value.trim();

    const generationText =
      $("editMemberGeneration").value.trim();

    const generation = Number(generationText);

    if (!name || name.length > 100) {
      alert("メンバー名を入力してください。");
      return;
    }

    if (
      !generationText ||
      !Number.isInteger(generation) ||
      generation < 1 ||
      generation > 99
    ) {
      alert("期は1～99の整数で入力してください。");
      return;
    }

    const duplicate = memberMaster.find(member =>
      member.group === selectedGroup &&
      member.id !== editingMemberId &&
      member.name === name
    );

    if (duplicate) {
      alert(
        "同じグループに同名のメンバーがいます。\n" +
        "既存メンバーを編集してください。"
      );
      return;
    }

    const next = cloneState();
    const custom = next.memberCustomizations;

    if (editingMemberId) {
      const original = memberMaster.find(
        member => member.id === editingMemberId
      );

      if (!original) {
        alert("対象メンバーが見つかりません。");
        return;
      }

      const added = custom.added.find(
        member => member.id === editingMemberId
      );

      if (added) {
        added.name = name;
        added.generation = generation;
      } else {
        custom.edits[editingMemberId] = {
          name,
          generation
        };
      }

    } else {
      const maxSort = groupMembers().reduce(
        (max, member) =>
          Math.max(max, member.sortOrder),
        0
      );

      custom.added.push({
        id: generateMemberId(),
        group: selectedGroup,
        name,
        generation,
        sortOrder: maxSort + 1
      });
    }

    if (!saveState(next)) return;

    try {
      rebuildMemberMaster();
    } catch (error) {
      console.error(error);
      alert(
        "メンバー一覧の更新に失敗しました。\n" +
        error.message
      );
      return;
    }

    editingMemberId = null;
    openMemberManager(true);
  }
);

// ========================================
// 非表示・再表示
// ========================================

function toggleMemberVisibility(id) {
  const member = memberMaster.find(
    item => item.id === id
  );

  if (!member) return;

  const hidden = isHidden(id);

  if (!hidden) {
    const ok = confirm(
      member.name + "を非表示にしますか？\n\n" +
      "登録済みのメンバー選択や求・譲データは" +
      "削除されません。"
    );

    if (!ok) return;
  }

  const next = cloneState();

  if (hidden) {
    next.memberCustomizations.hidden =
      next.memberCustomizations.hidden.filter(
        memberId => memberId !== id
      );
  } else {
    next.memberCustomizations.hidden.push(id);
  }

  if (!saveState(next)) return;

  renderManagerList();
}

/* ========================================
   追加メンバー削除
   求・譲データ保護版
======================================== */

function deleteCustomMember(id) {
  const member = memberMaster.find(
    item => item.id === id
  );

  if (!member) {
    alert("対象メンバーが見つかりません。");
    return;
  }

  // 初期登録メンバーは削除不可
  const isCustomMember =
    state.memberCustomizations.added.some(
      item => item.id === id
    );

  if (!isCustomMember) {
    alert(
      "初期登録メンバーは削除できません。\n" +
      "非表示機能をご利用ください。"
    );
    return;
  }

  // 全シリーズの求・譲を確認
  // 過去のシリーズも含めて検査
  for (const [seriesId, trade] of
    Object.entries(state.trades)) {

    for (const mode of ["want", "offer"]) {
      const types = trade?.[mode]?.[id];

      if (Array.isArray(types) && types.length > 0) {
        alert(
          "このメンバーには求・譲データが" +
          "登録されています。\n\n" +
          "データ保護のため削除できません。\n" +
          "先に求・譲の登録を解除してください。"
        );
        return;
      }
    }
  }

  const ok = confirm(
    "「" + member.name + "」を削除しますか？\n\n" +
    "この操作は元に戻せません。\n" +
    "メンバー選択からも解除されます。\n\n" +
    "削除してよろしいですか？"
  );

  if (!ok) return;

  const next = cloneState();
  const custom = next.memberCustomizations;

  // 追加メンバー一覧から削除
  custom.added = custom.added.filter(
    item => item.id !== id
  );

  // 編集情報を削除
  delete custom.edits[id];

  // 非表示情報を削除
  custom.hidden = custom.hidden.filter(
    memberId => memberId !== id
  );

  // 全グループの選択情報から解除
  for (const group of Object.keys(next.members)) {
    next.members[group] =
      next.members[group].filter(
        memberId => memberId !== id
      );
  }

  if (!saveState(next)) return;

  rebuildMemberMaster();

  // メンバー選択画面の未確定状態も更新
  draftMembers.delete(id);

  openMemberManager(true);
}

// ========================================
// シリーズ管理
// ========================================

function renderSeriesList() {
  const container = $("seriesList");
  container.replaceChildren();

  const seriesList = currentSeriesList();

  if (!seriesList.length) {
    container.appendChild(createElement(
      "p",
      "empty-message",
      "まだシリーズが登録されていません。"
    ));
    return;
  }

  seriesList.forEach(series => {
    const card = createElement(
      "div",
      "series-card"
    );

    const title = createElement(
      "div",
      "series-name",
      series.name
    );

    const types = createElement(
      "div",
      "series-type-summary",
      series.types.join("・")
    );

    const actions = createElement(
      "div",
      "series-actions"
    );

    const tradeButton = createElement(
      "button",
      "primary",
      "求・譲を登録"
    );

    tradeButton.type = "button";

    tradeButton.addEventListener(
      "click",
      () => openTradeScreen(series.id)
    );

    const editButton = createElement(
      "button",
      "secondary",
      "編集"
    );

    editButton.type = "button";

    editButton.addEventListener(
      "click",
      () => openSeriesEditor(series.id)
    );

    const deleteButton = createElement(
      "button",
      "secondary",
      "削除"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener(
      "click",
      () => deleteSeries(series.id)
    );

    actions.append(
      tradeButton,
      editButton,
      deleteButton
    );

    card.append(title, types, actions);
    container.appendChild(card);
  });
}

function openSeriesEditor(id = null) {
  editingSeriesId = id;

  const series = id ? findSeries(id) : null;

  if (id && !series) {
    alert("シリーズが見つかりません。");
    return;
  }

  $("seriesScreenTitle").textContent =
    series ? "シリーズ編集" : "シリーズ登録";

  $("seriesGroupName").textContent =
    selectedGroup;

  $("seriesName").value =
    series ? series.name : "";

  $("newTypeName").value = "";

  draftSeriesTypes = series
    ? [...series.types]
    : [...DEFAULT_TYPES];

  renderSeriesTypes();
  showScreen("seriesScreen");
}

$("addSeries").addEventListener(
  "click",
  () => openSeriesEditor()
);

$("cancelSeries").addEventListener(
  "click",
  showEditor
);

function renderSeriesTypes() {
  const container = $("seriesTypes");
  container.replaceChildren();

  draftSeriesTypes.forEach(type => {
    const row = createElement(
      "div",
      "series-type-row"
    );

    const label = createElement(
      "span",
      "",
      type
    );

    const remove = createElement(
      "button",
      "small-button",
      "削除"
    );

    remove.type = "button";

    remove.addEventListener("click", () => {
      draftSeriesTypes =
        draftSeriesTypes.filter(
          item => item !== type
        );

      renderSeriesTypes();
    });

    row.append(label, remove);
    container.appendChild(row);
  });
}

$("addType").addEventListener("click", () => {
  const type = $("newTypeName").value.trim();

  if (!type) {
    alert("種類名を入力してください。");
    return;
  }

  if (draftSeriesTypes.includes(type)) {
    alert("同じ種類が登録されています。");
    return;
  }

  draftSeriesTypes.push(type);
  $("newTypeName").value = "";
  renderSeriesTypes();
});

$("saveSeries").addEventListener("click", () => {
  const name = $("seriesName").value.trim();

  if (!name) {
    alert("シリーズ名を入力してください。");
    return;
  }

  if (!draftSeriesTypes.length) {
    alert("生写真の種類を1つ以上登録してください。");
    return;
  }

  const duplicate = currentSeriesList().some(
    series =>
      series.name === name &&
      series.id !== editingSeriesId
  );

  if (duplicate) {
    alert("同名のシリーズが登録されています。");
    return;
  }

  const next = cloneState();

  if (!next.series[selectedGroup]) {
    next.series[selectedGroup] = [];
  }

  if (editingSeriesId) {
    const target = next.series[selectedGroup].find(
      series => series.id === editingSeriesId
    );

    if (!target) {
      alert("シリーズが見つかりません。");
      return;
    }

    target.name = name;
    target.types = [...draftSeriesTypes];

    // 削除した種類の求・譲データを整理
    const trade = next.trades[target.id];

    if (trade) {
      for (const mode of ["want", "offer"]) {
        for (const memberId of Object.keys(trade[mode])) {
          const remaining = trade[mode][memberId]
            .filter(type =>
              target.types.includes(type)
            );

          if (remaining.length) {
            trade[mode][memberId] = remaining;
          } else {
            delete trade[mode][memberId];
          }
        }
      }
    }

  } else {
    const id = generateSeriesId();

    next.series[selectedGroup].push({
      id,
      name,
      types: [...draftSeriesTypes]
    });
  }

  if (saveState(next)) {
    editingSeriesId = null;
    showEditor();
  }
});

function deleteSeries(id) {
  const series = findSeries(id);
  if (!series) return;

  const ok = confirm(
    "「" + series.name + "」を削除しますか？\n\n" +
    "このシリーズの求・譲データも削除されます。"
  );

  if (!ok) return;

  const next = cloneState();

  next.series[selectedGroup] =
    (next.series[selectedGroup] || []).filter(
      item => item.id !== id
    );

  delete next.trades[id];

  if (saveState(next)) {
    renderSeriesList();
  }
}

/* ========================================
   求・譲登録
======================================== */

function openTradeScreen(seriesId) {
  const series = findSeries(seriesId);

  if (!series) {
    alert("シリーズが見つかりません。");
    return;
  }

  currentTradeSeriesId = seriesId;
  currentTradeMode = "want";

  $("tradeSeriesName").textContent = series.name;

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

$("wantTab").addEventListener("click", () => {
  currentTradeMode = "want";
  updateTradeTabs();
  renderTradeMemberList();
});

$("offerTab").addEventListener("click", () => {
  currentTradeMode = "offer";
  updateTradeTabs();
  renderTradeMemberList();
});

$("backFromTrade").addEventListener(
  "click",
  showEditor
);

function getTradeTypes(seriesId, mode, memberId) {
  return (
    state.trades[seriesId] &&
    state.trades[seriesId][mode] &&
    state.trades[seriesId][mode][memberId]
  ) || [];
}

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

  const members =
    next.trades[series.id][currentTradeMode];

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
      member.name +
        "（" + member.generation + "期）"
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

    updateFullscreenButton();
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
  const entries = [];
  const members = sortedSelectedMembers();

  for (const series of currentSeriesList()) {
    const lines = [];

    for (const member of members) {
      const types = getTradeTypes(
        series.id,
        mode,
        member.id
      ).filter(type =>
        series.types.includes(type)
      );

      if (!types.length) continue;

      lines.push({
        member: member.name,
        types
      });
    }

    if (lines.length) {
      entries.push({
        series: series.name,
        lines
      });
    }
  }

  return entries;
}


function renderBoardColumn(containerId, mode) {
  const container = $(containerId);
  container.replaceChildren();

  const entries = boardEntries(mode);

  if (!entries.length) {
    container.appendChild(createElement(
      "p",
      "board-empty",
      "登録データはありません。"
    ));
    return;
  }

  entries.forEach(entry => {
    const block = createElement(
      "div",
      "board-series"
    );

    const heading = createElement(
      "div",
      "board-series-title",
      entry.series
    );

    block.appendChild(heading);

    entry.lines.forEach(line => {
      const row = createElement(
        "div",
        "board-member-row"
      );

      // メンバー名：独立した1行
      const member = createElement(
        "div",
        "board-member-name",
        line.member
      );

      // 写真の種類：名前とは別の領域
      const types = createElement(
        "div",
        "board-member-types"
      );

      line.types.forEach(type => {
        const tag = createElement(
          "span",
          "board-type-tag",
          type
        );

        types.appendChild(tag);
      });

      row.append(member, types);
      block.appendChild(row);
    });

    container.appendChild(block);
  });
}


function renderBoard() {
  const want = $("wantBoard");
  const offer = $("offerBoard");

  want.classList.toggle(
    "hidden",
    currentBoardMode === "offer"
  );

  offer.classList.toggle(
    "hidden",
    currentBoardMode === "want"
  );

  $("boardLayout").classList.toggle(
    "single-column",
    currentBoardMode !== "both"
  );

  renderBoardColumn("wantBoardContent", "want");
  renderBoardColumn("offerBoardContent", "offer");
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
    const size = $("boardFontSize").value;

    const next = cloneState();
    next.settings.fontSize = size;

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

    } else if (
      document.body.classList.contains(
        "board-fullscreen"
      )
    ) {
      document.body.classList.remove(
        "board-fullscreen"
      );

    } else {
      document.body.classList.add(
        "board-fullscreen"
      );

      if (screen.requestFullscreen) {
        try {
          await screen.requestFullscreen();
        } catch (error) {
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
