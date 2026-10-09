/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Read-only settlement status panel. Never submits game actions or requests.
 */
(function () {
    'use strict';
    const ID = 'qiSettlementSupport';
    const STORAGE_PREFIX = 'QISettlementSupportSettingsV1_';
    const core = globalThis.QISettlementCore;
    const state = {
        running: false,
        difficulty: null,
        seasonEnd: null,
        stock: null,
        map: null,
        mapStale: true,
        lastSource: null
    };

    const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const numberText = value => valid(value) ? Math.round(value).toLocaleString('cs-CZ') : 'nezjištěno';
    const moneyKey = 'guild_raids_money';
    const suppliesKey = 'guild_raids_supplies';

    function settingsKey() {
        // Used ONLY for namespacing preferences. Never logged or included in reports.
        const world = FH.World || window.location.hostname.split('.')[0];
        const player = FH.Player?.ID;
        return STORAGE_PREFIX + world + '_' + (player || 'unknown');
    }

    function defaults() {
        return {profile:'fighter', reserveMoney:'', reserveSupplies:''};
    }

    function settings() {
        try {
            const stored = JSON.parse(FH.Storage.getItem(settingsKey()) || 'null');
            if (!stored || typeof stored !== 'object') return defaults();
            return {
                profile: stored.profile === 'donor' ? 'donor' : 'fighter',
                reserveMoney: typeof stored.reserveMoney === 'string' && /^\d{0,14}$/.test(stored.reserveMoney)
                    ? stored.reserveMoney : '',
                reserveSupplies: typeof stored.reserveSupplies === 'string' && /^\d{0,14}$/.test(stored.reserveSupplies)
                    ? stored.reserveSupplies : ''
            };
        } catch (_) {
            return defaults();
        }
    }

    function save(next) {
        FH.Storage.setItem(settingsKey(), JSON.stringify(next));
    }

    function resetMap() {
        state.map = null;
        state.mapStale = true;
    }

    function resetRun() {
        state.stock = null;
        state.lastSource = null;
        resetMap();
    }

    function render() {
        const root = $('#' + ID + 'Body');
        if (!root.length) return;
        root.empty();
        const preferences = settings();
        const panel = $('<div class="qi-support"/>');

        const row = (title, value) => $('<div class="qi-support-row"/>')
            .append($('<span/>').text(title))
            .append($('<strong/>').text(value));
        const section = title => $('<h3/>').text(title);
        const hint = message => $('<p class="qi-support-note"/>').text(message);

        const profileRow = $('<div class="qi-support-profile"/>');
        profileRow.append($('<label for="qi-support-profile"/>').text('Strategie: '));
        const profile = $('<select id="qi-support-profile"/>')
            .append($('<option value="fighter"/>').text('Fighter — boj'))
            .append($('<option value="donor"/>').text('Donor — darování'))
            .val(preferences.profile);
        profile.on('change', () => {
            save({...settings(), profile: profile.val()});
            render();
        });
        profileRow.append(profile);
        panel.append(profileRow);

        if (!state.running) {
            panel.append(hint('Aktivní QI běh zatím nebyl potvrzen. Vstup do QI a znovu otevři panel.'));
        } else {
            panel.append(row('Obtížnost', numberText(state.difficulty)));
        }

        panel.append(section('Aktuální zásoby z herního skladu'));
        const stock = state.stock || {};
        panel.append(row('QI mince', numberText(stock[moneyKey])));
        panel.append(row('QI zásoby', numberText(stock[suppliesKey])));
        panel.append(row('Chrono Alloy', numberText(stock.guild_raids_chrono_alloy)));
        panel.append(row('Rope', numberText(stock.guild_raids_rope)));
        panel.append(row('Quantum Actions', numberText(stock.guild_raids_action_points)));

        const observed = core.reconcileEconomy(null, stock).observed;
        panel.append(section('Aktuální ekonomika'));
        panel.append(row('Celková / volná populace',
            numberText(observed.totalPopulation) + ' / ' + numberText(observed.availablePopulation)));
        panel.append(row('Euforie', numberText(observed.euphoria)));
        panel.append(row('Násobitel euforie',
            valid(observed.euphoriaFactor) ? observed.euphoriaFactor.toLocaleString('cs-CZ') + '×' : 'nezjištěno'));

        panel.append(section('Stav mapy a výstavby'));
        if (state.mapStale || !state.map) {
            panel.append(hint('Mapa není aktuálně potvrzená. Pro ověření staveb znovu vstup do QI osady. Údaje ze skladu zůstávají samostatné.'));
        } else {
            const comparison = core.reconcileEconomy(state.map.derived, stock);
            const audit = state.map.audit;
            const construction = audit?.construction?.count || 0;
            panel.append(row('Budovy ve výstavbě', numberText(construction)));
            panel.append(row('Objekty na mapě', numberText(state.map.summary?.entityCount)));
            if (comparison.hasMismatch) {
                panel.append(hint('Součet definic budov se liší od hodnot herního skladu. Aktuální populace a euforie se proto přebírá ze skladu.'));
                const forecast = core.forecastConstructionCompletion(comparison, audit);
                if (forecast) {
                    panel.append(row('Po dokončení (podmíněný odhad): populace',
                        numberText(forecast.totalPopulation) + ' / ' + numberText(forecast.availablePopulation)));
                    panel.append(row('Po dokončení (podmíněný odhad): euforie',
                        numberText(forecast.euphoria)));
                }
            }
        }

        if (preferences.profile === 'donor') {
            panel.append(section('Donor — chráněné rezervy'));
            panel.append(hint('Zadej minimální částku, kterou potřebuješ ponechat pro další výstavbu. Bez rezervy nepočítáme bezpečný přebytek. Tento výpočet nezná ceny dalších budov ani konkrétního donačního uzlu.'));
            const reserveEditor = (label, property) => {
                const holder = $('<label class="qi-support-reserve"/>').text(label + ': ');
                const input = $('<input type="number" min="0" step="1" inputmode="numeric"/>')
                    .val(preferences[property]).attr('placeholder','nezadáno');
                input.on('change', () => {
                    const raw = String(input.val()).trim();
                    const parsed = /^\d{1,14}$/.test(raw) ? raw : '';
                    const next = {...settings(), [property]:parsed};
                    save(next);
                    render();
                });
                holder.append(input);
                return holder;
            };
            panel.append(reserveEditor('Rezerva mincí', 'reserveMoney'));
            panel.append(reserveEditor('Rezerva zásob', 'reserveSupplies'));
            if (preferences.reserveMoney !== '' && preferences.reserveSupplies !== '') {
                const minimum = {
                    [moneyKey]:Number(preferences.reserveMoney),
                    [suppliesKey]:Number(preferences.reserveSupplies)
                };
                const capacities = core.donationCapacity(stock, {}, minimum);
                panel.append(row('Přebytek mincí nad zadanou rezervou',
                    numberText(capacities?.[moneyKey]?.available)));
                panel.append(row('Přebytek zásob nad zadanou rezervou',
                    numberText(capacities?.[suppliesKey]?.available)));
                panel.append(hint('Pozor: Přebytek nad ručně zadanou rezervou není ověřená bezpečná částka k darování. Nezahrnuje budoucí ceny ani Quantum Actions na konkrétním uzlu.'));
            } else {
                panel.append(hint('Přebytek zatím nepočítám — nejsou zadané obě rezervy.'));
            }
        } else {
            panel.append(section('Fighter — připravenost'));
            panel.append(hint('Bojové jednotky, typy nepřátel a bojové bonusy zatím nemáme ověřené. Dokud je nezískáme, panel nebude doporučovat nábor ani bojovou přestavbu.'));
            panel.append(row('Jednotky / bojové bonusy', 'nezjištěno'));
        }
        panel.append(hint('Pouze informační panel. Neprovádí žádné akce ve hře.'));
        root.append(panel);
    }

    function show() {
        if (FH.ActiveMap !== 'guild_raids') return;
        if ($('#' + ID).length === 0) {
            FH.HTML.Box({
                id:ID, title:'QI Settlement Support', auto_close:true,
                dragdrop:true, minimize:true, resize:true, active_maps:'guild_raids'
            });
            FH.HTML.AddCssFile('qi-settlement-support');
            render();
        } else {
            FH.HTML.CloseOpenBox(ID);
            render();
        }
    }

    FH.proxy.addHandler('ResourceService','getPlayerResourceBag',data=>{
        const resources = core.normalizeQIStock(data?.responseData);
        if (Object.keys(resources).length === 0) return;
        state.stock = resources;
        state.lastSource = 'getPlayerResourceBag';
        render();
    });
    FH.proxy.addHandler('ResourceService','getPlayerResources',data=>{
        const resources = core.normalizeQIStock(data?.responseData);
        if (Object.keys(resources).length === 0) return;
        state.stock = resources;
        state.lastSource = 'getPlayerResources';
        render();
    });
    FH.proxy.addHandler('GuildRaidsService','getState',data=>{
        const response = data?.responseData;
        const run = core.normalizeRun(response);
        const seasonEnd = Number.isFinite(response?.endsAt) ? response.endsAt : null;
        if (run.status === 'pending') {
            resetRun();
            state.seasonEnd = null;
            state.running = false;
        } else if (run.status === 'running') {
            if (seasonEnd !== null && state.seasonEnd !== null && state.seasonEnd !== seasonEnd)
                resetRun();
            state.seasonEnd = seasonEnd;
            state.running = true;
        } else {
            state.running = false;
            resetRun();
        }
        state.difficulty = run.difficultyLevel;
        render();
    });
    FH.proxy.addHandler('CityMapService','getCityMap',data=>{
        const response = data?.responseData;
        if (response?.gridId !== 'guild_raids') return;
        const entities = response?.entities;
        state.map = {
            summary:core.normalizeMap(response),
            derived:core.deriveEconomy(entities,FH.Main?.CityEntities),
            audit:core.auditBuildingStates(entities,FH.Main?.CityEntities)
        };
        state.mapStale = false;
        render();
    });

    const dirtyMethods = ['placeBuilding','removeBuilding','moveEntity','moveEntities','updateEntity','placeExpansion'];
    FH.proxy.addHandler('CityMapService',data=>{
        if (FH.ActiveMap === 'guild_raids' && dirtyMethods.includes(data.requestMethod)) {
            state.mapStale = true;
            render();
        }
    });
    FH.proxy.addHandler('CityProductionService',data=>{
        if (FH.ActiveMap === 'guild_raids' &&
            ['pickupProduction','pickupAll','startProduction','cancelProduction'].includes(data.requestMethod)) {
            state.mapStale = true;
            render();
        }
    });

    globalThis.QISettlementSupport = Object.freeze({
        Show: show,
        // Snapshot excludes internal world/player identifiers and arbitrary game responses.
        Status: () => ({
            running:state.running, difficulty:state.difficulty,
            hasStock:!!state.stock, mapStale:state.mapStale,
            hasMap:!!state.map, selectedProfile:settings().profile
        })
    });
})();
