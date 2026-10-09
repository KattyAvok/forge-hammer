/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Production readiness from the game-supplied ProducingState transition.
 * CityMap already treats next_state_transition_in as seconds, dividing it
 * by 3600 to show hours. No assumed rewards or uncollected inventory.
 */
(function(root){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 function summarize(entities) {
    if(!Array.isArray(entities))return {status:'missing-map',active:0};
    let active=0,withTime=0,unknownTime=0,soon1h=0,soon3h=0,soon24h=0;
    let earliest=null;
    for(const e of entities.slice(0,600)) {
        if(!/ProducingState/i.test(String(e?.state?.__class__||'')))continue;
        active++;
        const next=e.state.next_state_transition_in;
        if(!finite(next)){unknownTime++;continue;}
        withTime++;
        if(next<=3600)soon1h++;
        if(next<=10800)soon3h++;
        if(next<=86400)soon24h++;
        earliest=earliest===null?next:Math.min(earliest,next);
    }
    return {
        status:withTime?'production-transitions-observed':
            active?'unknown-production-transition':'no-active-production-observed',
        active,withTime,unknownTime,
        within1Hour:soon1h,within3Hours:soon3h,within24Hours:soon24h,
        nearestTransitionMinutes:earliest===null?null:Math.ceil(earliest/60),
        timeFieldSemantics:'CityMap next_state_transition_in is displayed as seconds by Forge Hammer',
        outputAmountsKnown:false,collectionAssumed:false,actionable:false
    };
 }
 const api=Object.freeze({summarize});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.QISettlementReadiness=api;
})(typeof globalThis!=='undefined'?globalThis:this);
