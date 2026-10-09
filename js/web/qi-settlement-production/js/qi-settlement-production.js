/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Read-only production metadata discovery. Time fields are observations,
 * not verified QI time units; ROI and rush recommendations stay blocked.
 */
(function(root) {
    'use strict';
    const qi=/^guild_raids_[a-z0-9_]+$/;
    const knownTimeKeys=new Set([
        'duration','time','timeInSeconds','productionTime','productionTimeInSeconds',
        'productionTimeSeconds','finishTime','cooldown','durationInSeconds',
        'timeInMinutes','timeInHours','buildingTime'
    ]);
    const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
    function resources(value) {
        const result={};
        const candidate=value?.resources ?? value;
        if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return result;
        for(const [key,v] of Object.entries(candidate))
            if(qi.test(key)&&valid(v))result[key]=v;
        return result;
    }
    function inspect(definitions,filter=()=>true) {
        if(!definitions||typeof definitions!=='object')return null;
        let definitionsWithOptions=0, options=0, withInputs=0, withOutputs=0,
            withPotentialTime=0, buildingsExamined=0;
        const fields=new Map(),samples=[];
        for(const definition of Object.values(definitions)) {
            if(!definition || !filter(definition))continue;
            const production=definition.components?.AllAge?.production?.options;
            if(!Array.isArray(production)||production.length===0)continue;
            buildingsExamined++;
            definitionsWithOptions++;
            for(const option of production.slice(0,20)) {
                options++;
                const products=Array.isArray(option?.products)?option.products:[];
                let ins={},outs={};
                const timeFields=new Set();
                for(const [k,v] of Object.entries(option||{}))
                    if(knownTimeKeys.has(k)&&valid(v))timeFields.add('option.'+k);
                for(const product of products.slice(0,10)) {
                    for(const [k,v] of Object.entries(product||{}))
                        if(knownTimeKeys.has(k)&&valid(v))timeFields.add('product.'+k);
                    Object.assign(ins,resources(product?.requirements?.resources));
                    Object.assign(outs,resources(product?.playerResources?.resources));
                }
                if(Object.keys(ins).length)withInputs++;
                if(Object.keys(outs).length)withOutputs++;
                if(timeFields.size)withPotentialTime++;
                for(const f of timeFields)fields.set(f,(fields.get(f)||0)+1);
                if(samples.length<12 && (Object.keys(ins).length||Object.keys(outs).length))
                    samples.push({building:String(definition.name||'unnamed').slice(0,90),
                        optionIndex:production.indexOf(option),
                        input:ins,output:outs,
                        timeFields:[...timeFields].sort(),
                        timeUnitsVerified:false});
            }
        }
        return {
            status:'metadata-observed',buildingsExamined,definitionsWithOptions,options,
            optionsWithQIInputs:withInputs,optionsWithQIOutputs:withOutputs,
            optionsWithPotentialDuration:withPotentialTime,
            potentialTimePaths:Object.fromEntries([...fields].sort(([a],[b])=>a.localeCompare(b))),
            timeUnitsVerified:false,
            samples
        };
    }
    function qiBoostSummary(boosts) {
        const input=boosts?.Sums;
        if(!input||typeof input!=='object')return {status:'not-available'};
        const relevant=[
            'guild_raids_coins_production','guild_raids_supplies_production',
            'guild_raids_action_points_collection','guild_raids_action_points_capacity',
            'guild_raids-att_boost_attacker','guild_raids-def_boost_attacker',
            'guild_raids-att_boost_defender','guild_raids-def_boost_defender'
        ];
        const items={};
        for(const key of relevant)if(valid(input[key]))items[key]=input[key];
        return {status:Object.keys(items).length?'observed':'not-available',
            fields:items,source:'Boosts.Sums',combatInterpretationVerified:false};
    }
    const api=Object.freeze({inspect,qiBoostSummary});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.QISettlementProduction=api;
})(typeof globalThis!=='undefined'?globalThis:this);
