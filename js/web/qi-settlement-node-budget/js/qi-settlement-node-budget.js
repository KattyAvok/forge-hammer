/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * A read-only analyzer of existing QI node cost *candidates*. Node costs,
 * future availability and QA are not verified contracts; never allow donation.
 * The in-memory snapshot contains only finite QI quantities and context tags,
 * never node IDs, positions, player IDs or raw network responses.
 */
(function(root) {
 'use strict';
 const currency=/^guild_raids_(money|supplies|chrono_alloy|rope|brick|bronze|gunpowder|honey|lunar_coin)$/;
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const costToken=/^(?:cost|costs|price|prices|requirement|requirements|payment|payments)$/i;
 const rewardToken=/^(?:reward|rewards|loot|prize|prizes)$/i;
 const knownQA=new Set(['actionPoints','action_points','qaCost','requiredActionPoints']);
 function extract(response) {
    if(!Array.isArray(response?.nodes))
        return {status:'no-nodes',nodes:[],nodeCount:0,limited:false};
    const nodes=[];
    let tooMany=false;
    for(const node of response.nodes.slice(0,80)) {
        const groups=[],qaPaths=new Set(),seen=new WeakSet();
        let visits=0;
        function walk(value,parents,depth) {
            if(!value||typeof value!=='object'||depth>7||seen.has(value))return;
            if(++visits>1800){tooMany=true;return;}
            seen.add(value);
            if(Array.isArray(value)){
                for(const entry of value.slice(0,20))walk(entry,parents,depth+1);
                return;
            }
            for(const [k,v] of Object.entries(value).slice(0,80)){
                if(knownQA.has(k)&&finite(v))qaPaths.add(k);
                if(k==='resources'&&v&&typeof v==='object'&&!Array.isArray(v)) {
                    const parsed={};let usable=true;
                    for(const [currencyKey,amount] of Object.entries(v)) {
                        if(currency.test(currencyKey)&&finite(amount)&&amount>0)
                            parsed[currencyKey]=amount;
                        else if(amount!==0 && currencyKey.startsWith('guild_raids_'))
                            usable=false;
                    }
                    if(Object.keys(parsed).length){
                        const reward=parents.some(x=>rewardToken.test(x));
                        const cost=parents.some(x=>costToken.test(x));
                        groups.push({
                            cost:!reward&&cost,
                            reward:reward,
                            unclassified:!reward&&!cost,
                            amounts:usable?parsed:null
                        });
                    }
                }
                if(v&&typeof v==='object')walk(v,parents.concat(k),depth+1);
            }
        }
        walk(node,[],0);
        nodes.push({groups,qaCandidateKeys:[...qaPaths].sort().slice(0,5),
            truncated:visits>1800});
    }
    return {status:'parsed-candidates',nodes,nodeCount:response.nodes.length,
        limited:tooMany||response.nodes.length>80};
 }
 function evaluate(snapshot,stock,reserves={}) {
    if(!snapshot||snapshot.status!=='parsed-candidates')
        return {status:'no-node-contract',verifiedDonationPrice:false,
            safeDonation:null,donationInstructionAllowed:false};
    const totals={nodesObserved:snapshot.nodeCount,
        sampledNodes:snapshot.nodes.length,
        explicitlyPricedCandidates:0,unclassifiedResourceBundles:0,
        rewardBundles:0,ambiguousNodePricing:0,
        grossBudgetCovered:0,protectedBudgetCovered:0,
        grossBudgetShortfall:0,unknownBalances:0,qaFieldCandidates:0};
    const sourceKinds={money:0,supplies:0,chrono_alloy:0,other:0};
    const candidatePriceNodes=[];
    for(const n of snapshot.nodes){
        if(n.qaCandidateKeys.length)totals.qaFieldCandidates++;
        const prices=n.groups.filter(g=>g.cost);
        totals.unclassifiedResourceBundles+=n.groups.filter(g=>g.unclassified).length;
        totals.rewardBundles+=n.groups.filter(g=>g.reward).length;
        if(prices.length!==1){
            if(prices.length>1)totals.ambiguousNodePricing++;
            continue;
        }
        const price=prices[0].amounts;
        if(!price){totals.unknownBalances++;continue;}
        totals.explicitlyPricedCandidates++;
        for(const k of Object.keys(price)){
            if(k==='guild_raids_money')sourceKinds.money++;
            else if(k==='guild_raids_supplies')sourceKinds.supplies++;
            else if(k==='guild_raids_chrono_alloy')sourceKinds.chrono_alloy++;
            else sourceKinds.other++;
        }
        let gross=true,protectedBudget=true,unknown=false;
        for(const [resource,amount] of Object.entries(price)){
            if(!finite(stock?.[resource])){unknown=true;continue;}
            if(stock[resource]<amount)gross=false;
            const buffer=reserves?.[resource];
            if(buffer===undefined||buffer===null){
                protectedBudget=false;
            }else if(!finite(buffer)){unknown=true}
            else if(stock[resource]<amount+buffer)protectedBudget=false;
        }
        if(unknown){totals.unknownBalances++;continue;}
        totals.grossBudgetCovered+=Number(gross);
        if(gross&&!protectedBudget)totals.grossBudgetShortfall++;
        totals.protectedBudgetCovered+=Number(protectedBudget);
        candidatePriceNodes.push({gross,protectedBudget});
    }
    return {
        status:totals.explicitlyPricedCandidates?
            'unverified-cost-candidates':'unclassified-node-data',
        coverage:totals,
        resourceKeyCoverage:sourceKinds,
        dataTruncated:snapshot.limited,
        nodeCostSemanticsVerified:false,
        nodeAvailabilityVerified:false,
        qaCostSemanticsVerified:false,
        donationInstructionAllowed:false,
        safeDonation:null,
        warning:'A QI node resource bundle may be a negotiation, reward or alternative price. Raw affordability is not approval to contribute.'
    };
 }
 const api=Object.freeze({extract,evaluate});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.QISettlementNodeBudget=api;
})(typeof globalThis!=='undefined'?globalThis:this);
