/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Conservative Donor investment budget; no donation authorization without
 * verified current node price, Quantum Actions and building feasibility.
 */
(function(root) {
 'use strict';
 const keys=['guild_raids_money','guild_raids_supplies','guild_raids_chrono_alloy',
    'guild_raids_rope','guild_raids_brick','guild_raids_bronze',
    'guild_raids_gunpowder','guild_raids_honey'];
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 function budget({stock,plans,manualReserves={},nodePrice=null,qaCost=null,
     nodeCostVerified=false,qaVerified=false}={}) {
    if(!stock||!Array.isArray(plans)||!plans.length)
        return {status:'missing-plan',safeDonation:null,investmentBuffer:null};
    const recognized=plans.slice(0,3).filter(p=>p &&
        Array.isArray(p.steps)&&p.steps.length && p.spent &&
        typeof p.spent==='object' && p.executable===false);
    if(!recognized.length)return {status:'no-modeled-plan',
        safeDonation:null,investmentBuffer:null};
    const result={};
    let allComplete=true;
    for(const key of keys) {
        const priced=recognized.some(p=>Object.hasOwn(p.spent,key));
        if(!priced && !valid(stock[key]))continue;
        if(!valid(stock[key])){allComplete=false;continue}
        let investment=0;
        for(const p of recognized){
            const value=p.spent[key]??0;
            if(!valid(value)){allComplete=false;continue}
            investment=Math.max(investment,value);
        }
        const manual=manualReserves[key];
        const manualValid=valid(manual);
        if(manual!==undefined && manual!==null && !manualValid)
            allComplete=false;
        const protectedTotal=investment+(manualValid?manual:0);
        result[key]={
            inventory:stock[key],
            reservedForInvestment:investment,
            manualReserve:manualValid?manual:null,
            protectedTotal,
            shortfall:Math.max(0,protectedTotal-stock[key]),
            aboveModeledProtection:Math.max(0,stock[key]-protectedTotal)
        };
    }
    // The actual node resource list is untrusted unless verified separately.
    // Even verified prices alone do not authorize contributions without QA
    // and time/placement/progression confirmation.
    const knownNode=nodeCostVerified&&nodePrice&&typeof nodePrice==='object'&&
        Object.entries(nodePrice).every(([key,value])=>keys.includes(key)&&valid(value));
    const knownQA=qaVerified&&valid(qaCost);
    return {
        status:allComplete?'investment-reserve-projection':'incomplete-resources',
        evaluatedPlans:recognized.length,
        investmentBuffer:result,
        manualReserveComplete:keys.slice(0,2).every(k=>valid(manualReserves[k])),
        nodeCostVerified:!!knownNode,
        qaCostVerified:!!knownQA,
        pricesAndUnlocksVerified:false,
        safeDonation:null,
        donationInstructionAllowed:false,
        warning:'Unallocated inventory is NOT safe to donate. Per-node costs, QA, building placement and future investment timing remain unverified.'
    };
 }
 const api=Object.freeze({budget});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.QISettlementDonationBudget=api;
})(typeof globalThis!=='undefined'?globalThis:this);
