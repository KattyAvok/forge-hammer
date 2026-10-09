/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Independent, privacy-safe reconciliation of modeled QI investment plans.
 * All input values remain in memory; exported report includes counts and
 * invariant names only, not balances, entity IDs or coordinates.
 */
(function(root) {
 'use strict';
 const resources=['guild_raids_money','guild_raids_supplies','guild_raids_chrono_alloy'];
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const near=(a,b)=>Math.abs(a-b)<=Math.max(.001,Math.abs(a)*1e-9);
 function audit({stock=null,plans=null,reserves={},geometry=null,
     profile='fighter',fresh=false,activeQI=false}={}) {
    const result={
        schemaVersion:1,
        status:'missing-state',
        checkedPlans:0,
        passedPlans:0,
        rejectedPlans:0,
        findings:[],
        geometryEvidence:geometry?.status||'unknown',
        availability:'unverified',
        roadRequirements:'unverified',
        timing:'unverified',
        donation:'unverified',
        actualGameplayActionsVerified:false,
        readyForManualComparison:false
    };
    if(!activeQI||!fresh||!stock||!Array.isArray(plans)) {
        result.findings.push('missing-or-stale-qi-observation');
        return result;
    }
    if(!resources.every(k=>valid(stock[k]))) {
        result.findings.push('required-resource-balance-missing');
        return result;
    }
    const keySummary=new Set();
    const append=(f)=>keySummary.add(f);
    for(const p of plans.slice(0,8)) {
        result.checkedPlans++;
        let passed=true;
        function flag(issue){append(issue);passed=false;}
        if(!p||!Array.isArray(p.steps)||!p.steps.length||
            !p.spent||typeof p.spent!=='object'||
            !p.remaining||typeof p.remaining!=='object') {
            flag('plan-structure-invalid');
        }else{
            if(p.executable!==false||p.donationSafetyVerified!==false)
                flag('unverified-game-action-incorrectly-authorized');
            if(!valid(p.minFreePopulation)||!valid(p.minEuphoriaFactor)||
                p.minEuphoriaFactor<0.2)
                flag('intermediate-economy-invalid');
            const costSum={};
            for(const step of p.steps){
                if(step?.gameActionVerified!==false)
                    flag('step-game-action-incorrectly-verified');
                if(step?.type==='build') {
                    if(!step.cost||typeof step.cost!=='object'){
                        flag('missing-build-cost');
                        continue;
                    }
                    for(const [k,v] of Object.entries(step.cost)) {
                        if(!valid(v))flag('invalid-step-cost');
                        else costSum[k]=(costSum[k]||0)+v;
                    }
                }
            }
            for(const key of new Set([...Object.keys(costSum),...Object.keys(p.spent)])){
                if(!valid(p.spent[key])||!near(costSum[key]||0,p.spent[key]))
                    flag('step-cost-does-not-match-total');
            }
            for(const k of resources){
                const spent=p.spent[k]??0;
                const remain=p.remaining[k];
                if(!valid(spent)||!valid(remain))
                    flag('required-plan-balance-missing');
                else if(!near(stock[k]-spent,remain))
                    flag('plan-budget-not-conserved');
                if(profile==='donor'&&valid(reserves[k])&&valid(remain)&&
                    remain+1e-9<reserves[k])
                    flag('protected-reserve-violated');
            }
            if(p.placementEvidence==='geometry-sequence-no-fit')
                flag('known-geometrically-impossible-plan-included');
        }
        if(passed)result.passedPlans++;
        else result.rejectedPlans++;
    }
    result.findings=[...keySummary].sort();
    result.status=result.rejectedPlans?'inconsistent-model':
        result.checkedPlans?'internally-consistent':'no-candidate-plan';
    // "Ready" means only that the computations are suitable for visual
    // comparison to the live city. It NEVER means purchase/sale is safe.
    result.readyForManualComparison=
        result.status==='internally-consistent';
    return result;
 }
 const api=Object.freeze({audit});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.QISettlementVerification=api;
})(typeof globalThis!=='undefined'?globalThis:this);
