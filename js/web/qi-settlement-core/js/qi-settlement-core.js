/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 * Pure, read-only QI settlement calculations (no network or storage).
 */
(function (root) {
    const core = (function buildCore() {
  'use strict';
  const QI_RESOURCE = /^guild_raids_[a-z0-9_]{1,55}$/;
  const finiteNonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const finiteNumber = n => typeof n === 'number' && Number.isFinite(n);
  const plainObject = x => !!x && typeof x === 'object' && !Array.isArray(x);

  function normalizeRun(payload) {
    const cls = payload?.__class__;
    const status = cls === 'GuildRaidsRunningState' ? 'running' :
      cls === 'GuildRaidsPendingState' ? 'pending' : 'unknown';
    const difficulty = payload?.raidInstance?.difficultyLevel;
    return Object.freeze({
      status,
      difficultyLevel: finiteNonnegative(difficulty) ? difficulty : null
    });
  }

  // Null means "not observed"; zero means "observed as empty".
  function normalizeQIStock(payload) {
    const candidate = payload?.resources?.resources ?? payload?.resources ?? payload;
    const result = {};
    if (plainObject(candidate)) {
      for (const [name, value] of Object.entries(candidate)) {
        if (QI_RESOURCE.test(name) && finiteNonnegative(value)) result[name] = value;
      }
    }
    return result;
  }

  // Returns only aggregates. Entity IDs and map coordinates are never copied to the output.
  function normalizeMap(payload) {
    if (!plainObject(payload)) return null;
    const areas = Array.isArray(payload.unlocked_areas) ? payload.unlocked_areas.length : null;
    const entities = Array.isArray(payload.entities) ? payload.entities : null;
    return {
      entityCount: entities ? entities.length : null,
      unlockedAreaCount: areas,
      producingCount: entities ? entities.filter(e => e?.state?.__class__ === 'ProducingState').length : null
    };
  }

  // Defines the economy from game metadata, never from fixed game-version numbers.
  function deriveEconomy(entities, definitions) {
    if (!Array.isArray(entities) || !plainObject(definitions)) return null;
    let population = 0, usedPopulation = 0, euphoria = 0, missing = 0, unknownStats = 0;
    for (const entity of entities) {
      const def = definitions[entity?.cityentity_id];
      if (!def) { missing++; continue; }
      const r = def.components?.AllAge?.staticResources?.resources?.resources;
      const pop = r?.guild_raids_population ?? 0;
      const happy = r?.guild_raids_happiness ?? 0;
      if (!finiteNumber(pop) || !finiteNumber(happy)) { unknownStats++; continue; }
      if (pop >= 0) population += pop;
      else usedPopulation -= pop;
      euphoria += happy;
    }
    const complete = missing === 0 && unknownStats === 0;
    const totalPopulation = complete ? population : null;
    const availablePopulation = complete ? population - usedPopulation : null;
    const ratio = complete && population > 0 ? euphoria / population : null;
    let euphoriaFactor = null;
    if (ratio !== null) {
      if (ratio <= 0.2) euphoriaFactor = 0.2;
      else if (ratio <= 0.6) euphoriaFactor = 0.6;
      else if (ratio <= 0.8) euphoriaFactor = 0.8;
      else if (ratio <= 1.2) euphoriaFactor = 1;
      else if (ratio <= 1.4) euphoriaFactor = 1.1;
      else if (ratio < 2) euphoriaFactor = 1.2;
      else euphoriaFactor = 1.5;
    }
    return {
      complete, buildingCount: entities.length, missingDefinitionCount: missing,
      unknownStatCount: unknownStats, totalPopulation, availablePopulation,
      euphoria: complete ? euphoria : null, euphoriaFactor
    };
  }

  // Computes safe donation amounts per resource; never assumes missing stock is 0.
  function donationCapacity(stock, plannedCosts, minimumReserves = {}, buffer = {}) {
    if (![stock, plannedCosts, minimumReserves, buffer].every(plainObject)) return null;
    const keys = [...new Set([
      ...Object.keys(stock), ...Object.keys(plannedCosts),
      ...Object.keys(minimumReserves), ...Object.keys(buffer)
    ])].filter(k => QI_RESOURCE.test(k)).sort();
    const out = {};
    for (const k of keys) {
      const held = stock[k], cost = plannedCosts[k] ?? 0;
      const minimum = minimumReserves[k] ?? 0, extra = buffer[k] ?? 0;
      if (!finiteNonnegative(held) || !finiteNonnegative(cost) ||
          !finiteNonnegative(minimum) || !finiteNonnegative(extra)) {
        out[k] = { held: finiteNonnegative(held) ? held : null, protected: null, available: null };
        continue;
      }
      const protectedAmount = Math.max(minimum, cost + extra);
      out[k] = { held, protected: protectedAmount, available: Math.max(0, held - protectedAmount) };
    }
    return out;
  }

  return Object.freeze({
    normalizeRun, normalizeQIStock, normalizeMap, deriveEconomy, donationCapacity
  });
})();
    if (typeof module === 'object' && module.exports) module.exports = core;
    else root.QISettlementCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
