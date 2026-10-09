/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Passive time-unit corroboration using already-observed QI production states.
 * Remaining time is not guaranteed to be a freshly-started cycle.
 */
(function(root) {
 'use strict';
 const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
 const candidates=Object.freeze({seconds:1,minutes:60,hours:3600});
 function inspect(entities,definitions) {
    if(!Array.isArray(entities)||!definitions||typeof definitions!=='object')
        return {status:'missing-evidence',unit:'unknown',timeUnitVerified:false,
            samples:0,distinctDurations:0,compatible:{}};
    let samples=0;
    const near={seconds:new Set(),minutes:new Set(),hours:new Set()};
    const valid={seconds:0,minutes:0,hours:0};
    let outsideAll=0,uniqueDurations=new Set();
    for(const entity of entities.slice(0,300)){
        if(!/ProducingState/i.test(String(entity?.state?.__class__||'')))continue;
        const def=definitions[entity?.cityentity_id];
        const opts=def?.components?.AllAge?.production?.options;
        const remaining=entity.state.next_state_transition_in;
        if(!Array.isArray(opts)||opts.length!==1||!positive(remaining)||
            !positive(opts[0]?.time))continue;
        const duration=opts[0].time;
        samples++;
        uniqueDurations.add(duration);
        let any=false;
        for(const [unit,scale] of Object.entries(candidates)){
            const seconds=duration*scale;
            if(remaining<=seconds*1.02){
                valid[unit]++;any=true;
                if(remaining>=seconds*0.98)near[unit].add(duration);
            }
        }
        if(!any)outsideAll++;
    }
    // >=3 near-full observations with >=2 distinct production durations
    // corroborate a unit hypothesis; agreement is not proof of game mechanics.
    const nearCounts=Object.fromEntries(Object.entries(near)
        .map(([key,set])=>[key,set.size]));
    const ready=Object.keys(nearCounts).filter(unit=>
        nearCounts[unit]>=2 && valid[unit]>=3 &&
        uniqueDurations.size>=2 && valid[unit]>=Math.ceil(samples*.9));
    const unit=ready.length===1?ready[0]:'unknown';
    return {
        status:unit==='unknown'?'insufficient-calibration':'unit-corroborated',
        unit,
        timeUnitVerified:false,
        canUseForIllustrativeHorizon:unit!=='unknown',
        samples,
        distinctDurations:uniqueDurations.size,
        nearFullDistinctDurations:nearCounts,
        compatible:valid,outsideAll,
        assumption:'remaining transition time represents the production option duration; exact option start and completion times are not observed'
    };
 }
 function theoreticalPlanHorizon(plan,hoursRemaining,calibration) {
    if(!plan||!Array.isArray(plan.steps)||!positive(hoursRemaining)||
        hoursRemaining>1000)
        return {status:'missing-horizon'};
    if(calibration?.status!=='unit-corroborated'||
        !Object.hasOwn(candidates,calibration.unit))
        return {status:'time-unit-unverified',
            hoursRemaining,spendableGains:null,
            projectedSchedule:null,optimisticUpperBound:null};
    const scale=candidates[calibration.unit],byResource={},used=[];
    for(const step of plan.steps){
        const time=step.rawProductionOptionTime;
        const increments=step.productionGain||step.productionLoss;
        if(!increments || !Object.keys(increments).length)continue;
        if(!positive(time))return {status:'unknown-cycle-duration',
            hoursRemaining,optimisticUpperBound:null};
        const count=Math.min(1000,Math.floor(hoursRemaining*3600/(time*scale)));
        const sign=step.type==='sell'?-1:1;
        for(const [k,v] of Object.entries(increments)){
            if(typeof v!=='number'||!Number.isFinite(v))continue;
            byResource[k]=(byResource[k]||0)+sign*v*count;
        }
        used.push({operation:step.type,building:step.building,
            possibleCyclesAtZeroBuildTime:count,rawCycleDuration:time});
    }
    return {
        status:'optimistic-upper-bound',
        hoursRemaining,
        unitHypothesis:calibration.unit,
        projectionDelayAssumed:0,
        constructionAndProductionStartUnknown:true,
        possibleResourceDelta:byResource,
        perBuilding:used,
        spendableGains:null,
        actionable:false,
        warning:'Maximum illustration only: no construction delay, no start/wait cost and unlimited cycle-start resources are assumed; do not spend or donate based on this bound.'
    };
 }
 const api=Object.freeze({inspect,theoreticalPlanHorizon});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.QISettlementTiming=api;
})(typeof globalThis!=='undefined'?globalThis:this);
