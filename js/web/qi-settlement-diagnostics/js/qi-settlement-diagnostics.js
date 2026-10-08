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
    const allowedResource = /^guild_raids_[a-z0-9_]{1,55}$/;

    let enabled = FH.Storage.getItem(KEY) === '1';
    let stats = initialState();

    function initialState() {
        return {
            schemaVersion: 1,
            events: {},
            qiRunning: null,
            difficultyLevel: null,
            cityMap: null,
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

    function safeNumber(value) {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
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

    function readQIResources(responseData, method) {
        const bag = responseData?.resources?.resources || responseData?.resources || responseData;
        if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return;
        const found = {};
        for (const [key, value] of Object.entries(bag)) {
            if (!allowedResource.test(key)) continue;
            const quantity = safeNumber(value);
            if (quantity === null) continue;
            if (Object.keys(found).length >= MAX_RESOURCE_TYPES) break;
            found[key] = quantity;
        }
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
            stats.qiRunning = response?.__class__ === 'GuildRaidsRunningState' ? true :
                response?.__class__ === 'GuildRaidsPendingState' ? false : null;
            stats.difficultyLevel = safeNumber(response?.raidInstance?.difficultyLevel);
            recordEvent(service, method);
            return;
        }

        if (service === 'CityMapService' && method === 'getCityMap') {
            if (response?.gridId !== 'guild_raids' && !qiMapActive) return;
            const entities = Array.isArray(response?.entities) ? response.entities : null;
            const areas = Array.isArray(response?.unlocked_areas) ? response.unlocked_areas : null;
            stats.cityMap = {
                entityCount: entities ? entities.length : null,
                unlockedAreaCount: areas ? areas.length : null,
                hasEntityIdentifiers: entities ? entities.some(x => x != null && x.cityentity_id != null) : null,
                hasEntityStates: entities ? entities.some(x => x != null && x.state != null) : null,
                producingCount: entities ? entities.filter(x => x?.state?.__class__ === 'ProducingState').length : null
            };
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
            return 'QI diagnostics enabled. Reload the game and enter QI to collect a fresh snapshot.';
        },
        disable() {
            enabled = false;
            FH.Storage.removeItem(KEY);
            stats = initialState();
            return 'QI diagnostics disabled; in-memory data cleared.';
        },
        clear() {
            stats = initialState();
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
