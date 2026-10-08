/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * QI Settlement Support: opt-in, read-only data discovery.
 * This module never sends game requests or stores full network responses.
 */
(function () {
    'use strict';

    const KEY = 'QISettlementDiagnosticsEnabled';
    const MAX_EVENT_TYPES = 48;
    const MAX_RESOURCE_TYPES = 48;
    const SERVICES = [
        'GuildRaidsService',
        'GuildRaidsMapService',
        'CityMapService',
        'CityProductionService',
        'ResourceService',
        'ArmyService',
        'UnitService'
    ];
    const allowedMethod = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
    const allowedType = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

    let enabled = FH.Storage.getItem(KEY) === '1';
    let stats = initialState();
    let lastRunningSeasonEnd = null;

    function initialState() {
        return {
            schemaVersion: 1,
            events: {},
            qiRunning: null,
            difficultyLevel: null,
            cityMap: null,
            economy: null,
            resourceBagTypes: {},
            qiResources: {},
            resourcesObservedIn: null,
            armyMethodsObserved: [],
            notes: [
                'Only whitelisted QI resource quantities and structural counts are captured.',
                'Unknown fields, building IDs, player/guild IDs, request payloads and raw responses are never retained.',
                'A missing resource is unknown, not zero; production is not the same as inventory.'
            ]
        };
    }

    function eventName(service, method) {
        return allowedMethod.test(method || '') ? service + '.' + method : null;
    }

    function recordEvent(service, method) {
        const key = eventName(service, method);
        if (!key) return;
        if (!Object.prototype.hasOwnProperty.call(stats.events, key) &&
            Object.keys(stats.events).length >= MAX_EVENT_TYPES) return;
        stats.events[key] = (stats.events[key] || 0) + 1;
    }

    function clearSeasonSnapshot() {
        stats.cityMap = null;
        stats.economy = null;
        stats.qiResources = {};
        stats.resourcesObservedIn = null;
    }

    function readQIResources(responseData, method) {
        const found = globalThis.QISettlementCore.normalizeQIStock(responseData);
        if (Object.keys(found).length > MAX_RESOURCE_TYPES) return;
        if (Object.keys(found).length) {
            stats.qiResources = found;
            stats.resourcesObservedIn = method;
        }
    }

    function observe(service, data) {
        if (!enabled || !data || typeof data !== 'object') return;
        const method = data.requestMethod;
        if (!allowedMethod.test(method || '')) return;

        const response = data.responseData;
        const qiMapActive = FH.ActiveMap === 'guild_raids';

        if (service === 'ResourceService') {
            if (method !== 'getPlayerResourceBag' && method !== 'getPlayerResources') return;
            if (method === 'getPlayerResourceBag') {
                const candidate = response?.type?.value;
                const bagType = typeof candidate === 'string' && allowedType.test(candidate)
                    ? candidate : 'unknown';
                if (!Object.prototype.hasOwnProperty.call(stats.resourceBagTypes, bagType) &&
                    Object.keys(stats.resourceBagTypes).length >= 16) return;
                stats.resourceBagTypes[bagType] = (stats.resourceBagTypes[bagType] || 0) + 1;
            }
            readQIResources(response, method);
            recordEvent(service, method);
            return;
        }

        if (service === 'GuildRaidsService' && method === 'getState') {
            const run = globalThis.QISettlementCore.normalizeRun(response);
            if (run.status === 'pending') {
                lastRunningSeasonEnd = null;
                clearSeasonSnapshot();
            } else if (run.status === 'running' &&
                typeof response?.endsAt === 'number' && Number.isFinite(response.endsAt)) {
                if (lastRunningSeasonEnd !== null && lastRunningSeasonEnd !== response.endsAt)
                    clearSeasonSnapshot();
                // This timestamp remains in memory and is never part of the report.
                lastRunningSeasonEnd = response.endsAt;
            }
            stats.qiRunning = run.status === 'running' ? true :
                run.status === 'pending' ? false : null;
            stats.difficultyLevel = run.difficultyLevel;
            recordEvent(service, method);
            return;
        }

        if (service === 'CityMapService' && method === 'getCityMap') {
            if (typeof response?.gridId === 'string' && response.gridId !== 'guild_raids') return;
            if (response?.gridId !== 'guild_raids' && !qiMapActive) return;
            const entities = Array.isArray(response?.entities) ? response.entities : null;
            stats.cityMap = globalThis.QISettlementCore.normalizeMap(response);
            stats.economy = globalThis.QISettlementCore.deriveEconomy(
                entities, FH.Main?.CityEntities
            );
            recordEvent(service, method);
            return;
        }

        if (!qiMapActive) return;
        if (service === 'CityMapService' && ![
            'placeBuilding', 'removeBuilding', 'moveEntity', 'moveEntities', 'updateEntity'
        ].includes(method)) return;
        if (service === 'CityProductionService' && ![
            'pickupProduction', 'pickupAll', 'startProduction', 'cancelProduction'
        ].includes(method)) return;

        recordEvent(service, method);
        if ((service === 'ArmyService' || service === 'UnitService') &&
            !stats.armyMethodsObserved.includes(method) && stats.armyMethodsObserved.length < 16) {
            stats.armyMethodsObserved.push(method);
        }
    }

    for (const service of SERVICES) {
        FH.proxy.addHandler(service, (data) => observe(service, data));
    }

    // Manual opt-in: run QISettlementDiagnostics.enable() in the game console,
    // then reload the game so that the startup responses are observed.
    window.QISettlementDiagnostics = Object.freeze({
        enable() {
            enabled = true;
            FH.Storage.setItem(KEY, '1');
            stats = initialState();
            lastRunningSeasonEnd = null;
            return 'QI diagnostics enabled. Reload the game and enter QI to collect a fresh snapshot.';
        },
        disable() {
            enabled = false;
            FH.Storage.removeItem(KEY);
            stats = initialState();
            lastRunningSeasonEnd = null;
            return 'QI diagnostics disabled; in-memory data cleared.';
        },
        clear() {
            stats = initialState();
            lastRunningSeasonEnd = null;
        },
        report() {
            // No direct references to mutable internal state escape the module.
            return JSON.parse(JSON.stringify({
                enabled,
                ...stats
            }));
        }
    });
})();
