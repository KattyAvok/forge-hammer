/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 * Conservative, pure read-only QI advisor. Reference guides inform priorities;
 * no state is treated as proof that a historical day/step occurred.
 */
(function(root) {
    'use strict';
    const RESOURCE_IDS = Object.freeze([
        'guild_raids_money','guild_raids_supplies','guild_raids_chrono_alloy'
    ]);
    const fin = n => typeof n === 'number' && Number.isFinite(n);
    const qty = n => fin(n) && n >= 0;
    const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().replace(/[^a-z0-9]+/g,'');
    const A = {
        ropery: ['ropery'], bakery:['bakery'], alchemist:['alchemist'],
        doctor:['doctor'], printer:['printer'], tannery:['tannery'],
        brewery:['brewery'], church:['church'], multistorey:['multistorey','multistory'],
        estate:['estate'], frame:['framehouse'], gallows:['gallows'],
        pillory:['pillory'], clapboard:['clapboard'],
        catapult:['catapultcamp'], trebuchet:['trebuchetcamp']
    };
    function alias(name, id) {
        const a=norm(name), b=norm(id);
        const key=Object.keys(A).find(k=>A[k].some(x=>a.includes(x)||b.includes(x)));
        return key || null;
    }
    function features(entities, definitions) {
        if (!Array.isArray(entities) || !definitions || typeof definitions !== 'object') return null;
        const counts={};let unknown=0, constructing=0;
        const existing=[];
        for (const entity of entities) {
            const definition=definitions[entity?.cityentity_id];
            if (!definition) { unknown++; continue; }
            const name=definition.name||entity.cityentity_id;
            const key=alias(name,entity.cityentity_id);
            if(key)counts[key]=(counts[key]||0)+1;
            const state=String(entity?.state?.__class__||'');
            const inConstruction=/construct|building/i.test(state);
            if(inConstruction)constructing++;
            existing.push({key,id:entity.cityentity_id,name,
                state:inConstruction?'construction':state,definition});
        }
        return {counts,unknown,constructing,existing};
    }

    function inferPhase(f,areas) {
        if(!f || f.unknown) return {code:'unknown',confidence:'low',reason:'Incomplete building definitions'};
        const c=f.counts, count=k=>c[k]||0;
        const hasRope=count('ropery')>0, hasBakery=count('bakery')>0,
            hasTier2=count('alchemist')>0 || count('doctor')>0 || count('printer')>0;
        if(hasBakery) return {code:'advanced',confidence:'medium',
            reason:'Bakery is present; this corresponds to late development in reference guides'};
        if(hasRope && (count('alchemist')>=4 || count('printer')>=2 ||
            (qty(areas)&&areas>=19))) return {code:'expansion',confidence:'medium',
            reason:'Ropery and expanded infrastructure already exist'};
        if(hasRope) return {code:'rope',confidence:'medium',
            reason:'Rope production available; expansion stage is underway'};
        if(hasTier2) return {code:'early-rebuild',confidence:'low',
            reason:'Advanced production/culture is present but Rope stage not observed'};
        return {code:'foundation',confidence:'low',
            reason:'No later-stage guide anchor found; previous demolitions cannot be reconstructed'};
    }

    function moneyCost(definition) {
        // First-generation metadata contract. Later game metadata can use
        // different structures; unknown is deliberately not zero.
        const raw=definition?.requirements?.cost?.resources;
        if(!raw || typeof raw !== 'object' || Array.isArray(raw))return null;
        const result={};
        for(const id of RESOURCE_IDS) if(qty(raw[id])) result[id]=raw[id];
        // Missing coin/supply keys are not presumed free.
        if(!qty(result.guild_raids_money)||!qty(result.guild_raids_supplies))return null;
        return result;
    }
    function effects(definition) {
        const all=definition?.components?.AllAge;
        const resources=all?.staticResources?.resources?.resources || {};
        const pop=resources.guild_raids_population ?? 0;
        const happy=resources.guild_raids_happiness ?? 0;
        if(!fin(pop)||!fin(happy))return null;
        const boosts=Array.isArray(all?.boosts?.boosts)?all.boosts.boosts:[];
        const additions={};
        const options=all?.production?.options;
        if(Array.isArray(options) && options.length===1){
            const out=options[0]?.products?.[0]?.playerResources?.resources;
            if(out && typeof out==='object')
                for(const id of RESOURCE_IDS) if(qty(out[id]))additions[id]=out[id];
        }
        return {population:pop,euphoria:happy,
            bonuses:boosts.filter(b=>typeof b?.type==='string' && b.type.includes('guild_raids'))
                .map(b=>({type:b.type,value:fin(b.value)?b.value:0})),
            yieldPerCycle:additions,
            yieldKnown:Object.keys(additions).length>0};
    }
    function size(definition) {
        const w=definition?.width ?? definition?.components?.AllAge?.placement?.size?.x;
        const h=definition?.length ?? definition?.components?.AllAge?.placement?.size?.y;
        return fin(w)&&fin(h)&&w>0&&h>0?w*h:null;
    }

    function focus(profile,stock,planCost={}) {
        // A missing cost does not become "available for donation".
        const money=stock?.guild_raids_money, supplies=stock?.guild_raids_supplies,
            alloy=stock?.guild_raids_chrono_alloy;
        if(!qty(money)||!qty(supplies)||!qty(alloy))
            return {name:'unknown',reason:'Not all QI stocks were observed'};
        const short=RESOURCE_IDS.map(id=>({
            id, cost:planCost[id], available:stock[id]
        })).filter(x=>qty(x.cost)&&x.cost>x.available);
        if(short.length) {
            short.sort((a,b)=>(b.cost-b.available)/Math.max(1,b.cost)-
                (a.cost-a.available)/Math.max(1,a.cost));
            return {name:short[0].id.replace('guild_raids_',''),
                reason:'A verified planned cost exceeds current holdings'};
        }
        if(profile==='fighter' && alloy < 250)
            return {name:'chrono_alloy',reason:'Chrono Alloy is low; recruitment and higher-tier builds may be constrained'};
        return {name:'unverified',reason:'Next building and node costs are needed to identify an economic bottleneck reliably'};
    }

    // Directional suggestions, not executable placements. The analyzer will
    // not recommend selling an occupied production/QA building as safe.
    function advise({profile='fighter',stock=null,entities=null,definitions=null,
        unlockedAreaCount=null,planCost={},reserves={}}={}) {
        const f=features(entities,definitions);
        const phase=inferPhase(f,unlockedAreaCount);
        const observed=stock||{};
        const result={phase, focus:focus(profile,observed,planCost),
            recommendations:[], blockers:[], counts:f?.counts||{}, 
            dataQuality:{hasMap:!!f,missingDefinitions:f?.unknown??null,
                hasStock:RESOURCE_IDS.every(x=>qty(observed[x]))}};
        const add=(code,priority,title,why,limitations,extra={})=>
            result.recommendations.push({code,priority,title,why,
                limitations,actionable:false,...extra});
        if(!f || f.unknown){
            result.blockers.push('Building map or definitions incomplete');
            return result;
        }
        const population=observed.guild_raids_total_population,
            available=observed.guild_raids_population,
            happy=observed.guild_raids_happiness;
        const factor=qty(population)&&qty(happy)&&population>0?
            (happy/population>=2?1.5:null):null;
        if(!qty(population)||!qty(available)||!qty(happy)){
            result.blockers.push('Current population/euphoria from resource bag unavailable');
        }else if(factor===null){
            const shortfall=Math.max(0,Math.ceil(2*population-happy));
            add('culture',100,'Zvýšit aktivní euforii',
                'Do násobitele 1,5× chybí '+shortfall+' euforie.',
                'Konkrétní budovu vybrat až po ověření ceny, plochy a dostupnosti.',
                {needEuphoria:shortfall});
        }
        if(qty(available) && available<100){
            add('population',90,'Uvolnit nebo zvýšit populaci',
                'Volná populace je '+available+'.',
                'Výstavba spotřebovávající populaci nesmí být doporučena bez prověření mezistavu.');
        }
        if(f.constructing){
            add('finish',85,'Zkontrolovat dokončení '+f.constructing+' budov',
                'Aktivní přínosy rozestavěných budov nelze připsat aktuální produkci.',
                'Výnos a dostupnost pro sběr je nutné potvrdit herním stavem.');
        }
        const c=f.counts, count=k=>c[k]||0;
        if(count('ropery')===0 && phase.code!=='unknown'){
            add('rope',65,'Zvážit Rope před rozšířeními',
                'V osadě nebyla identifikována Ropery, reference ji používá pro další rozšíření.',
                'Volbu zboží, cenu stavby a rozšíření musí potvrdit hra.');
        }
        if(profile==='fighter'){
            add('combat',75,'Porovnat potřebné jednotky a bojové bonusy',
                'Bojová varianta závisí na následujícím uzlu a ztrátách jednotek.',
                'Jednotky a účinky uzlu zatím nelze automaticky ověřit.');
        } else {
            const keys=['guild_raids_money','guild_raids_supplies'];
            if(keys.every(k=>qty(observed[k])&&qty(reserves[k]))){
                const after={};
                for(const k of keys) after[k]=Math.max(0,observed[k]-reserves[k]);
                add('donate',70,'Prověřit přebytek nad rezervou',
                    'Mince '+Math.floor(after[keys[0]])+', zásoby '+Math.floor(after[keys[1]])+
                    ' nad ručním minimem.',
                    'Nejde o bezpečné darování: chybí ověřený plán staveb a náklady uzlu.',
                    {surplusAboveManualReserve:after});
            }else result.blockers.push('Donor: no complete protected reserve or verified building budget');
        }
        // Replacement exploration: only existing buildings with observed
        // contributions. Never claim an actual sell/build is possible.
        if(qty(population)&&qty(happy)&&population>0){
            const excess=happy-2*population;
            if(excess>0) {
                const seen=new Set();
                for(const e of f.existing) {
                    if(seen.has(e.id)||e.state==='construction')continue;
                    seen.add(e.id);
                    const stat=effects(e.definition);
                    const typ=e.definition.type;
                    if(typ!=='culture'||!stat||!qty(stat.euphoria)||
                        stat.bonuses.length||stat.euphoria===0)continue;
                    if(excess>=stat.euphoria){
                        add('review-sell',40,'Prověřit uvolnění: '+e.name,
                            'Po odstranění samotné euforie by poměr zůstal nejméně 2:1.',
                            'NEPRODÁVAT bez kontroly obnovy QA, umístění, návaznosti a ceny náhrady.',
                            {euphoriaFreed:stat.euphoria,tilesFreed:size(e.definition)});
                    }
                }
            }
        }
        if(result.focus.name==='unverified'){
            result.blockers.push('Cannot score investment payback without verified current costs and production horizon');
        }
        result.recommendations.sort((a,b)=>b.priority-a.priority);
        return result;
    }
    const api=Object.freeze({features,inferPhase,moneyCost,effects,size,focus,advise});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.QISettlementAdvisor=api;
})(typeof globalThis!=='undefined'?globalThis:this);
