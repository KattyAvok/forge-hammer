/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Read-only, bounded two-step economic QI sequence explorer.
 * Financial/state feasibility is never confused with actual game placement,
 * active shop unlocks, production completion, rush availability or donation.
 */
(function(root) {
    'use strict';
    const advisor=root.QISettlementAdvisor ||
        (typeof module==='object'&&module.exports&&typeof require==='function'
            ? require('../../qi-settlement-advisor/js/qi-settlement-advisor.js'):null);
    const production=root.QISettlementProduction ||
        (typeof module==='object'&&module.exports&&typeof require==='function'
            ? require('../../qi-settlement-production/js/qi-settlement-production.js'):null);
    const geometry=root.QISettlementGeometry ||
        (typeof module==='object'&&module.exports&&typeof require==='function'
            ? require('../../qi-settlement-geometry/js/qi-settlement-geometry.js'):null);
    const money='guild_raids_money',supplies='guild_raids_supplies',
        alloy='guild_raids_chrono_alloy',available='guild_raids_population',
        total='guild_raids_total_population',happy='guild_raids_happiness';
    const moneyKeys=[money,supplies,alloy];
    const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
    const fin=x=>typeof x==='number'&&Number.isFinite(x);
    const bounded=n=>Number.isSafeInteger(n)&&n>=0;
    const maxCandidate=12,maxResult=8,maxSearch=500;
    const sanitize=name=>String(name||'budova').slice(0,85);
    const factor=(h,p)=>{
        if(!valid(h)||!valid(p)||p<=0)return null;
        const ratio=h/p;
        return ratio<=.2?.2:ratio<=.6?.6:ratio<=.8?.8:
            ratio<=1.2?1:ratio<=1.4?1.1:ratio<2?1.2:1.5;
    };
    const snapshot=s=>({...s,stock:{...s.stock},increments:{...s.increments},
        qa:{...s.qa},
        totalCosts:{...s.totalCosts},protectedReserves:{...s.protectedReserves},
        steps:s.steps.slice(),
        usedOriginals:new Set(s.usedOriginals)});
    function effectAndCycle(def,stock,boosts) {
        const e=advisor.effects(def);
        if(!e)return null;
        const estimate=production.estimateCycle(def,stock,boosts);
        const yieldDelta=estimate.status==='estimated-cycle'?estimate.net:{};
        const boostKeys=['guild_raids_action_points_collection',
            'guild_raids_action_points_capacity'];
        const bonus={};
        for(const b of e.bonuses){
            if(boostKeys.includes(b.type)&&fin(b.value))
                bonus[b.type]=(bonus[b.type]||0)+b.value;
        }
        return {e,yieldDelta,cycleKnown:estimate.status==='estimated-cycle',
            rawOptionTime:estimate.status==='estimated-cycle'?estimate.optionTime:null,bonus};
    }
    function addDelta(target,delta,multiple=1) {
        for(const [k,v] of Object.entries(delta))
            if(fin(v))target[k]=(target[k]||0)+v*multiple;
    }
    function applyBuild(state,key,def,reserves,boosts) {
        const price=advisor.priceEvidence(def);
        const fx=effectAndCycle(def,state.stock,boosts);
        if(price.status!=='metadata-candidate'||!price.cost||!fx)return null;
        const newState=snapshot(state);
        const spending={},blocked=[];
        for(const [k,v] of Object.entries(price.cost)) {
            const held=newState.stock[k];
            if(!valid(held)||!valid(v))return null;
            const buffer=reserves[k]??0;
            if(!valid(buffer))return null;
            if(held<v+buffer)blocked.push(k);
            spending[k]=v;
        }
        if(blocked.length)return null;
        if(![available,total,happy].every(k=>valid(newState.stock[k])))return null;
        const population=fx.e.population,euphoria=fx.e.euphoria;
        if(!fin(population)||!fin(euphoria))return null;
        const interim=newState.stock[available]+Math.min(0,population);
        if(interim<0)return null;
        const postAvailable=newState.stock[available]+population;
        const postTotal=newState.stock[total]+Math.max(0,population);
        const postHappiness=newState.stock[happy]+euphoria;
        if(postAvailable<0||postTotal<=0||postHappiness<0)return null;
        const before=factor(newState.stock[happy],newState.stock[total]);
        const during=factor(newState.stock[happy],newState.stock[total]);
        const after=factor(postHappiness,postTotal);
        if(before===null||during===null||after===null)return null;
        if(during+1e-9<newState.floor||after+1e-9<newState.floor)return null;
        for(const [k,v] of Object.entries(spending)) {
            newState.stock[k]-=v;
            newState.totalCosts[k]=(newState.totalCosts[k]||0)+v;
        }
        newState.stock[available]=postAvailable;
        newState.stock[total]=postTotal;
        newState.stock[happy]=postHappiness;
        newState.minFreePopulation=Math.min(newState.minFreePopulation,interim,postAvailable);
        newState.minEuphoriaFactor=Math.min(newState.minEuphoriaFactor,during,after);
        addDelta(newState.increments,fx.yieldDelta);
        addDelta(newState.qa,fx.bonus);
        newState.steps.push({type:'build',building:sanitize(def.name),
            duringPopulation:interim,afterPopulation:postAvailable,
            afterEuphoriaFactor:after,
            cost:{...spending},productionGain:fx.cycleKnown?{...fx.yieldDelta}:null,
            rawProductionOptionTime:fx.rawOptionTime,
            timeToComplete:'unverified',gameActionVerified:false});
        newState.lastBuilding=key;
        return newState;
    }
    function applySell(state,key,def,boosts={}) {
        const info=effectAndCycle(def,state.stock,boosts);
        if(!info)return null;
        const fx=info.e;
        // Selling a building with any QI bonus is unpriced risk.
        if(fx.bonuses.some(b=>b.value!==0))return null;
        const n=snapshot(state),pop=fx.population,h=fx.euphoria;
        if(!fin(pop)||!fin(h))return null;
        if(![available,total,happy].every(k=>valid(n.stock[k])))return null;
        const av=n.stock[available]-pop;
        const cap=n.stock[total]-Math.max(0,pop);
        const joy=n.stock[happy]-h;
        if(av<0||cap<=0||joy<0)return null;
        const ratio=factor(joy,cap);
        if(ratio===null||ratio+1e-9<n.floor)return null;
        n.stock[available]=av;n.stock[total]=cap;n.stock[happy]=joy;
        // Lost production must be subtracted from prospective gains.
        if(info.cycleKnown)addDelta(n.increments,info.yieldDelta,-1);
        n.minFreePopulation=Math.min(n.minFreePopulation,av);
        n.minEuphoriaFactor=Math.min(n.minEuphoriaFactor,ratio);
        n.usedOriginals.add(key);
        n.steps.push({type:'sell',building:sanitize(def.name),
            populationAfter:av,euphoriaFactorAfter:ratio,
            productionLoss:info.cycleKnown?{...info.yieldDelta}:null,
            rawProductionOptionTime:info.rawOptionTime,
            refunds:'not-assumed',gameActionVerified:false});
        return n;
    }
    function candidateDefinitions(definitions,profile,stock,boosts) {
        const ranked=advisor.rankBuilds(definitions,profile,
            profile==='donor'?'supplies':'chrono_alloy',
            stock[total],stock[happy],stock,{});
        // Include QI cultural/population candidate when those constrain
        // the city, but keep each type bounded.
        return ranked.filter(c=>c.cost&&definitions[c.definitionId])
            .slice(0,maxCandidate).map(c=>({
                key:c.definitionId,def:definitions[c.definitionId],
                area:advisor.size(definitions[c.definitionId]),
                candidate:c
            }));
    }
    function candidatesForSelling(entities,definitions,geometryIndex) {
        if(!Array.isArray(entities))return [];
        const rows=[],found=new Set();
        for(const e of entities) {
            if(rows.length>=30)break;
            const key=e?.cityentity_id,def=definitions[key],id=e?.id;
            if(!def||!advisor.size(def)||def.type==='street'||
                def.type==='main_building'||def.type==='impediment'||
                def.type==='off_grid'||/construct|building|producing|completed/i.test(e?.state?.__class__||''))
                continue;
            const fx=advisor.effects(def);
            if(!fx||fx.bonuses.some(b=>b.value!==0))continue;
            const signature=id===undefined?key+'@'+e.x+','+e.y:String(id);
            if(found.has(signature))continue;found.add(signature);
            const rect=geometry.rectOfBuilding(e,definitions);
            rows.push({key:signature,def,rect});
        }
        return rows;
    }
    function productiveImprovement(s,profile) {
        const moneyGain=s.increments[money]||0,supplyGain=s.increments[supplies]||0,
            alloyGain=s.increments[alloy]||0;
        const qa=(s.qa.guild_raids_action_points_collection||0);
        const availableDelta=s.stock[available]-s.initial[available];
        const happinessDelta=s.stock[happy]-s.initial[happy];
        if(profile==='donor')
            return moneyGain>0||supplyGain>0||qa>0||happinessDelta>0||availableDelta>0;
        return alloyGain>0||qa>0||happinessDelta>0||availableDelta>0;
    }
    function score(s,profile) {
        // Dimensionless fraction of starting holdings; heuristic, not true ROI.
        const a=s.initial;
        const normalized=k=>(s.increments[k]||0)/Math.max(1,a[k]||1);
        const capacityGain=(s.stock[available]-a[available])/Math.max(1,a[total]);
        const happinessGain=(s.stock[happy]-a[happy])/Math.max(1,a[happy]||1);
        const investmentFraction=moneyKeys.reduce((n,k)=>n+
            (s.totalCosts[k]||0)/Math.max(1,a[k]||1),0);
        const qa=(s.qa.guild_raids_action_points_collection||0)/500;
        const benefit=profile==='donor' ?
            normalized(money)+normalized(supplies)+0.5*capacityGain+0.15*happinessGain+0.03*qa :
            normalized(alloy)+capacityGain+0.15*happinessGain+0.1*qa;
        // All weights are provisional and displayed as a ranking proxy.
        return benefit-0.03*investmentFraction;
    }
    function toOutput(s,profile,geoEvidence) {
        const remaining=Object.fromEntries(moneyKeys
            .filter(k=>valid(s.stock[k])).map(k=>[k,s.stock[k]]));
        return {
            steps:s.steps,
            modeledStepCount:s.steps.length,
            remaining,
            spent:{...s.totalCosts},
            productionDeltaPerCycle:{...s.increments},
            qaBonusDeltas:{...s.qa},
            after:{totalPopulation:s.stock[total],
                freePopulation:s.stock[available],
                happiness:s.stock[happy],
                euphoriaFactor:factor(s.stock[happy],s.stock[total])},
            minFreePopulation:s.minFreePopulation,
            minEuphoriaFactor:s.minEuphoriaFactor,
            heuristicScore:Math.round(score(s,profile)*1000)/1000,
            currentPricesUsed:true,
            projectedProductionTime:'unverified',
            placementEvidence:geoEvidence,
            donationSafetyVerified:false,
            donorUnallocatedAfterManualReserve:profile==='donor' &&
                valid(s.protectedReserves[money])&&valid(s.protectedReserves[supplies]) ?
                {
                    [money]:Math.max(0,s.stock[money]-s.protectedReserves[money]),
                    [supplies]:Math.max(0,s.stock[supplies]-s.protectedReserves[supplies])
                } : null,
            executable:false
        };
    }
    function explore({
        stock,entities,definitions,profile='donor',reserves={},
        geometryIndex=null,boosts={},maxDepth=2
    }={}) {
        if(!stock||!Array.isArray(entities)||!definitions||
            ![available,total,happy].every(k=>valid(stock[k]))||
            !moneyKeys.every(k=>valid(stock[k])))
            return {status:'insufficient-economy',
                plans:[],blockers:['missing-stock-or-map']};
        const depth=Math.max(1,Math.min(2,bounded(maxDepth)?maxDepth:2));
        const floor=factor(stock[happy],stock[total]);
        if(floor===null)return {status:'insufficient-economy',plans:[],blockers:['unknown-euphoria']};
        const allowedReserves={};
        for(const [k,v] of Object.entries(reserves)) {
            if(v===null||v===undefined)continue;
            if(!valid(v))return {status:'invalid-reserve',plans:[],blockers:['invalid-reserve']};
            allowedReserves[k]=v;
        }
        const starts={stock:{...stock},initial:{...stock},
            protectedReserves:{...allowedReserves},
            floor,minFreePopulation:stock[available],minEuphoriaFactor:floor,
            increments:{},qa:{},totalCosts:{},steps:[],usedOriginals:new Set()};
        const buildingOptions=candidateDefinitions(definitions,profile,stock,boosts);
        // Productive and completed productions are deliberately excluded
        // from sale: we cannot price the uncollected production loss.
        const busySaleBuildings=entities.filter(e=>
            /ProducingState|CompletedState/i.test(String(e?.state?.__class__||''))&&
            definitions[e?.cityentity_id] &&
            !['street','main_building','impediment','off_grid']
                .includes(definitions[e.cityentity_id].type)).length;
        const sellers=candidatesForSelling(entities,definitions,geometryIndex);
        const all=[],first=[];
        for(const build of buildingOptions) {
            const n=applyBuild(starts,build.key,build.def,allowedReserves,boosts);
            if(n) {
                const fit=geometry.probeSequence(geometryIndex,[build.def]);
                if(fit.status!=='geometry-sequence-no-fit')
                    first.push({state:n,kind:'build',geometryStatus:fit.status,
                        proposedDefinitions:[build.def],removedRectangles:[]});
            }
        }
        // One demolition followed immediately by a supported purchase.
        for(const sell of sellers) {
            const before=applySell(starts,sell.key,sell.def,boosts);
            if(!before)continue;
            for(const build of buildingOptions) {
                const n=applyBuild(before,build.key,build.def,allowedReserves,boosts);
                if(!n)continue;
                const freed=sell.rect?[sell.rect]:[];
                const fit=geometry.probeSequence(geometryIndex,[build.def],freed);
                if(fit.status==='geometry-sequence-no-fit')continue;
                first.push({state:n,kind:'replace',geometryStatus:fit.status,
                    proposedDefinitions:[build.def],removedRectangles:freed});
                if(first.length>=maxSearch)break;
            }
            if(first.length>=maxSearch)break;
        }
        // Two sales may be needed to free land before one purchase.
        // Keep both demolition intermediates valid and do not assume refunds,
        // production collections, or missing geometry are known.
        const selectedSellers=sellers.slice(0,12);
        let inspectedSalePairs=0;
        for(let i=0;i<selectedSellers.length && first.length<maxSearch;i++){
            const a=selectedSellers[i];
            const afterFirst=applySell(starts,a.key,a.def,boosts);
            if(!afterFirst)continue;
            for(let j=i+1;j<selectedSellers.length && first.length<maxSearch;j++){
                inspectedSalePairs++;
                const b=selectedSellers[j];
                const afterSecond=applySell(afterFirst,b.key,b.def,boosts);
                if(!afterSecond)continue;
                const released=[a.rect,b.rect];
                if(released.some(rect=>!rect))continue;
                for(const build of buildingOptions) {
                    if(first.length>=maxSearch)break;
                    const result=applyBuild(afterSecond,build.key,build.def,
                        allowedReserves,boosts);
                    if(!result)continue;
                    const fit=geometry.probeSequence(geometryIndex,[build.def],released);
                    if(fit.status==='geometry-sequence-no-fit')continue;
                    first.push({state:result,kind:'double-sale-replacement',
                        geometryStatus:fit.status,
                        proposedDefinitions:[build.def],
                        removedRectangles:released});
                }
            }
        }
        for(const item of first) {
            if(productiveImprovement(item.state,profile))
                all.push(item);
        }
        if(depth===2) {
            // A second building can be funded only from the previous budget;
            // production does not magically happen between steps.
            const ranked=first.slice().sort((a,b)=>score(b.state,profile)-score(a.state,profile));
            for(const item of ranked.slice(0,36))
                for(const build of buildingOptions) {
                    if(all.length>=maxSearch)break;
                    const n=applyBuild(item.state,build.key,build.def,allowedReserves,boosts);
                    if(!n||!productiveImprovement(n,profile))continue;
                    const combined=geometry.probeSequence(geometryIndex,
                        item.proposedDefinitions.concat([build.def]),
                        item.removedRectangles);
                    if(combined.status==='geometry-sequence-no-fit')continue;
                    all.push({state:n,kind:'two-step',
                        geometryStatus:combined.status});
                }
        }
        // Only sort after simulating full intermediate budgets/constraints.
        all.sort((a,b)=>score(b.state,profile)-score(a.state,profile));
        const seen=new Set(),top=[];
        for(const item of all) {
            const signature=item.state.steps.map(x=>x.type+':'+x.building).join('>');
            if(seen.has(signature))continue;
            seen.add(signature);
            top.push(toOutput(item.state,profile,item.geometryStatus));
            if(top.length>=maxResult)break;
        }
        return {status:'heuristic-sequence-preview',
            profile,sequenceDepth:depth,
            candidateDefinitions:buildingOptions.length,
            inspectedOriginalBuildings:sellers.length,
            doubleSalePairsInspected:inspectedSalePairs,
            skippedBusySaleCandidates:busySaleBuildings,
            consideredVariants:first.length+all.length,
            plans:top,
            reserveMode:profile!=='donor'?'not-applicable':
                valid(reserves[money])&&valid(reserves[supplies])?
                    'manual-protected':'partial-or-gross',
            ranking:'dimensionless-heuristic; not validated ROI or global optimum',
            blockers:[
                'shop-unlocks-unverified','road-levels-unverified',
                'game-placement-unverified','cycle-time-unverified',
                'two-building-fit-does-not-verify-roads-unlocks-or-build-order',
                'node-costs-unverified','future-production-not-spent',
                'existing-production-euphoria-rebalance-unmodeled',
                'uncollected-producing-or-completed-buildings-protected-from-sale',
                'at-most-two-sales-before-purchase-no-reimbursement',
                'donation-not-safe-without-plan-and-node'
            ],
            gameActionsPerformed:false};
    }
    const api=Object.freeze({explore,applyBuild,applySell,factor});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.QISettlementSequence=api;
})(typeof globalThis!=='undefined'?globalThis:this);
