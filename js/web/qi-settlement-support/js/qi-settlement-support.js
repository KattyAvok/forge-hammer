/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Read-only settlement status panel. Never submits game actions or requests.
 */
(function () {
    'use strict';
    const ID = 'qiSettlementSupport';
    const BUILD = '1.8.1.14-qi-spatial-sequences';
    const STORAGE_PREFIX = 'QISettlementSupportSettingsV1_';
    const core = globalThis.QISettlementCore;
    let contracts = globalThis.QISettlementContracts.create();
    let nodeCandidates = null;
    const state = {
        running: false,
        difficulty: null,
        seasonEnd: null,
        stock: null,
        map: null,
        mapStale: true,
        lastSource: null,
        advisorRevision: 0,
        advisorCache: null,
        sequenceCache: null
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
        return {profile:'fighter', stage:'day1a', reserveMoney:'', reserveSupplies:''};
    }

    function settings() {
        try {
            const stored = JSON.parse(FH.Storage.getItem(settingsKey()) || 'null');
            if (!stored || typeof stored !== 'object') return defaults();
            return {
                profile: stored.profile === 'donor' ? 'donor' : 'fighter',
                stage: globalThis.QISettlementStrategies.stages.includes(stored.stage) ? stored.stage : 'day1a',
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
        state.advisorRevision++;
        state.advisorCache = null;
        state.sequenceCache = null;
    }

    function resetRun() {
        contracts = globalThis.QISettlementContracts.create();
        nodeCandidates = null;
        state.stock = null;
        state.lastSource = null;
        resetMap();
    }

    function readReserves(prefs) {
        return {
            guild_raids_money: prefs.reserveMoney === '' ? null : Number(prefs.reserveMoney),
            guild_raids_supplies: prefs.reserveSupplies === '' ? null : Number(prefs.reserveSupplies)
        };
    }
    function advice(profile, prefs) {
        if (!state.running || state.mapStale || !state.map || !state.stock)
            return null;
        const key=state.advisorRevision+'|'+profile+'|'+prefs.reserveMoney+'|'+prefs.reserveSupplies;
        if(state.advisorCache?.key===key)return state.advisorCache.value;
        const result=globalThis.QISettlementAdvisor.advise({
            profile,
            stock:state.stock,
            entities:state.map.entities,
            definitions:FH.Main?.CityEntities,
            unlockedAreaCount:state.map.summary?.unlockedAreaCount,
            reserves:profile==='donor'?readReserves(prefs):{}
        });
        state.advisorCache={key,value:result};
        return result;
    }

    function scenarioStatus() {
        if (FH.ActiveMap!=='guild_raids' || !state.running || state.mapStale || !state.map?.entities || !state.stock)
            return {status:'missing-or-stale-state'};
        const prefs=settings();
        const selected={};
        if(prefs.profile==='donor') {
            for(const [key,value] of Object.entries(readReserves(prefs)))
                if(valid(value))selected[key]=value;
        }
        const result=globalThis.QISettlementSimulator.explore({
            stock:state.stock,entities:state.map.entities,
            definitions:FH.Main?.CityEntities,
            profile:prefs.profile,reserves:selected
        });
        const checked=['guild_raids_money','guild_raids_supplies',
            'guild_raids_chrono_alloy','guild_raids_population',
            'guild_raids_total_population','guild_raids_happiness'];
        return {
            status:result.status,
            missingEconomicKeys:checked.filter(key=>!valid(state.stock[key])),
            counts:{
                modeledBuilds:result.builds.length,
                provisionalBuilds:result.provisionalBuilds?.length||0,
                blockedBuilds:result.blockedBuilds.length,
                replacementScenarios:result.replacements.length
            },
            // Intentionally excludes balances, metadata ids, map coordinates,
            // player/world identifiers and full game responses.
            profile:prefs.profile
        };
    }

    function nodeBudgetCoverage() {
        const prefs=settings(),reserves={};
        if(prefs.profile==='donor') {
            const raw=readReserves(prefs);
            for(const [k,value] of Object.entries(raw))
                if(valid(value))reserves[k]=value;
            const planning=sequencePreview();
            const envelope=planning?.plans?.length?
                globalThis.QISettlementDonationBudget.budget({
                    stock:state.stock,plans:planning.plans,manualReserves:reserves
                }):null;
            for(const [k,entry] of Object.entries(envelope?.investmentBuffer||{}))
                if(valid(entry.protectedTotal))reserves[k]=entry.protectedTotal;
        }
        return globalThis.QISettlementNodeBudget.evaluate(nodeCandidates,state.stock,reserves);
    }

    function diagnosticReport() {
        const phase=state.map?.entities && !state.mapStale ?
            globalThis.QISettlementAdvisor.inferPhase(
                globalThis.QISettlementAdvisor.features(state.map.entities,FH.Main?.CityEntities),
                state.map.summary?.unlockedAreaCount) : null;
        const meta=FH.Main?.CityEntities;
        const complete=!!(FH.ActiveMap==='guild_raids'&&state.running&&
            !state.mapStale&&state.map?.entities&&state.stock);
        const empty={status:'missing-or-stale-state'};
        const geom=complete?globalThis.QISettlementGeometry.summarize(state.map.layoutIndex):empty;
        const catalog=globalThis.QISettlementAdvisor.catalogCoverage(meta);
        const current=complete?scenarioStatus():empty;
        const filter=definition=>{
            const stat=definition.components?.AllAge?.staticResources?.resources?.resources||{};
            return Object.keys(stat).some(key=>key.startsWith('guild_raids_'));
        };
        const production=globalThis.QISettlementProduction.inspect(meta,filter);
        const boosts=globalThis.QISettlementProduction.qiBoostSummary(
            typeof Boosts!=='undefined'?Boosts:null
        );
        const cycleEstimates=[];
        if(complete&&meta) {
            const entries=Object.entries(meta);
            for(const [key,def] of entries) {
                if(cycleEstimates.length>=8)break;
                const price=globalThis.QISettlementAdvisor.priceEvidence(def);
                if(price.status!=='metadata-candidate')continue;
                const q=globalThis.QISettlementProduction.perResourcePayback(
                    def,price.cost,state.stock,boosts.fields||{}
                );
                if(q.status!=='currency-specific-cycles')continue;
                const shown=Object.keys(q.estimate.output||{}).filter(k=>
                    k==='guild_raids_money'||k==='guild_raids_supplies'||
                    k==='guild_raids_chrono_alloy');
                if(!shown.length)continue;
                cycleEstimates.push({
                    building:String(def.name||'unknown').slice(0,90),
                    outputPerCycle:Object.fromEntries(shown.map(x=>[x,q.estimate.output[x]])),
                    optionTime:q.estimate.optionTime,
                    optionTimeUnit:q.estimate.optionTimeUnit,
                    paybackCyclesByResource:q.cycles,
                    wholeInvestmentPaybackVerified:false
                });
            }
        }
        const placements=[];
        if(complete) {
            const prefs=settings();
            const rawReserves=prefs.profile==='donor'?readReserves(prefs):{};
            const reserves={};
            for(const [key,value] of Object.entries(rawReserves))
                if(valid(value))reserves[key]=value;
            const ranked=globalThis.QISettlementAdvisor.rankBuilds(meta,prefs.profile,
                prefs.profile==='donor'?'supplies':'chrono_alloy',
                state.stock.guild_raids_total_population,
                state.stock.guild_raids_happiness,state.stock,reserves);
            const ordered=ranked.filter(c=>c.grossAffordable===true)
                .concat(ranked.filter(c=>c.grossAffordable===false));
            for(const candidate of ordered.slice(0,12)) {
                const def=meta?.[candidate.definitionId];
                const fit=globalThis.QISettlementGeometry.probeFit(
                    state.map.layoutIndex,def,5
                );
                placements.push({
                    building:candidate.name,
                    grossAffordable:candidate.grossAffordable,
                    populationOK:candidate.populationOK,
                    geometryStatus:fit.status,
                    positionsObserved:fit.positionsFound,
                    roadConnectivity:fit.roadConnectivity,
                    verifiedPlacement:false
                });
            }
        }
        let hoursRemaining=null;
        if(typeof state.seasonEnd==='number'&&
            state.seasonEnd>1000000000&&state.seasonEnd<9999999999)
            hoursRemaining=Math.max(0,Math.round((state.seasonEnd*1000-Date.now())/3600000));
        return {
            schemaVersion:1,build:BUILD,
            state:{running:state.running,difficulty:state.difficulty,
                mapFresh:complete,profile:settings().profile,
                phase:phase?.code??null,
                hoursRemainingFromRunTimestamp:hoursRemaining},
            scenario:current,
            productionReadiness:complete?globalThis.QISettlementReadiness.summarize(state.map.entities):{status:'missing-or-stale-state'},
            nodeBudget:complete?nodeBudgetCoverage():{status:'missing-or-stale-state',safeDonation:null},
            geometry:geom,
            placementCandidates:placements,
            metadata:{
                contractEvidence:contracts.report(),
                catalogCoverage:catalog,
                production:production?{
                    buildingsExamined:production.buildingsExamined,
                    options:production.options,
                    inputs:production.optionsWithQIInputs,
                    outputs:production.optionsWithQIOutputs,
                    potentialDuration:production.optionsWithPotentialDuration,
                    timeFields:production.potentialTimePaths,
                    samples:production.samples.slice(0,8),
                    timeUnitsVerified:false
                }:null,
                qiBoosts:boosts,
                productionCycleEstimates:cycleEstimates
            },
            openGates:{
                buildMenuUnlocks:'unverified',
                roadLevels:'unverified',
                geometricObstructions:'unverified',
                nodeDonationAndQA:'unverified',
                unitInventory:'unverified',
                rushCosts:'unverified',
                productionCycleTime:'unverified'
            },
            privacy:'Aggregate evidence and public building metadata only; no player ids, map coordinates or resource balances.'
        };
    }

    function sharingReport() {
        const full=diagnosticReport();
        const prod=full.metadata.production;
        const contract=full.metadata.contractEvidence;
        const allPaths=contract.structuralPaths||[];
        const relevant=/requirements|resources|cost|donat|units|actionPoints|time|production|state/;
        const paths=allPaths.filter(x=>relevant.test(x.path)).slice(0,10);
        for(const x of allPaths.slice(0,5))if(paths.length<14&&
            !paths.some(y=>y.event===x.event&&y.path===x.path))paths.push(x);
        return JSON.stringify({
            build:full.build,state:full.state,scenario:full.scenario,
            productionReadiness:full.productionReadiness,
            productionOpportunities:(()=>{
                const p=productionOpportunity();
                return p?{
                    status:p.status,counts:p.counts,
                    nearestTransitionMinutes:p.nearestTransitionMinutes,
                    heldSaleCandidates:p.counts.producing+p.counts.completed,
                    opportunities:p.opportunities.slice(0,4).map(x=>({
                        building:x.building,phase:x.phase,
                        remainingMinutes:x.remainingMinutes,
                        review:x.recommendedReview,
                        collectibleVerified:false
                    })),
                    collectedResourcesCredited:false
                }:null;
            })(),
            nodeBudget:full.nodeBudget,
            geometry:full.geometry,
            placementCandidates:full.placementCandidates.slice(0,6),
            catalog:full.metadata.catalogCoverage,
            production:prod?{
                buildingsExamined:prod.buildingsExamined,options:prod.options,
                inputs:prod.inputs,outputs:prod.outputs,
                possibleDurations:prod.potentialDuration,
                timeFields:prod.timeFields,
                examples:prod.samples.slice(0,3)
            }:null,
            qiBoosts:full.metadata.qiBoosts,
            productionCycles:full.metadata.productionCycleEstimates.slice(0,6),
            sequencePreview:(()=>{
                const p=sequencePreview();
                if(!p)return null;
                const calibration=timeEvidence();
                const hours=remainingHours();
                const bound=p.plans.length?
                    globalThis.QISettlementTiming.theoreticalPlanHorizon(
                        p.plans[0],hours,calibration):null;
                return {
                    status:p.status,planCount:p.plans.length,
                    inspectedOriginalBuildings:p.inspectedOriginalBuildings,
                    doubleSalePairsInspected:p.doubleSalePairsInspected,
                    returnedDoubleSalePlans:p.plans.filter(plan=>
                        plan.steps.filter(step=>step.type==='sell').length===2).length,
                    skippedBusySaleCandidates:p.skippedBusySaleCandidates,
                    jointFootprintFitPlans:p.plans.filter(plan=>
                        plan.placementEvidence==='geometry-sequence-fit').length,
                    candidateDefinitions:p.candidateDefinitions,
                    depth:p.sequenceDepth,ranking:p.ranking,
                    timingEvidence:{
                        status:calibration.status,unit:calibration.unit,
                        samples:calibration.samples,
                        distinctDurations:calibration.distinctDurations,
                        timeUnitVerified:calibration.timeUnitVerified
                    },
                    horizonProjection:bound?{
                        status:bound.status,
                        unitHypothesis:bound.unitHypothesis||null,
                        constructionTimeVerified:false,
                        spendableGains:null
                    }:null,
                    blockers:p.blockers,
                    donorInvestmentProtection:(()=>{
                        if(settings().profile!=='donor')return null;
                        const b=globalThis.QISettlementDonationBudget.budget({
                            stock:state.stock,plans:p.plans,
                            manualReserves:readReserves(settings())
                        });
                        return {status:b.status,evaluatedPlans:b.evaluatedPlans||0,
                            manualReserveComplete:!!b.manualReserveComplete,
                            actualDonationSafe:false,
                            nodeCostVerified:!!b.nodeCostVerified};
                    })()
                };
            })(),
            evidence:{
                status:contract.status,eventCounts:contract.eventCounts,
                truncatedTraversals:contract.truncatedTraversals,
                nodeResourceBundles:contract.nodeResourceBundles,
                paths
            },
            openGates:full.openGates
        },null,2);
    }

    function timeEvidence() {
        return globalThis.QISettlementTiming.inspect(
            state.map?.entities,FH.Main?.CityEntities);
    }
    function remainingHours() {
        const end=state.seasonEnd;
        if(typeof end!=='number'||end<=1000000000||end>=9999999999)
            return null;
        return Math.max(0,(end*1000-Date.now())/3600000);
    }

    function productionOpportunity() {
        if(FH.ActiveMap!=='guild_raids'||!state.running||
            state.mapStale||!state.map?.entities||!state.stock)
            return null;
        const sums=typeof Boosts!=='undefined'?Boosts.Sums||{}:{};
        return globalThis.QISettlementOpportunity.assess({
            entities:state.map.entities,
            definitions:FH.Main?.CityEntities,
            stock:state.stock,
            boosts:sums,
            horizonHours:remainingHours()
        });
    }

    function sequencePreview() {
        if(FH.ActiveMap!=='guild_raids'||!state.running||state.mapStale||
            !state.map?.entities||!state.stock)return null;
        const prefs=settings();
        const reserves={};
        if(prefs.profile==='donor') {
            const provided=readReserves(prefs);
            for(const [key,value] of Object.entries(provided))
                if(valid(value))reserves[key]=value;
        }
        const sums=typeof Boosts!=='undefined'?Boosts.Sums||{}:{};
        const signature=[
            state.advisorRevision,prefs.profile,
            prefs.reserveMoney,prefs.reserveSupplies,
            sums.guild_raids_coins_production,
            sums.guild_raids_supplies_production,
            sums.guild_raids_action_points_collection,
            sums.guild_raids_action_points_capacity
        ].join('|');
        if(state.sequenceCache?.signature===signature)
            return state.sequenceCache.result;
        const result=globalThis.QISettlementSequence.explore({
            stock:state.stock,
            entities:state.map.entities,
            definitions:FH.Main?.CityEntities,
            geometryIndex:state.map.layoutIndex,
            profile:prefs.profile,
            reserves,
            boosts:sums,
            maxDepth:2
        });
        state.sequenceCache={signature,result};
        return result;
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
        panel.append($('<p class="qi-support-build"/>').text('Vývojové sestavení: '+BUILD));

        panel.append(section('Automatická analýza aktuální osady'));
        const decision=advice(preferences.profile,preferences);
        const phaseNames={
            'foundation':'základní ekonomika',
            'early-rebuild':'počáteční přestavby',
            'rope':'rozvoj Rope a expanzí',
            'expansion':'pokročilé rozšiřování',
            'advanced':'pokročilá ekonomika',
            'unknown':'nelze spolehlivě určit'
        };
        if(!decision) {
            panel.append(hint('Není k dispozici čerstvá mapa a zásoby QI. Pro konkrétní doporučení znovu otevři QI osadu.'));
        } else {
            panel.append(row('Odhad rozvojové fáze',
                (phaseNames[decision.phase.code]||'neznámá')+
                ' · jistota '+(decision.phase.confidence==='medium'?'střední':'nízká')));
            panel.append(hint('Důvod: '+decision.phase.reason));
            const focusNames={
                'unverified':'neověřeno',
                'unknown':'nezjištěno',
                'money':'QI mince',
                'supplies':'QI zásoby',
                'chrono_alloy':'Chrono Alloy'
            };
            panel.append(row('Ekonomické omezení',
                focusNames[decision.focus.name] || decision.focus.name));
            panel.append(hint(decision.focus.reason));
            const coverage=globalThis.QISettlementAdvisor.catalogCoverage(FH.Main?.CityEntities);
            if(coverage) {
                panel.append(row('QI definice / nalezené ceny',
                    coverage.qiCatalogCount+' / '+coverage.priced));
                if(!coverage.pricedRecommendationsPossible)
                    panel.append(hint('Ceny staveb zatím nejsou z dostupných definic potvrzené. Návrhy jsou jen kandidáti, nikoli ověřené pořadí investic.'));
            }
            const recList=$('<ol class="qi-support-advice"/>');
            for(const rec of decision.recommendations.slice(0,6)){
                const item=$('<li/>')
                    .append($('<strong/>').text(rec.title))
                    .append($('<p/>').text(rec.why))
                    .append($('<small/>').text(rec.limitations));
                recList.append(item);
            }
            panel.append(recList);
            if (preferences.profile==='donor' && decision.grossBuilds?.length) {
                panel.append(hint('Predbezne financne kryte stavby ze skladu (nikoli schvalene investice): '+
                    decision.grossBuilds.slice(0,5).map(x=>x.name).join(', ')+'.'));
            }

            if(decision.blockedBuilds?.length) {
                const blocked=decision.blockedBuilds.filter(b=>
                    b.grossAffordable===false || b.populationOK===false);
                if(blocked.length)
                    panel.append(hint('Nedostupné už podle samotného skladu nebo populace: '+
                        blocked.slice(0,3).map(b=>{
                            const missing=Object.entries(b.grossShortage||{})
                                .map(([k,v])=>k.replace('guild_raids_','')+': '+numberText(v));
                            return b.name+(missing.length?' (chybí '+missing.join(', ')+')':'');
                        }).join(', ')+
                        '. Schodky podle aktuálních zásob jsou níže.'));
            }
            if(decision.recommendations.length===0)
                panel.append(hint(preferences.profile==='donor' &&
                    (preferences.reserveMoney==='' || preferences.reserveSupplies==='') ?
                    'Bez úplných rezerv nelze potvrdit bezpečnou investici ani darování. Orientační rozpočet ze skladu najdeš níže.' :
                    'Z dostupných dat zatím nevychází bezpečně proveditelné doporučení.'));
            if(decision.blockers.length)
                panel.append(hint('Co brání přesné optimalizaci: '+decision.blockers.join('; ')));
            panel.append(hint('Kandidáti nejsou příkazy k demolici ani potvrzeně dostupné stavby.'));
        }

        panel.append(section('Ekonomické varianty z aktuálních cen'));
        if(!decision) {
            panel.append(hint('Scénáře nelze počítat bez aktuální mapy, zásob a aktivního QI běhu.'));
        } else {
            const protectedAmounts=readReserves(preferences);
            const reserves={};
            const reserveComplete=valid(protectedAmounts.guild_raids_money) &&
                valid(protectedAmounts.guild_raids_supplies);
            if(preferences.profile==='donor') {
                for(const [key,value] of Object.entries(protectedAmounts))
                    if(valid(value))reserves[key]=value;
                if(!reserveComplete)
                    panel.append(hint('Donor: orientační rozpočet ze současných zásob. Nezadané rezervy se NEPOVAŽUJÍ za nulové ani za schválení výstavby či darování. Zadané dílčí rezervy zůstávají chráněné.'));
                else
                    panel.append(hint('Rozpočtové varianty po odečtení ručně zadaných rezerv. Rezerva na další etapy a darovací uzly ještě není automaticky vypočítaná.'));
            }
            const scenarios=globalThis.QISettlementSimulator.explore({
                stock:state.stock,entities:state.map.entities,
                definitions:FH.Main?.CityEntities,
                profile:preferences.profile,reserves
            });
            const scenarioList=$('<ol class="qi-support-scenarios"/>');
            for(const q of scenarios.builds.slice(0,4)){
                const title=preferences.profile==='donor' && !reserveComplete ?
                    'Předběžně kryto ze skladu: '+q.name :
                    'Finančně dostupná varianta: '+q.name;
                const result=q.financiallyCovered===null?'Cena nebo zásoba neznámá':
                    q.financiallyCovered?'Kryto v tomto modelu':'Nedostatek zdrojů';
                const entry=$('<li/>').append($('<strong/>').text(title+' — '+result));
                const costs=Object.entries(q.cost||{})
                    .map(([k,v])=>k.replace('guild_raids_','')+': '+numberText(v)).join(', ');
                entry.append($('<p/>').text('Stavební cena (metadata): '+costs));
                if(!q.financiallyCovered){
                    const deficits=Object.entries(q.shortages||{})
                        .map(([k,v])=>k.replace('guild_raids_','')+': '+numberText(v)).join(', ');
                    if(deficits)entry.append($('<small/>').text('Chybí: '+deficits));
                }
                if(q.financiallyCovered) {
                    const leftovers=Object.entries(q.afterCost||{})
                        .map(([k,v])=>k.replace('guild_raids_','')+': '+numberText(v)).join(', ');
                    if(leftovers)entry.append($('<small/>').text('Zbude po stavbě: '+leftovers));
                }
                const after=q.afterCompletion;
                entry.append($('<small/>').text(
                    'Volná populace během stavby: '+numberText(q.duringConstruction.availablePopulation)+
                    ' · po dokončení: '+numberText(after.availablePopulation)+
                    ' · euforie po dokončení: '+numberText(after.euphoria)
                ));
                if(q.populationViable===false)
                    entry.append($('<small/>').text('Nedostatečná populace – tento scénář neprovádět.'));
                scenarioList.append(entry);
            }
            if(scenarios.provisionalBuilds?.length) {
                panel.append($('<h4/>').text('Předběžné rozpočtové varianty – chybí úplné údaje'));
                const previews=$('<ul class="qi-support-blocked"/>');
                for(const q of scenarios.provisionalBuilds.slice(0,5)) {
                    const missing=q.missing.includes('currentPopulationHappiness') ?
                        'neúplný údaj o celkové populaci nebo euforii' :
                        'neúplná data pro celkové posouzení';
                    previews.append($('<li/>').text(q.name+' – cena kryta, '+missing+
                        '. Proveditelnost dosud neověřena.'));
                }
                panel.append(previews);
            }
            for(const q of scenarios.replacements.slice(0,3)){
                const entry=$('<li/>')
                    .append($('<strong/>').text('Vyměnit: '+q.remove+' → '+q.add))
                    .append($('<small/>').text(
                        'Po prodeji volná populace: '+numberText(q.afterSale.availablePopulation)+
                        ' · euforie: '+numberText(q.afterSale.euphoria)+
                        ' · cena nové stavby v QI mincích: '+numberText(q.build.cost?.guild_raids_money)+'.'
                    ))
                    .append($('<small/>').text(
                        'Možná úspora plochy: '+numberText(q.areaChange)+
                        ' polí; souvislý prostor a cesty neověřeny.'
                    ));
                scenarioList.append(entry);
            }
            panel.append(scenarioList);
            if(preferences.profile==='donor' && !reserveComplete &&
                scenarios.builds.length)
                panel.append(hint('Předběžně krytá stavba stále může spotřebovat zdroje potřebné později. Nejde o doporučení ji okamžitě postavit.'));
            if(scenarios.blockedBuilds?.length) {
                panel.append($('<h4/>').text('Finančně nebo populačně nedostupné stavby'));
                const blocked=$('<ul class="qi-support-blocked"/>');
                for(const q of scenarios.blockedBuilds.slice(0,5)) {
                    const missing=Object.entries(q.shortages||{})
                        .map(([k,v])=>k.replace('guild_raids_','')+': '+numberText(v))
                        .join(', ');
                    const why=q.financiallyCovered===null ? 'neznámá cena nebo zásoba' :
                        !q.financiallyCovered ? (missing ? 'chybí '+missing : 'nedostatek prostředků') :
                        'nedostatečná populace';
                    blocked.append($('<li/>').text(q.name+' — '+why));
                }
                panel.append(blocked);
                panel.append(hint('Tyto stavby nejsou návrhy k okamžité výstavbě.'));
            }
            if(!scenarios.builds.length && !scenarios.replacements.length &&
                !(scenarios.provisionalBuilds?.length)) {
                const reason=scenarios.blockedBuilds?.length ?
                    'Z hodnocených variant zatím žádná neprošla rozpočtovými a populačními omezeními; nedostupné možnosti jsou vypsány výše.' :
                    'Simulátor zatím nemá úplný vstup pro tyto varianty. Neznamená to, že ve hře nelze nic postavit.';
                panel.append(hint(reason));
            }
            panel.append(hint('POZOR: Jde o rozpočtovou simulaci, ne optimalizované pořadí akcí. Nabídka, prostor, cesty, délka výstavby a zbývající QI čas nejsou zatím ověřené.'));
        }

        panel.append(section('Scénáře až dvou investičních rozhodnutí'));
        const sequence=sequencePreview();
        if(!sequence) {
            panel.append(hint('Pro navazující rozhodování chybí aktuální mapa nebo sklad.'));
        } else if(sequence.plans.length===0) {
            panel.append(hint('V rozsahu dvou kroků nebyl nalezen pozitivní ekonomický scénář splňující známá omezení.'));
        } else {
            panel.append(hint('Porovnání variant se sdíleným rozpočtem; přestavba může zahrnout prodej i nákup. Index je orientační, není to ověřená optimální strategie ani doporučení k provedení. Nejsou potvrzené cesty, nabídka, čas výroby a ceny uzlů.'));
            const ranked=$('<ol class="qi-support-scenarios"/>');
            for(const [index,plan] of sequence.plans.slice(0,3).entries()) {
                const item=$('<li/>');
                item.append($('<strong/>').text('Varianta '+(index+1)+
                    ' · heuristický index '+plan.heuristicScore.toFixed(3)));
                item.append($('<p/>').text(plan.steps.map(step=>
                    (step.type==='sell'?'Prodat ':'Postavit ')+step.building
                ).join(' → ')));
                const costs=Object.entries(plan.spent).map(([key,value])=>
                    key.replace('guild_raids_','')+': '+numberText(value)).join(', ');
                if(costs)item.append($('<small/>').text('Celková investice: '+costs));
                const produced=Object.entries(plan.productionDeltaPerCycle)
                    .filter(([key,value])=>value!==0)
                    .map(([key,value])=>key.replace('guild_raids_','')+': '+
                        (value>=0?'+':'')+numberText(Math.abs(value))+
                        (value<0?' (pokles)':' (přírůstek)')).join(', ');
                if(produced)item.append($('<small/>').text('Odhad čisté změny výnosu za cyklus: '+produced));
                item.append($('<small/>').text(
                    'Minimum volné populace během kroků: '+
                    numberText(plan.minFreePopulation)+
                    ' · euforie nejméně '+plan.minEuphoriaFactor.toLocaleString('cs-CZ')+'×'));
                const layoutText=plan.placementEvidence==='geometry-sequence-fit'?
                    'Obě stavby se geometricky vejdou; cesty a nabídka neověřeny.' :
                    plan.placementEvidence==='unknown'?
                    'Plochu pro společnou výstavbu nelze z aktuální mapy potvrdit.' :
                    'Prostorové podmínky nejsou potvrzené.';
                item.append($('<small/>').text(layoutText));
                if(preferences.profile==='donor' &&
                    plan.donorUnallocatedAfterManualReserve) {
                    const remain=Object.entries(plan.donorUnallocatedAfterManualReserve)
                        .map(([key,value])=>key.replace('guild_raids_','')+
                            ': '+numberText(value)).join(', ');
                    item.append($('<small/>').text('Zbytek nad ručně chráněnou rezervou: '+
                        remain+' (není schváleno k darování)'));
                }
                ranked.append(item);
            }
            panel.append(ranked);
            const provenShape=sequence.plans.filter(plan=>
                plan.placementEvidence==='geometry-sequence-fit').length;
            if(provenShape)
                panel.append(hint('Společný půdorys vychází u '+numberText(provenShape)+
                    ' z nejlépe hodnocených variant. Nejde o potvrzené umístění ve hře: cesty, úroveň silnic a stavební nabídka zůstávají neověřené.'));
            if(sequence.skippedBusySaleCandidates>0)
                panel.append(hint('Před prodejem chráním '+numberText(sequence.skippedBusySaleCandidates)+
                    ' budov s probíhající nebo dokončenou produkcí. Nezapočtený sběr nesmí zmizet při přestavbě.'));
            if(preferences.profile==='donor'&&sequence.plans.length) {
                const observedReserves=readReserves(preferences);
                const donorBudget=globalThis.QISettlementDonationBudget.budget({
                    stock:state.stock,
                    plans:sequence.plans,
                    manualReserves:observedReserves
                });
                if(donorBudget.investmentBuffer) {
                    panel.append($('<h4/>').text('Ochrana zdrojů pro další přestavby'));
                    for(const source of [moneyKey,suppliesKey,'guild_raids_chrono_alloy']) {
                        const entry=donorBudget.investmentBuffer[source];
                        if(!entry)continue;
                        panel.append(row(source.replace('guild_raids_','')+
                            ' · maximální investiční náklad',numberText(entry.reservedForInvestment)));
                        if(entry.manualReserve!==null)
                            panel.append(row(source.replace('guild_raids_','')+
                                ' · ruční rezerva',numberText(entry.manualReserve)));
                    }
                    panel.append(hint('Plán chrání nejvyšší cenu mezi porovnávanými variantami; hodnoty nad rezervou nejsou bezpečná částka k darování. Ceny a QA konkrétního uzlu nejsou ověřené.'));
                }
            }
            const hours=remainingHours();
            const evidence=timeEvidence();
            if(hours!==null) {
                panel.append(row('Zbývající čas QI (odhad)',
                    numberText(Math.floor(hours))+' h'));
                if(evidence.status!=='unit-corroborated') {
                    panel.append(hint('Délku výrobního cyklu zatím nelze s dostatečnou jistotou kalibrovat vůči času hry. Proto nepočítám hodinovou návratnost ani nepovažuji výrobu za okamžitě dostupné zásoby.'));
                }else {
                    const firstPlan=sequence.plans[0];
                    const projection=globalThis.QISettlementTiming.theoreticalPlanHorizon(
                        firstPlan,hours,evidence);
                    if(projection.status==='zero-delay-comparison') {
                        const entries=Object.entries(projection.possibleResourceDelta)
                            .map(([key,value])=>key.replace('guild_raids_','')+
                                ': '+(value>=0?'+':'−')+numberText(Math.abs(value)));
                        if(entries.length)
                            panel.append(hint('Hypotetická čistá změna produkce při nulové době výstavby (nejde o horní mez ani garantovaný výnos): '+
                                entries.join(', ')+'. Není to dostupný sklad ani bezpečný výnos.'));
                    } else
                        panel.append(hint('Zatím chybí některé časy výrobních možností; hodinový výhled proto nelze sestavit.'));
                }
            }
        }

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

        panel.append(section('Výroba a nejbližší sběr'));
        const collection=productionOpportunity();
        if(collection?.opportunities?.length) {
            const pending=collection.opportunities.filter(x=>
                x.phase==='completed-state').length;
            if(pending)
                panel.append(hint('Než budeš tyto budovy prodávat, ověř sběr u '+
                    numberText(pending)+' budov ve stavu dokončené produkce.'));
            const listed=collection.opportunities.slice(0,3);
            for(const item of listed) {
                const notice=item.phase==='completed-state'?
                    'Dokončená produkce; nejprve ověř možnost sběru.' :
                    item.remainingMinutes!==null&&item.remainingMinutes<=180?
                    'Přechod přibližně za '+numberText(item.remainingMinutes)+
                        ' min; s prodejem zatím počkej.' :
                    'Probíhá produkce; její ztrátu zatím neumíme ocenit.';
                panel.append(hint(item.building+': '+notice));
            }
            if(collection.omittedOpportunities)
                panel.append(hint('Dalších '+numberText(collection.omittedOpportunities)+
                    ' produkčních stavů není ve zkráceném přehledu.'));
        }
        if(!state.mapStale && state.map?.entities) {
            const summary=globalThis.QISettlementReadiness.summarize(state.map.entities);
            panel.append(row('Právě běžící výroby',numberText(summary.active)));
            if(summary.nearestTransitionMinutes!==null) {
                panel.append(row('Nejbližší přechod produkce',
                    numberText(summary.nearestTransitionMinutes)+' min'));
                panel.append(row('Výroby do 3 hodin',numberText(summary.within3Hours)));
                panel.append(hint('Jde o čas do změny stavu, nikoli o potvrzený výnos. Až po skutečném sběru se prostředky započítají do investičního rozpočtu.'));
            } else
                panel.append(hint('Z aktuální mapy nevyplývá čas nejbližšího sběru. Nedosazuji odhad za chybějící data.'));
        } else {
            panel.append(hint('Časový přehled čeká na čerstvou QI mapu.'));
        }
        panel.append(section('Stav mapy a výstavby'));
        if (state.mapStale || !state.map) {
            panel.append(hint('Mapa není aktuálně potvrzená. Pro ověření staveb znovu vstup do QI osady. Údaje ze skladu zůstávají samostatné.'));
        } else {
            const layout=globalThis.QISettlementGeometry.summarize(state.map.layoutIndex);
            panel.append(row('Geometrická mapa',layout.status==='geometry-indexed'?
                'ověřena struktura':'nedostatečné údaje'));
            if(layout.status==='geometry-indexed') {
                panel.append(row('Geometricky neobsazená pole',numberText(layout.freeTiles)));
                panel.append(hint('Volná pole nezaručují umístění konkrétní budovy. Cesty, překážky a stavební nabídku ověřujeme zvlášť.'));
            }
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
            if(state.running && !state.mapStale && state.stock) {
                const nodes=nodeBudgetCoverage();
                if(nodes.coverage) {
                    panel.append(row('QI uzly s jednoznačným kandidátem ceny',
                        numberText(nodes.coverage.explicitlyPricedCandidates)));
                    panel.append(row('Nezařazené surovinové balíčky uzlů',
                        numberText(nodes.coverage.unclassifiedResourceBundles)));
                    if(nodes.coverage.explicitlyPricedCandidates)
                        panel.append(hint('Předběžně pokryté zdroji a plánovací rezervou: '+
                            numberText(nodes.coverage.protectedBudgetCovered)+
                            ' uzlů. Jde pouze o výpočet podle možných nákladů z mapy, ne o schválení darování.'));
                }
            }
            panel.append(hint('Přesnou cenu konkrétního QI uzlu, jeho odemčení a spotřebu Quantum Actions zatím nelze spolehlivě odvodit; nic proto automaticky nedarujeme.'));
            panel.append(hint('Zadej minimální částku, kterou potřebuješ ponechat pro další výstavbu. Bez rezervy nepočítáme bezpečný přebytek. Jednotlivé stavební ceny už umíme načíst z metadat, ale plán navazujících staveb ani cenu konkrétního donačního uzlu ještě automaticky nesestavujeme.'));
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
                panel.append(hint('Pozor: Přebytek nad ručně zadanou rezervou není ověřená bezpečná částka k darování. Nezahrnuje automatickou rezervu na navazující stavební plán ani náklady a Quantum Actions konkrétního uzlu.'));
            } else {
                panel.append(hint('Přebytek zatím nepočítám — nejsou zadané obě rezervy.'));
            }
        } else {
            panel.append(section('Fighter — připravenost'));
            panel.append(hint('Bojové jednotky, typy nepřátel a bojové bonusy zatím nemáme ověřené. Dokud je nezískáme, panel nebude doporučovat nábor ani bojovou přestavbu.'));
            panel.append(row('Jednotky / bojové bonusy', 'nezjištěno'));
        }
        panel.append(section('Referenční návod — volitelná etapa'));
        const strategyData = globalThis.QISettlementStrategies;
        const stagePicker = $('<select id="qi-support-stage"/>');
        for (const code of strategyData.stages)
            stagePicker.append($('<option/>').attr('value',code).text(strategyData.stageNames[code]));
        stagePicker.val(preferences.stage);
        stagePicker.on('change', () => {
            save({...settings(),stage:String(stagePicker.val())});
            render();
        });
        panel.append($('<label class="qi-support-stage"/>')
            .text('Etapa: ').append(stagePicker));
        const steps = $('<ol class="qi-support-steps"/>');
        for (const instruction of strategyData.getSteps(preferences.profile, preferences.stage))
            steps.append($('<li/>').text(instruction));
        panel.append(steps);
        panel.append(hint('Zdroj: hráčský návod ' + strategyData.version +
            '. Stav kroků a ceny nejsou automaticky ověřené; etapu vybíráš ručně.'));

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
        state.advisorRevision++;
        state.advisorCache = null;
        state.lastSource = 'getPlayerResourceBag';
        render();
    });
    FH.proxy.addHandler('ResourceService','getPlayerResources',data=>{
        const resources = core.normalizeQIStock(data?.responseData);
        if (Object.keys(resources).length === 0) return;
        state.stock = resources;
        state.advisorRevision++;
        state.advisorCache = null;
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
        contracts.observe('qi-run-state',response);
        render();
    });
    FH.proxy.addHandler('GuildRaidsMapService','getOverview',data=>{
        contracts.observe('qi-map-overview',data?.responseData);
        nodeCandidates=globalThis.QISettlementNodeBudget.extract(data?.responseData);
    });
    FH.proxy.addHandler('ArmyUnitManagementService','getArmyInfo',data=>{
        if(FH.ActiveMap==='guild_raids')
            contracts.observe('qi-unit-info',data?.responseData);
    });
    FH.proxy.addHandler('CityMapService','getCityMap',data=>{
        const response = data?.responseData;
        if (response?.gridId !== 'guild_raids') return;
        const entities = response?.entities;
        state.map = {
            entities:Array.isArray(entities)?entities:null, // memory only; never persisted or reported
            layoutIndex:globalThis.QISettlementGeometry.indexMap(
                response?.unlocked_areas,entities,FH.Main?.CityEntities),
            summary:core.normalizeMap(response),
            derived:core.deriveEconomy(entities,FH.Main?.CityEntities),
            audit:core.auditBuildingStates(entities,FH.Main?.CityEntities)
        };
        state.mapStale = false;
        state.advisorRevision++;
        state.advisorCache = null;
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
        ScenarioStatus: scenarioStatus,
        ShareReport() { return sharingReport(); },
        ReportToConsole() {
            const report=diagnosticReport();
            console.log('QI Settlement Support - combined diagnostic '+BUILD);
            console.log(JSON.stringify(report,null,2));
            return 'Souhrnný report vypsán do konzole. Zkopíruj výstup JSON.';
        },
        // Explicit opt-in metadata inspection; returns only aggregate safe paths,
        // no source objects, building ids or individual player data.
        PriceDiscovery: () => FH.ActiveMap === 'guild_raids' ?
            globalThis.QISettlementAdvisor.priceSchemaDiscovery(FH.Main?.CityEntities) : null,
        CostSamples: () => FH.ActiveMap === 'guild_raids' ?
            globalThis.QISettlementAdvisor.priceSamples(FH.Main?.CityEntities) : null,
        // Snapshot excludes internal world/player identifiers and arbitrary game responses.
        Status: () => ({
            build:BUILD,
            running:state.running, difficulty:state.difficulty,
            hasStock:!!state.stock, mapStale:state.mapStale,
            hasMap:!!state.map, selectedProfile:settings().profile,
            reserveMode:settings().profile==='donor' ?
                (settings().reserveMoney!=='' && settings().reserveSupplies!=='' ?
                    'manual-protected' : 'gross-only') : 'not-applicable',
            selectedStage:settings().stage,
            autoPhase:(FH.ActiveMap==='guild_raids' && !state.mapStale && state.map?.entities)?
                globalThis.QISettlementAdvisor.inferPhase(
                    globalThis.QISettlementAdvisor.features(state.map.entities,FH.Main?.CityEntities),
                    state.map.summary?.unlockedAreaCount
                ):null,
            catalogCoverage:globalThis.QISettlementAdvisor.catalogCoverage(FH.Main?.CityEntities)
        })
    });
})();
