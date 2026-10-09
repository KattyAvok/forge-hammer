/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Read-only "collect/wait before demolition" opportunities. It never makes
 * gameplay requests, marks a collection as performed, or spends forecast loot.
 */
(function(root) {
 'use strict';
 const production=root.QISettlementProduction ||
   (typeof module==='object'&&module.exports&&typeof require==='function'
    ?require('../../qi-settlement-production/js/qi-settlement-production.js'):null);
 const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const maxEntities=300;
 const nice=x=>String(x||'neznámá budova').slice(0,85);
 function assess({entities,definitions,stock,boosts={},horizonHours=null}={}) {
    if(!Array.isArray(entities)||!definitions||typeof definitions!=='object')
       return {status:'missing-map',counts:{},opportunities:[],actionable:false};
    let running=0,complete=0,unresolvedTime=0,unresolvedYield=0,unrelated=0;
    const opportunities=[];
    let nearest=null;
    for(const e of entities.slice(0,maxEntities)){
        const state=String(e?.state?.__class__||'');
        const isRunning=/ProducingState/i.test(state);
        const isComplete=/CompletedState/i.test(state);
        if(!isRunning&&!isComplete)continue;
        const def=definitions[e?.cityentity_id];
        if(!def || ['street','impediment','main_building','off_grid'].includes(def.type)){
            unrelated++;continue;
        }
        running+=Number(isRunning);complete+=Number(isComplete);
        const seconds=isRunning && valid(e?.state?.next_state_transition_in)?
            e.state.next_state_transition_in:null;
        if(isRunning&&seconds===null)unresolvedTime++;
        if(seconds!==null)nearest=nearest===null?seconds:Math.min(nearest,seconds);
        const result=production.estimateCycle(def,stock,boosts);
        const amountKnown=result.status==='estimated-cycle';
        if(!amountKnown)unresolvedYield++;
        const knownYield=amountKnown?Object.fromEntries(Object.entries(result.output)
            .filter(([k,v])=>/^guild_raids_/.test(k)&&valid(v))):null;
        const horizonKnown=valid(horizonHours)&&horizonHours<=1000;
        const aheadOfEnd=isRunning&&seconds!==null&&horizonKnown?
            seconds<=horizonHours*3600:null;
        opportunities.push({
            building:nice(def.name),
            phase:isComplete?'completed-state':'running-production',
            remainingMinutes:isRunning&&seconds!==null?
                Math.ceil(seconds/60):null,
            withinHour:isRunning&&seconds!==null?seconds<=3600:null,
            transitionBeforeQIEnd:aheadOfEnd,
            potentialCycleOutput:knownYield,
            yieldVerified:false,
            collectibleVerified:false,
            stateVerified:true,
            recommendedReview:isComplete?'inspect-collection-before-selling':
                aheadOfEnd===false?
                    'transition-beyond-observed-qi-end':
                    seconds!==null && seconds<=3*3600?
                        'wait-for-transition-before-considering-sale':
                        'protect-in-progress-production',
            safeSaleNow:false
        });
    }
    opportunities.sort((a,b)=>{
        const priority=x=>x.phase==='completed-state'?0:
            x.remainingMinutes===null?2:1;
        const d=priority(a)-priority(b);
        return d||((a.remainingMinutes??Infinity)-(b.remainingMinutes??Infinity))
            ||a.building.localeCompare(b.building);
    });
    return {
        status:running||complete?'production-opportunities-observed':'no-busy-producers',
        counts:{
            producing:running,completed:complete,
            unknownTransitionTimes:unresolvedTime,
            unknownCycleYields:unresolvedYield,
            excludedUnrelated:unrelated,
            considered:Math.min(entities.length,maxEntities)
        },
        nearestTransitionMinutes:nearest===null?null:Math.ceil(nearest/60),
        opportunities:opportunities.slice(0,8),
        omittedOpportunities:Math.max(0,opportunities.length-8),
        grossResourceAvailabilityUnchanged:true,
        salePermissionGranted:false,
        collectibleAmountsCredited:false,
        actionable:false
    };
 }
 const api=Object.freeze({assess});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.QISettlementOpportunity=api;
})(typeof globalThis!=='undefined'?globalThis:this);
