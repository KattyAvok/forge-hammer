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
        if(!f || f.unknown) return {code:'unknown',confidence:'low',reason:'Chybí definice některých budov.'};
        const c=f.counts, count=k=>c[k]||0;
        const hasRope=count('ropery')>0, hasBakery=count('bakery')>0,
            hasTier2=count('alchemist')>0 || count('doctor')>0 || count('printer')>0;
        if(hasBakery) return {code:'advanced',confidence:'medium',
            reason:'V osadě je Bakery, což odpovídá pokročilé fázi referenčních strategií.'};
        if(hasRope && (count('alchemist')>=4 || count('printer')>=2 ||
            (qty(areas)&&areas>=19))) return {code:'expansion',confidence:'medium',
            reason:'Ropery i rozvinutá infrastruktura už jsou v osadě.'};
        if(hasRope) return {code:'rope',confidence:'medium',
            reason:'Výroba Rope je dostupná; rozšiřování už pravděpodobně probíhá.'};
        if(hasTier2) return {code:'early-rebuild',confidence:'low',
            reason:'Pokročilejší výroba nebo kultura jsou přítomné, ale rozvoj Rope zatím nepotvrzen.'};
        return {code:'foundation',confidence:'low',
            reason:'Nebyl nalezen jednoznačný znak pokročilejší fáze. Minulé demolice nelze zpětně určit.'};
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
            return {name:'unknown',reason:'Některé zásoby QI se zatím nepodařilo načíst.'};
        const short=RESOURCE_IDS.map(id=>({
            id, cost:planCost[id], available:stock[id]
        })).filter(x=>qty(x.cost)&&x.cost>x.available);
        if(short.length) {
            short.sort((a,b)=>(b.cost-b.available)/Math.max(1,b.cost)-
                (a.cost-a.available)/Math.max(1,a.cost));
            return {name:short[0].id.replace('guild_raids_',''),
                reason:'Ověřené náklady plánované investice převyšují aktuální zásoby.'};
        }
        if(profile==='fighter' && alloy < 250)
            return {name:'chrono_alloy',reason:'Zásoba Chrono Alloy je nízká; může omezovat nábor a pokročilou výstavbu.'};
        return {name:'unverified',reason:'Bez cen dalších staveb a uzlů nelze spolehlivě určit ekonomické omezení.'};
    }

    // Candidate building ranking from QI-marked metadata. This does NOT prove
    // that the building is available in the current QI construction menu.
    function rankBuilds(definitions, profile, focusName, population, happiness, stock, reserves={}) {
        if(!definitions || typeof definitions!=='object')return [];
        const results=[], seen=new Set();
        for(const [id,def] of Object.entries(definitions)){
            if(!def || !['residential','production','culture'].includes(def.type))continue;
            const aliasId=alias(def.name,id);
            if(!aliasId || seen.has(id))continue;
            const e=effects(def), area=size(def);
            if(!e || !area)continue;
            const raw=def.components?.AllAge?.staticResources?.resources?.resources||{};
            const isQI=Object.keys(raw).some(k=>k.startsWith('guild_raids_')) ||
                Object.keys(e.yieldPerCycle).some(k=>k.startsWith('guild_raids_'));
            if(!isQI)continue;
            seen.add(id);
            const buildPrice=moneyCost(def);
            const shortages={};
            let affordable=buildPrice!==null?true:null;
            if(affordable) {
                for(const [key,needed] of Object.entries(buildPrice)){
                    if(!qty(stock?.[key])) {affordable=null;continue;}
                    const afterBuffer=Math.max(0,stock[key]-(reserves[key]||0));
                    if(afterBuffer<needed){shortages[key]=needed-afterBuffer; affordable=false;}
                }
            }
            const free=stock?.guild_raids_population;
            const populationOK=qty(free)?free+e.population>=0:null;
            // No hidden assumptions about roads, available space or unlocked age.
            // Directional heuristics only. QA collection/capacity are tracked
            // separately from per-cycle economic yields (different units).
            const qaCollection=e.bonuses
                .filter(b=>b.type.includes('action_points_collection'))
                .reduce((n,b)=>n+b.value,0);
            const qaCapacity=e.bonuses
                .filter(b=>b.type.includes('action_points_capacity'))
                .reduce((n,b)=>n+b.value,0);
            const quality =
                focusName==='supplies' ? e.yieldPerCycle.guild_raids_supplies||0 :
                focusName==='money' ? e.yieldPerCycle.guild_raids_money||0 :
                focusName==='chrono_alloy' ? e.yieldPerCycle.guild_raids_chrono_alloy||0 :
                profile==='donor' ? (e.yieldPerCycle.guild_raids_money||0)+
                    (e.yieldPerCycle.guild_raids_supplies||0) :
                (e.yieldPerCycle.guild_raids_chrono_alloy||0)*20;
            const strategicWeight=(profile==='donor'?qaCollection*5+qaCapacity/100 :
                qaCollection*2+qaCapacity/200);

            const cultureNeeded=qty(population)&&qty(happiness)&&happiness<2*population;
            const points= cultureNeeded&&e.euphoria>0 ? (e.euphoria*20+strategicWeight)/area :
                (quality+strategicWeight)/area;
            if(points<=0)continue;
            results.push({
                kind:'build-candidate', alias:aliasId, name:String(def.name||id).slice(0,100),
                area, populationDelta:e.population, euphoriaDelta:e.euphoria,
                cycleYield:e.yieldPerCycle, qaCollection, qaCapacity, cost:buildPrice,
                affordable, populationOK, shortages,
                verifiedAvailability:false, verifiedLayout:false,
                score:points
            });
        }
        return results.sort((a,b)=>b.score-a.score).slice(0,5);
    }

    // Aggregate-only probe to decide whether metadata supports priced decisions.
    // No player/world identifiers, building ids or map coordinates are included.
    function catalogCoverage(definitions) {
        if(!definitions || typeof definitions!=='object')return null;
        let qiCatalogCount=0,priced=0,withYield=0,withFootprint=0;
        const categories={residential:0,production:0,culture:0};
        for(const [id,def] of Object.entries(definitions)){
            if(!def || !Object.prototype.hasOwnProperty.call(categories,def.type))continue;
            const e=effects(def);
            if(!e || !alias(def.name,id))continue;
            const raw=def.components?.AllAge?.staticResources?.resources?.resources||{};
            if(!Object.keys(raw).some(k=>k.startsWith('guild_raids_')) &&
                !Object.keys(e.yieldPerCycle).some(k=>k.startsWith('guild_raids_')))continue;
            qiCatalogCount++;
            categories[def.type]++;
            if(moneyCost(def))priced++;
            if(e.yieldKnown)withYield++;
            if(size(def))withFootprint++;
        }
        return {qiCatalogCount,priced,withYield,withFootprint,categories,
            pricedRecommendationsPossible:priced>0};
    }

    // Passive schema discovery: report only structural paths and coverage.
    // The original metadata is accessed in memory, never persisted or exported.
    // Dynamic property names and building IDs are converted to [key] or [item].
    function priceSchemaDiscovery(definitions) {
        if (!definitions || typeof definitions !== 'object') return null;
        const whitelist = new Set([
            'requirements','cost','costs','resources','components','AllAge',
            'buildingRequirements','construction','constructionCost','price',
            'prices','purchase','purchasePrice','buyPrice','build','placement',
            'options','products','playerResources','resourceCost',
            'staticResources','production','reward','rewards','upgrade'
        ]);
        const tracked = new Set([
            'guild_raids_money','guild_raids_supplies','guild_raids_chrono_alloy',
            'guild_raids_rope','guild_raids_brick','guild_raids_bronze',
            'guild_raids_gunpowder','guild_raids_honey'
        ]);
        const paths = new Map();
        let examined = 0, withQIPriceTokens = 0, truncated = 0;
        const hits = new Set();
        for (const [id, def] of Object.entries(definitions)) {
            if(!def || !alias(def.name,id))continue;
            const e = effects(def);
            if(!e)continue;
            const base = def.components?.AllAge?.staticResources?.resources?.resources || {};
            const hasQI = Object.keys(base).some(x=>x.startsWith('guild_raids_')) ||
                Object.keys(e.yieldPerCycle).some(x=>x.startsWith('guild_raids_'));
            if(!hasQI)continue;
            examined++;
            let nodes=0, found=false;
            const seen=new WeakSet();
            function walk(value, path, depth) {
                if(!value || typeof value!=='object'||depth>10)return;
                if(seen.has(value))return;
                if(++nodes>4000){truncated++;return;}
                seen.add(value);
                if(Array.isArray(value)){
                    for(let i=0;i<Math.min(value.length,32);i++)
                        walk(value[i],path+'[item]',depth+1);
                    return;
                }
                const ownKeys=Object.keys(value);
                const matching=ownKeys.filter(k=>tracked.has(k) &&
                    typeof value[k]==='number' && Number.isFinite(value[k]));
                if(matching.length){
                    const isPricing = /cost|requirement|price|purchase|buy|build/i.test(path);
                    if(isPricing)found=true;
                    const label=path || '[root]';
                    const old=paths.get(label)||{
                        path:label,definitions:0,occurrences:0,
                        money:false,supplies:false,alloy:false,priceContext:false
                    };
                    if(!hits.has(id+'|'+label)) {
                        old.definitions++; hits.add(id+'|'+label);
                    }
                    old.occurrences++;
                    old.money ||= matching.includes('guild_raids_money');
                    old.supplies ||= matching.includes('guild_raids_supplies');
                    old.alloy ||= matching.includes('guild_raids_chrono_alloy');
                    old.priceContext ||= isPricing;
                    paths.set(label,old);
                }
                if(depth===10)return;
                for(const key of ownKeys.slice(0,250)){
                    if(typeof value[key]!=='object'||value[key]===null)continue;
                    const segment=whitelist.has(key)?key:'[key]';
                    walk(value[key],path?path+'.'+segment:segment,depth+1);
                }
            }
            walk(def,'',0);
            if(found)withQIPriceTokens++;
        }
        return {
            schemaVersion:1,examinedDefinitions:examined,
            definitionsWithQIPriceTokens:withQIPriceTokens,
            truncatedTraversalCount:truncated,
            paths:[...paths.values()].sort((a,b)=>
                Number(b.priceContext)-Number(a.priceContext) ||
                b.definitions-a.definitions || a.path.localeCompare(b.path)).slice(0,30)
        };
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
            result.blockers.push('Mapa osady nebo definice budov jsou neúplné.');
            return result;
        }
        const population=observed.guild_raids_total_population,
            available=observed.guild_raids_population,
            happy=observed.guild_raids_happiness;
        const factor=qty(population)&&qty(happy)&&population>0?
            (happy/population>=2?1.5:null):null;
        if(!qty(population)||!qty(available)||!qty(happy)){
            result.blockers.push('Aktuální populace nebo euforie nejsou ve skladu dostupné.');
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
            }else result.blockers.push('Donor: chybí úplná chráněná rezerva nebo ověřený rozpočet další výstavby.');
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
        const ranked=rankBuilds(definitions,profile,result.focus.name,
            population,happy,observed,reserves);
        // Economic rankings without confirmed price cannot be used to choose
        // sell/build sequences; suppress these misleading "recommendations".
        const priced=ranked.filter(candidate=>candidate.cost !== null);
        if(ranked.length && priced.length===0)
            result.blockers.push('Návrhy konkrétních staveb byly potlačeny: aktuální stavební ceny QI nejsou ověřené.');
        for(const candidate of priced.slice(0,3)){
            const costText=candidate.cost?
                'Cena z metadat: '+Object.entries(candidate.cost).map(([k,v])=>k.replace('guild_raids_','')+' '+v).join(', ')+'.' :
                'Stavební cena zatím nebyla v herních metadatech ověřena.';
            add('build-candidate',35,'Kandidát výstavby: '+candidate.name,
                'Návrh podle ekonomického přínosu na pole; '+costText,
                'NEPOTVRZENÁ dostupnost v nabídce, konečné umístění a čas návratnosti.',
                {candidate});
        }
        if(result.focus.name==='unverified'){
            result.blockers.push('Bez ověřených cen a časového horizontu nelze vyhodnotit návratnost investic.');
        }
        result.recommendations.sort((a,b)=>b.priority-a.priority);
        return result;
    }
    const api=Object.freeze({features,inferPhase,moneyCost,effects,size,focus,rankBuilds,catalogCoverage,priceSchemaDiscovery,advise});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.QISettlementAdvisor=api;
})(typeof globalThis!=='undefined'?globalThis:this);
