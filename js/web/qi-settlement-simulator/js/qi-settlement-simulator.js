/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Read-only QI economic scenario simulator. A financial quote is NOT a
 * validated purchase, placement, demolition, production schedule or ROI.
 */
(function(root) {
    'use strict';
    // Browser modules share QISettlementAdvisor through globalThis; native
    // Node.js tests need an explicit CommonJS dependency.
    const advisor=root.QISettlementAdvisor ||
        (typeof module==='object' && module.exports && typeof require==='function'
            ? require('../../qi-settlement-advisor/js/qi-settlement-advisor.js') : null);
    const money='guild_raids_money', supplies='guild_raids_supplies',
        alloy='guild_raids_chrono_alloy', pop='guild_raids_population',
        total='guild_raids_total_population', happy='guild_raids_happiness';
    const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
    const allValid=(...ns)=>ns.every(valid);
    const safeCopy=x=>x&&typeof x==='object'&&!Array.isArray(x)?{...x}:{};

    function quoteBuild({stock,definition,reserves={}}={}) {
        const evidence=advisor.priceEvidence(definition);
        const effect=advisor.effects(definition);
        const missing=[], shortages={}, remaining={};
        if(!stock||typeof stock!=='object')missing.push('stock');
        if(!effect)missing.push('effects');
        if(!evidence.cost)missing.push('constructionCost');
        for(const [key,price] of Object.entries(evidence.cost||{})){
            const held=stock?.[key];
            const reserve=reserves[key] ?? 0;
            if(!allValid(held,reserve)) {
                missing.push('balance:'+key);
                continue;
            }
            const spendable=Math.max(0,held-reserve);
            if(spendable<price)shortages[key]=price-spendable;
            remaining[key]=held-price;
        }
        const now=stock?.[pop], capacity=stock?.[total], joy=stock?.[happy];
        if(!allValid(now,capacity,joy))missing.push('currentPopulationHappiness');
        const delta=effect?.population, happinessDelta=effect?.euphoria;
        const during=valid(now)&&typeof delta==='number'?now+Math.min(delta,0):null;
        const after=valid(now)&&typeof delta==='number'?now+delta:null;
        const futureCap=valid(capacity)&&typeof delta==='number'?capacity+Math.max(0,delta):null;
        const futureJoy=valid(joy)&&typeof happinessDelta==='number'?joy+happinessDelta:null;
        const popViable=during===null||after===null?null:during>=0&&after>=0;
        const budgetOK=Object.keys(shortages).length===0&&!missing.some(x=>
            x==='stock'||x==='constructionCost'||x.startsWith('balance:'));
        const viable=missing.length===0&&budgetOK&&popViable===true;
        return {
            kind:'build',
            name:String(definition?.name||'neznámá stavba').slice(0,90),
            cost:evidence.cost?{...evidence.cost}:null,
            priceStatus:evidence.status,
            missing,shortages,
            financiallyCovered:missing.some(x=>x==='stock'||x==='constructionCost'||
                x.startsWith('balance:'))?null:budgetOK,
            populationViable:popViable,
            modeledConstraintsPass:viable,
            afterCost:remaining,
            duringConstruction:{availablePopulation:during,euphoria:valid(joy)?joy:null},
            afterCompletion:{totalPopulation:futureCap,
                availablePopulation:after,euphoria:futureJoy},
            layoutVerified:false, unlockedVerified:false, timeVerified:false,
            actionable:false
        };
    }

    function quoteReplacement({stock,removed,added,reserves={}}={}) {
        const del=advisor.effects(removed),put=advisor.effects(added);
        if(!del||!put||!allValid(stock?.[pop],stock?.[total],stock?.[happy]))
            return {kind:'replace',actionable:false,modeledConstraintsPass:false,
                blockers:['Nelze určit účinky prodávané stavby nebo aktuální ekonomiku.']};
        const qaEffects=del.bonuses.filter(b=>b.value!==0);
        const removalEffects={
            totalPopulation:stock[total]-Math.max(0,del.population),
            availablePopulation:stock[pop]-del.population,
            euphoria:stock[happy]-del.euphoria
        };
        if(!allValid(removalEffects.totalPopulation,removalEffects.availablePopulation,
            removalEffects.euphoria)) {
            return {kind:'replace',actionable:false,modeledConstraintsPass:false,
                blockers:['Demolice by porušila ekonomické omezení.']};
        }
        const intermediate={...safeCopy(stock),
            [total]:removalEffects.totalPopulation,
            [pop]:removalEffects.availablePopulation,
            [happy]:removalEffects.euphoria};
        const build=quoteBuild({stock:intermediate,definition:added,reserves});
        const from=advisor.size(removed),to=advisor.size(added);
        const changed=from!==null&&to!==null?from-to:null;
        const potentialFootprint=changed!==null&&changed>=0;
        const blockers=[];
        if(qaEffects.length)blockers.push('Prodej odstraní bonusy QI, jejichž dopad není oceněn.');
        if(!potentialFootprint)blockers.push('Nová budova vyžaduje více plochy než demolovaná.');
        if(!build.modeledConstraintsPass)blockers.push('Nesplněná finanční nebo populační omezení stavby.');
        blockers.push('Rozmístění, cesty a dostupnost v nabídce nebyly ověřeny.');
        return {
            kind:'sell-build',remove:String(removed?.name||'budova').slice(0,90),
            add:build.name,removedBonuses:qaEffects.length,
            afterSale:removalEffects,build,areaChange:changed,
            areaPotentiallySufficient:potentialFootprint,
            modeledConstraintsPass:build.modeledConstraintsPass&&potentialFootprint&&qaEffects.length===0,
            blockers,actionable:false
        };
    }

    function explore({stock,entities,definitions,profile='fighter',reserves={},
        maxCandidates=5,maxPairs=6}={}) {
        if(!stock||!Array.isArray(entities)||!definitions)
            return {status:'missing-state',builds:[],provisionalBuilds:[],blockedBuilds:[],replacements:[],blockers:['Chybí aktuální mapa nebo sklad.']};
        const catalog=advisor.rankBuilds(definitions,profile,
            profile==='donor'?'supplies':'chrono_alloy',
            stock[total],stock[happy],stock,reserves);
        const builds=[], provisionalBuilds=[], blockedBuilds=[], replacements=[], seen=new Set();
        // Consider all ranked candidates before capping; a high-score,
        // unaffordable building must not displace an affordable one.
        const replacementCandidates=[];
        for(const candidate of catalog){
            if(candidate.cost===null)continue;
            const choice=definitions[candidate.definitionId];
            if(!choice ||seen.has(candidate.name))continue;
            seen.add(candidate.name);
            const quoted=quoteBuild({stock,definition:choice,reserves});
            if(quoted.priceStatus!=='metadata-candidate')continue;
            if(quoted.modeledConstraintsPass) {
                if(builds.length<maxCandidates)builds.push(quoted);
            } else if(quoted.financiallyCovered===true &&
                quoted.populationViable!==false) {
                if(provisionalBuilds.length<maxCandidates)provisionalBuilds.push(quoted);
            } else if(blockedBuilds.length<maxCandidates) {
                blockedBuilds.push(quoted);
            }
            // A replacement may release population, but it cannot generate
            // missing construction resources in this no-refund model.
            if(quoted.financiallyCovered===true)
                replacementCandidates.push({quote:quoted,definitionId:candidate.definitionId});
        }
        for(const existing of entities) {
            const removed=definitions[existing?.cityentity_id];
            if(!removed || !advisor.size(removed))continue;
            // Building under construction is not assumed to provide effects.
            if(/construct|building/i.test(String(existing?.state?.__class__||'')))continue;
            for(const selected of replacementCandidates) {
                if(replacements.length>=maxPairs)break;
                const added=definitions[selected.definitionId];
                if(!added)continue;
                const replacement=quoteReplacement({stock,removed,added,reserves});
                if(replacement.modeledConstraintsPass){
                    // Duplicate buildings give duplicate action choices.
                    if(replacements.some(x=>x.remove===replacement.remove &&
                        x.add===replacement.add))continue;
                    replacements.push(replacement);
                }
            }
            if(replacements.length>=maxPairs)break;
        }
        return {
            status:'model-preview',
            builds,provisionalBuilds,blockedBuilds,replacements,
            blockers:[
                'Kandidáti nezohledňují aktuální stavební nabídku, volné parcely ani cesty.',
                'Časy výroby, časové okno QI a dopady darování nejsou oceněny.',
                'Změny ve hře se neprovádějí; výstup je pouze scénář k ověření.'
            ]
        };
    }

    const api=Object.freeze({quoteBuild,quoteReplacement,explore});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.QISettlementSimulator=api;
})(typeof globalThis!=='undefined'?globalThis:this);
