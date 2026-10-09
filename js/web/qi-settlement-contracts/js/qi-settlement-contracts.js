/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Opt-in output, passive in-memory contract fingerprint: no raw responses,
 * identifiers, player names, numeric inventory values or network requests.
 */
(function(root) {
    'use strict';
    const allowed=new Set([
        'requirements','resources','cost','price','prices','building','buildings',
        'production','options','products','units','unit','army','armies','enemies',
        'node','nodes','map','overview','rewards','reward','state','status',
        'goods','donation','donate','contribute','payment','payments',
        'amount','quantity','available','locked','unlocked','actionPoints',
        'guildRaids','raidInstance','difficultyLevel','target','targets',
        'levels','waves','bonus','boost','boosts','combat','battle',
        'time','duration','seconds','endsAt','expiresAt','areas','area',
        'expansion','expansions','construction','buildingOptions'
    ]);
    const resource=/^guild_raids_[a-z0-9_]{1,55}$/;
    function create() {
        const methods=new Map();
        const paths=new Map();
        let truncated=0;
        function observe(name,response) {
            if(!['qi-map-overview','qi-run-state','qi-unit-info'].includes(name))return;
            methods.set(name,(methods.get(name)||0)+1);
            if(!response||typeof response!=='object')return;
            const seen=new WeakSet();let visited=0;
            function walk(value,path,depth) {
                if(!value||typeof value!=='object'||depth>8)return;
                if(seen.has(value))return;
                seen.add(value);
                if(++visited>6000){truncated++;return;}
                if(Array.isArray(value)){
                    for(let i=0;i<Math.min(value.length,20);i++)
                        walk(value[i],path+'[item]',depth+1);
                    return;
                }
                for(const [key,v] of Object.entries(value).slice(0,120)){
                    const safe=resource.test(key)?'guild_raids_resource':
                        allowed.has(key)?key:'[key]';
                    if(safe==='[key]'&&v===null)continue;
                    const next=path+'.'+safe;
                    const prior=paths.get(name+'|'+next)||0;
                    if(paths.size<150 || paths.has(name+'|'+next))
                        paths.set(name+'|'+next,prior+1);
                    if(typeof v==='object')walk(v,next,depth+1);
                }
            }
            walk(response,'response',0);
        }
        function report(){
            return {
                status:methods.size?'observed':'not-observed',
                eventCounts:Object.fromEntries([...methods].sort()),
                truncatedTraversals:truncated,
                structuralPaths:[...paths].map(([key,occurrences])=>{
                    const sep=key.indexOf('|');
                    return {event:key.slice(0,sep),path:key.slice(sep+1),occurrences};
                }).sort((a,b)=>b.occurrences-a.occurrences).slice(0,35),
                onlyNamesAndCounts:true
            };
        }
        return Object.freeze({observe,report});
    }
    const api=Object.freeze({create});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.QISettlementContracts=api;
})(typeof globalThis!=='undefined'?globalThis:this);
