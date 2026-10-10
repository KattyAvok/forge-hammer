/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 * Manual, versioned transcriptions of user-provided Fighter / Donor QI notes.
 * Not validated against current game prices. No automatic completion claims.
 */
(function (root) {
    const stageNames = Object.freeze({
        day1a: 'Den 1 · začátek',
        day1b: 'Den 1 · přestavba',
        day2a: 'Den 2 · první sběr',
        day2b: 'Den 2 · Rope',
        day3a: 'Den 3 · první sběr',
        day3b: 'Den 3 · rozšíření',
        day4a: 'Den 4 · první sběr',
        day4b: 'Den 4 · přestavba'
    });
    const stages = Object.freeze(Object.keys(stageNames));
    const fighter = Object.freeze({
        day1a: [
            'Kup 3 rozšíření za shards, vlevo dole podél základny.',
            'Postav: 3 Multistorey, 7 Estate, 5 Tannery, 5 Brewery, 7 Church.'
        ],
        day1b: [
            'Odstraň 1 Church.',
            'Postav 1 Gallows a 1 Alchemist.',
            'Po dokončení Alchemist se vrať do osady a spusť produkci.'
        ],
        day2a: [
            'Před sběrem ověř dokončení kulturních staveb a produkce.',
            'Odstraň 1 Multistorey a 1 Tannery.',
            'Postav 1 Frame House a 1 Alchemist.',
            'Po dokončení budov se vrať a spusť produkci.'
        ],
        day2b: [
            'Odstraň 1 Multistorey.',
            'Postav Ropery (rush nebo čekání na dokončení) a vyrob 4×20 Rope.',
            'Kup 2 rozšíření vlevo nahoře a odstraň překážky.',
            'Postav 1 Multistorey, 1 Alchemist, 1 Frame House, 1 Church, 1 Marketplace.',
            'Vrať se po dokončení nových výrobních budov a spusť produkci.'
        ],
        day3a: [
            'Před sběrem ověř dokončení kulturních staveb i výroby.',
            'Odstraň 1 Marketplace a 1 Church.',
            'Postav Catapult Camp, naverbuj 2×10 jednotek a až potom tábor odstraň.',
            'Postav 2 Frame House, 1 Pillory a 1 Estate.',
            'Po dokončení nových budov se vrať a spusť produkci.'
        ],
        day3b: [
            'Před sběrem ověř kulturní stavby a dokončenou produkci.',
            'Vyrob 4×20 Rope a kup 1 rozšíření vlevo nahoře.',
            'Odstraň 4 Tannery.',
            'Postav 5 Alchemist, 1 Church, 1 Gallows a 4 Estate.',
            'Po dokončení nových budov spusť produkci.'
        ],
        day4a: [
            'Před sběrem ověř kulturní stavby a dokončenou produkci.',
            'Podle původní šablony vyrob 7×20 Rope a kup poslední rozšíření vlevo nahoře.',
            'Odstraň 2 Church.',
            'Postav 1 Pillory, 3 Alchemist a 2 Frame House.',
            'Po dokončení nových budov spusť produkci.'
        ],
        day4b: [
            'Před sběrem ověř kulturní stavby a dokončenou produkci.',
            'Odstraň 1 Church, 1 Brewery a 2 Multistorey.',
            'Postav Trebuchet Camp (rush nebo čekání) a naverbuj 5×10 jednotek, pak tábor odstraň.',
            'Postav 1 Clapboard a 1 Bakery; rush jen pokud posune další sběr.',
            'Postav 1 Gallows; alternativa je 1 Cartographer při dostatku Alloy.',
            'Pokud chybí zdroje, dokonči krok při příštím sběru a posuň návazné etapy.'
        ]
    });
    const donor = Object.freeze({
        day1a: [
            'Kup 3 rozšíření za shards vlevo dole podél základny.',
            'Postav 7 Estate, 1 Mansion, 1 Multistorey, 6 Church, 6 Tannery, 6 Brewery.',
            'Daruj pouze přebytky nad prostředky potřebnými k dalším etapám.'
        ],
        day1b: [
            'Odstraň 2 Church.',
            'Postav 1 Printer a 1 Tannery.',
            'Volitelně bojuj jen počáteční armádou; čistý Donor může tento krok vynechat.'
        ],
        day2a: [
            'Odstraň 4 Church.',
            'Postav 1 Doctor, 1 Tannery a 3 Multistorey.',
            'Daruj pouze přebytky. Boj počáteční armádou je volitelný.'
        ],
        day2b: [
            'Odstraň 2 Tannery.',
            'Postav Ropery (rush nebo čekání) a vyrob 70 Rope.',
            'Kup 2 rozšíření dle původního rozmístění vpravo, směrem doleva dolů.',
            'Postav 4 Multistorey a 3 Church.'
        ],
        day3a: [
            'Odstraň 3 Church a 1 Multistorey.',
            'Postav 1 Printer, 1 Tannery a 2 Brewery.',
            'Původní šablona požaduje rezervu 100k goods a 100k supplies; význam goods ověř, nenahrazuj automaticky mincemi.'
        ],
        day3b: [
            'Vyrob Rope pro další 3 rozšíření; přesné dávky závisí na aktuálních cenách a zásobě.',
            'Odstraň 1 Multistorey a 1 Mansion.',
            'Postav 1 Clapboard a 2 Tannery.',
            'Chraň nejméně 280k mincí a 280k zásob podle původního návodu.'
        ],
        day4a: [
            'Vyrob 130 Rope a kup čtvrté rozšíření příslušné etapy.',
            'Odstraň 6 Multistorey.',
            'Postav 8 Estate a 1 Brewery.',
            'Začni darovat přebytky, ale chraň náklady zbývajících přestaveb.'
        ],
        day4b: [
            'Odstraň 1 Tannery a 1 Estate.',
            'Postav 1 Bakery.',
            'Pokračování původní strategie překračuje poskytnutou etapu; nevyprazdňuj zásoby bez plánu dalších staveb.'
        ]
    });

    const api = Object.freeze({
        version:'user-guides-v1',
        stageNames, stages,
        getSteps(profile, stage) {
            const plan = profile === 'donor' ? donor : fighter;
            return Array.isArray(plan[stage]) ? plan[stage].slice() : [];
        }
    });
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.QISettlementStrategies = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
