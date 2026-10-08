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

  function euphoriaFactor(euphoria, population) {
    if (!finiteNonnegative(euphoria) || !finiteNonnegative(population) || population === 0) return null;
    const ratio = euphoria / population;
    if (ratio <= 0.2) return 0.2;
    if (ratio <= 0.6) return 0.6;
    if (ratio <= 0.8) return 0.8;
    if (ratio <= 1.2) return 1;
    if (ratio <= 1.4) return 1.1;
    if (ratio < 2) return 1.2;
    return 1.5;
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
    const multiplier = complete ? euphoriaFactor(euphoria, population) : null;
    return {
      complete, buildingCount: entities.length, missingDefinitionCount: missing,
      unknownStatCount: unknownStats, totalPopulation, availablePopulation,
      euphoria: complete ? euphoria : null, euphoriaFactor: multiplier
    };
  }

  // The resource bag and building metadata can represent different points in the
  // construction lifecycle. Keep both visible and mark disagreement explicitly.
  function reconcileEconomy(calculated, stock) {
    const read = key => finiteNonnegative(stock?.[key]) ? stock[key] : null;
    const observed = {
      totalPopulation: read('guild_raids_total_population'),
      availablePopulation: read('guild_raids_population'),
      euphoria: read('guild_raids_happiness')
    };
    const source = Object.values(observed).some(v => v !== null) ? 'resourceBag' : 'unknown';
    const differences = {};
    for (const key of Object.keys(observed)) {
      differences[key] = observed[key] === null || !finiteNonnegative(calculated?.[key])
        ? null : calculated[key] - observed[key];
    }
    const countedUse = finiteNonnegative(calculated?.totalPopulation) &&
      finiteNonnegative(calculated?.availablePopulation)
      ? calculated.totalPopulation - calculated.availablePopulation : null;
    const observedUse = observed.totalPopulation !== null && observed.availablePopulation !== null
      ? observed.totalPopulation - observed.availablePopulation : null;
    return {
      source,
      observed: {
        ...observed,
        euphoriaFactor: euphoriaFactor(observed.euphoria, observed.totalPopulation)
      },
      calculatedUsedPopulation: countedUse,
      observedUsedPopulation: observedUse,
      usedPopulationDifference: countedUse === null || observedUse === null ? null : countedUse - observedUse,
      calculatedMinusObserved: differences,
      hasMismatch: Object.values(differences).some(v => v !== null && v !== 0)
    };
  }

  // Structural rollup only. Never put identifiers, coordinates or free-form
  // state names in the diagnostic report.
  function auditBuildingStates(entities, definitions) {
    if (!Array.isArray(entities) || !plainObject(definitions)) return null;
    const states = {};
    function category(entity) {
      const value = entity?.state?.__class__;
      if (value === 'ProducingState') return 'producing';
      if (typeof value !== 'string') return 'missing';
      if (/construct|building/i.test(value)) return 'construction';
      if (/finish|complete|ready/i.test(value)) return 'completed';
      if (/idle|passive/i.test(value)) return 'idle';
      return 'other';
    }
    for (const entity of entities) {
      const key = category(entity);
      const row = states[key] || (states[key] = {
        count: 0, populationProvided: 0, populationUsed: 0, euphoria: 0,
        missingDefinitionCount: 0, unknownStatCount: 0
      });
      row.count++;
      const definition = definitions[entity?.cityentity_id];
      if (!definition) { row.missingDefinitionCount++; continue; }
      const values = definition.components?.AllAge?.staticResources?.resources?.resources;
      if (!plainObject(values)) { row.unknownStatCount++; continue; }
      const pop = values.guild_raids_population ?? 0;
      const happy = values.guild_raids_happiness ?? 0;
      if (!finiteNumber(pop) || !finiteNumber(happy)) { row.unknownStatCount++; continue; }
      if (pop > 0) row.populationProvided += pop;
      if (pop < 0) row.populationUsed -= pop;
      row.euphoria += happy;
    }
    return states;
  }

  // Computes safe donation amounts per resource; never assumes missing stock is 0.
  function donationCapacity(stock, plannedCosts, minimumReserves = {}, buffer = {}, allowedResources = ['guild_raids_money', 'guild_raids_supplies']) {
    if (![stock, plannedCosts, minimumReserves, buffer].every(plainObject) ||
        !Array.isArray(allowedResources)) return null;
    const allowed = new Set(allowedResources.filter(k => typeof k === 'string' && QI_RESOURCE.test(k)));
    const keys = [...new Set([
      ...Object.keys(stock), ...Object.keys(plannedCosts),
      ...Object.keys(minimumReserves), ...Object.keys(buffer)
    ])].filter(k => allowed.has(k)).sort();
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
    normalizeRun, normalizeQIStock, normalizeMap, deriveEconomy,
    reconcileEconomy, auditBuildingStates, donationCapacity
  });
})();
    if (typeof module === 'object' && module.exports) module.exports = core;
    else root.QISettlementCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
