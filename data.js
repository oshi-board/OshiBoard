
"use strict";

/* ========================================
   推しボード データ管理
   
   既存の保存キーは維持
   メンバー編集情報だけ新しいキーへ保存
======================================== */

const OshiData = (() => {

  // ========================================
  // 保存キー
  // ========================================

  const KEYS = {
    members: "oshiboard_selected_members_v1",
    series: "oshiboard_series_v1",
    trades: "oshiboard_trades_v1",
    settings: "oshiboard_settings_v1",
    memberCustomizations:
      "oshiboard_member_customizations_v1"
  };

  const GROUPS = [
    "乃木坂46",
    "櫻坂46",
    "日向坂46"
  ];

  // ========================================
  // 共通処理
  // ========================================

  const copy = value =>
    JSON.parse(JSON.stringify(value));

  const isObject = value =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const validGroup = group =>
    GROUPS.includes(group);

  const validId = id =>
    typeof id === "string" &&
    id.length > 0;

  const validName = name =>
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.length <= 100;

  const validGeneration = generation =>
    Number.isInteger(generation) &&
    generation >= 1 &&
    generation <= 99;

  // ========================================
  // メンバー個人設定の初期値
  // ========================================

  function emptyMemberCustomizations() {
    return {
      added: [],
      edits: {},
      hidden: [],
      cachedDefaults: []
    };
  }

  // ========================================
  // 保存データ読込
  // ========================================

  function readKey(key) {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return {};
    }

    const value = JSON.parse(raw);

    if (!isObject(value)) {
      throw new Error(
        "保存データの形式が不正です：" + key
      );
    }

    return value;
  }

  function readMemberCustomizations() {
    const raw = localStorage.getItem(
      KEYS.memberCustomizations
    );

    if (raw === null) {
      return emptyMemberCustomizations();
    }

    const value = JSON.parse(raw);

    validateMemberCustomizations(value);

    return value;
  }

  // ========================================
  // メンバー選択データ検証
  // ========================================

  function validateMembers(data) {
    if (!isObject(data)) {
      throw new Error(
        "メンバー選択データが不正です。"
      );
    }

    for (const [group, ids] of Object.entries(data)) {
      if (
        !validGroup(group) ||
        !Array.isArray(ids) ||
        !ids.every(validId) ||
        new Set(ids).size !== ids.length
      ) {
        throw new Error(
          "メンバー選択データが不正です。"
        );
      }
    }
  }

  // ========================================
  // シリーズデータ検証
  // ========================================

  function validateSeries(data) {
    if (!isObject(data)) {
      throw new Error(
        "シリーズデータが不正です。"
      );
    }

    const allIds = new Set();
    const seriesMap = new Map();

    for (const [group, list] of Object.entries(data)) {

      if (
        !validGroup(group) ||
        !Array.isArray(list)
      ) {
        throw new Error(
          "シリーズ一覧が不正です。"
        );
      }

      const names = new Set();

      for (const item of list) {

        if (
          !isObject(item) ||
          !validId(item.id) ||
          !validName(item.name) ||
          !Array.isArray(item.types) ||
          item.types.length === 0 ||
          !item.types.every(type =>
            typeof type === "string" &&
            type.trim().length > 0
          )
        ) {
          throw new Error(
            "シリーズの登録内容が不正です。"
          );
        }

        if (
          allIds.has(item.id) ||
          names.has(item.name) ||
          new Set(item.types).size !==
            item.types.length
        ) {
          throw new Error(
            "シリーズID・名前・種類が重複しています。"
          );
        }

        allIds.add(item.id);
        names.add(item.name);

        seriesMap.set(item.id, {
          ...item,
          group
        });
      }
    }

    return seriesMap;
  }

  // ========================================
  // 求・譲データ検証
  // ========================================

  function validateTrades(trades, seriesMap) {

    if (!isObject(trades)) {
      throw new Error(
        "求譲データが不正です。"
      );
    }

    for (const [seriesId, entry] of Object.entries(trades)) {

      const series = seriesMap.get(seriesId);

      if (
        !series ||
        !isObject(entry) ||
        !isObject(entry.want) ||
        !isObject(entry.offer)
      ) {
        throw new Error(
          "求譲データの構造が不正です。"
        );
      }

      for (const mode of ["want", "offer"]) {

        for (const [memberId, types] of Object.entries(
          entry[mode]
        )) {

          if (
            !memberId ||
            !Array.isArray(types) ||
            !types.every(type =>
              typeof type === "string" &&
              series.types.includes(type)
            ) ||
            new Set(types).size !== types.length
          ) {
            throw new Error(
              "求譲の種類データが不正です。"
            );
          }
        }
      }
    }
  }

  // ========================================
  // 表示設定検証
  // ========================================

  function validateSettings(settings) {

    if (!isObject(settings)) {
      throw new Error(
        "表示設定が不正です。"
      );
    }

    if (
      settings.fontSize !== undefined &&
      ![
        "small",
        "medium",
        "large",
        "xlarge"
      ].includes(settings.fontSize)
    ) {
      throw new Error(
        "文字サイズの設定が不正です。"
      );
    }
  }

  // ========================================
  // メンバー個人設定の検証
  // ========================================

  function validateMemberRecord(member) {
    return (
      isObject(member) &&
      validId(member.id) &&
      validGroup(member.group) &&
      validName(member.name) &&
      validGeneration(member.generation) &&
      Number.isFinite(member.sortOrder)
    );
  }

  function validateMemberCustomizations(data) {

    if (
      !isObject(data) ||
      !Array.isArray(data.added) ||
      !isObject(data.edits) ||
      !Array.isArray(data.hidden) ||
      !Array.isArray(data.cachedDefaults)
    ) {
      throw new Error(
        "メンバー個人設定の形式が不正です。"
      );
    }

    const addedIds = new Set();

    for (const member of data.added) {

      if (
        !validateMemberRecord(member) ||
        addedIds.has(member.id)
      ) {
        throw new Error(
          "追加メンバーのデータが不正です。"
        );
      }

      addedIds.add(member.id);
    }

    for (const [id, edit] of Object.entries(data.edits)) {

      if (
        !validId(id) ||
        !isObject(edit) ||
        (
          edit.name !== undefined &&
          !validName(edit.name)
        ) ||
        (
          edit.generation !== undefined &&
          !validGeneration(edit.generation)
        )
      ) {
        throw new Error(
          "メンバー編集データが不正です。"
        );
      }

      // 名前・期以外の変更は認めない
      if (
        Object.keys(edit).some(
          key => !["name", "generation"].includes(key)
        )
      ) {
        throw new Error(
          "メンバー編集項目が不正です。"
        );
      }
    }

    if (
      !data.hidden.every(validId) ||
      new Set(data.hidden).size !==
        data.hidden.length
    ) {
      throw new Error(
        "非表示メンバーのデータが不正です。"
      );
    }

    // 過去に取得したデフォルトメンバーを保存。
    // 後日マスタから削除されても既存データを守る。
    const cachedIds = new Set();

    for (const member of data.cachedDefaults) {

      if (
        !validateMemberRecord(member) ||
        cachedIds.has(member.id)
      ) {
        throw new Error(
          "メンバー履歴データが不正です。"
        );
      }

      cachedIds.add(member.id);
    }
  }

  // ========================================
  // 全データ検証
  // ========================================

  function validateAll(data) {

    if (!isObject(data)) {
      throw new Error(
        "保存データが不正です。"
      );
    }

    validateMembers(data.members);

    const seriesMap = validateSeries(
      data.series
    );

    validateTrades(
      data.trades,
      seriesMap
    );

    validateSettings(
      data.settings
    );

    validateMemberCustomizations(
      data.memberCustomizations
    );

    return true;
  }

  // ========================================
  // 全データ読込
  // ========================================

  function load() {

    const data = {
      members: readKey(KEYS.members),
      series: readKey(KEYS.series),
      trades: readKey(KEYS.trades),
      settings: readKey(KEYS.settings),
      memberCustomizations:
        readMemberCustomizations()
    };

    validateAll(data);

    return data;
  }

  // ========================================
  // 自動保存
  // ========================================

  function save(nextData) {

    validateAll(nextData);

    // 書込前のデータを保持
    const oldValues = {};

    for (const [name, key] of Object.entries(KEYS)) {
      oldValues[name] = localStorage.getItem(key);
    }

    const written = [];

    try {

      // 各データを保存
      for (const [name, key] of Object.entries(KEYS)) {

        localStorage.setItem(
          key,
          JSON.stringify(nextData[name])
        );

        written.push(name);
      }

      return true;

    } catch (error) {

      // 途中で保存に失敗した場合は元に戻す
      let rollbackFailed = false;

      for (const name of written.reverse()) {

        try {
          const old = oldValues[name];

          if (old === null) {
            localStorage.removeItem(KEYS[name]);
          } else {
            localStorage.setItem(
              KEYS[name],
              old
            );
          }

        } catch (rollbackError) {
          rollbackFailed = true;
          console.error(rollbackError);
        }
      }

      if (rollbackFailed) {
        throw new Error(
          "保存に失敗し、元データの復旧にも失敗しました。" +
          "操作を中止してください。"
        );
      }

      throw new Error(
        "保存に失敗したため、変更を取り消しました。"
      );
    }
  }

  // ========================================
  // 公開メソッド
  // ========================================

  return {
    copy,
    load,
    save
  };

})();
