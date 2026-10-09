/* AGPL-3.0 — adaptive settlement advisory rules (conservative).
 * Run: node --test tests/qi-settlement-advisor.test.cjs
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const advisor=require('../js/web/qi-settlement-advisor/js/qi-settlement-advisor.js');
const def=(name,type,pop,happy,yieldValue=null)=>({
    name,type,
    components:{AllAge:{
        placement:{size:{x:3,y:3}},
        staticResources:{resources:{resources:{
            guild_raids_population:pop, guild_raids_happiness:happy
        }}},
        ...(yieldValue===null?{}:{production:{options:[{products:[{
            playerResources:{resources:yieldValue}
        }]}]}})
    }}
});
const stock={
    guild_raids_money:100000,guild_raids_supplies:80000,
    guild_raids_chrono_alloy:400,
    guild_raids_total_population:400,guild_raids_population:110,
    guild_raids_happiness:800
};
test('phase inferred from buildings, not currently selected manual guide day',()=>{
    const defs={estate:def('Estate','residential',200,0),
        rope:def('Ropery','goods',-100,0),
        alchemist:def('Alchemist','production',-40,0),
        bakery:def('Bakery','production',-80,0)};
    const mk=(...ids)=>ids.map(cityentity_id=>({cityentity_id}));
    assert.equal(advisor.advise({stock,entities:mk('estate'),definitions:defs}).phase.code,'foundation');
    assert.equal(advisor.advise({stock,entities:mk('estate','rope'),definitions:defs}).phase.code,'rope');
    assert.equal(advisor.advise({stock,entities:mk('estate','rope','bakery'),definitions:defs}).phase.code,'advanced');
});

test('ambiguous/incomplete maps get low-confidence phase, not invented day',()=>{
    const result=advisor.advise({stock,entities:[{cityentity_id:'missing'}],definitions:{}});
    assert.equal(result.phase.code,'unknown');
    assert.equal(result.recommendations.length,0);
    assert.ok(result.blockers.length>0);
});

test('culture deficit triggers intervention, while max factor does not',()=>{
    const city=[{cityentity_id:'home'}];
    const definitions={home:def('Estate','residential',400,0)};
    const weak={...stock,guild_raids_total_population:400,guild_raids_happiness:500};
    const result=advisor.advise({profile:'donor',stock:weak,entities:city,definitions});
    assert.ok(result.recommendations.some(x=>x.code==='culture'&&x.needEuphoria===300));
    const good=advisor.advise({profile:'donor',stock,entities:city,definitions});
    assert.equal(good.recommendations.some(x=>x.code==='culture'),false);
});

test('candidate builds are not falsely declared buildable without verified cost and layout',()=>{
    const defs={bakery:def('Bakery','production',-50,0,{guild_raids_supplies:200})};
    const c=advisor.rankBuilds(defs,'donor','supplies',400,800,stock);
    assert.equal(c.length,1);
    assert.equal(c[0].affordable,null); // Missing game cost
    assert.equal(c[0].verifiedAvailability,false);
    assert.equal(c[0].verifiedLayout,false);
});

test('known cost rejects unavailable stock and respects donor reserve',()=>{
    const building=def('Bakery','production',-50,0,{guild_raids_supplies:200});
    building.requirements={cost:{resources:{
        guild_raids_money:60000,guild_raids_supplies:20000
    }}};
    const res=advisor.rankBuilds({bakery:building},'donor','supplies',
        400,800,stock,{guild_raids_money:50000});
    assert.equal(res[0].affordable,false);
    assert.ok(res[0].shortages.guild_raids_money>0);
    assert.equal(res[0].verifiedAvailability,false);
});

test('no sale recommendation when QA boost is present in cultural building',()=>{
    const culture=def('Church','culture',0,50);
    culture.components.AllAge.boosts={boosts:[{
        type:'guild_raids_action_points_collection',value:50
    }]};
    const result=advisor.advise({
        stock:{...stock,guild_raids_happiness:3000},
        entities:[{cityentity_id:'church',state:{__class__:'IdleState'}}],
        definitions:{church:culture}
    });
    assert.equal(result.recommendations.some(x=>x.code==='review-sell'),false);
});

test('an actual selling option must remain un-actionable without placement check',()=>{
    const d=def('Marketplace','culture',0,50);
    const result=advisor.advise({
        stock:{...stock,guild_raids_happiness:3000},
        entities:[{cityentity_id:'m',state:{__class__:'IdleState'}}],
        definitions:{m:d}
    });
    const selling=result.recommendations.find(x=>x.code==='review-sell');
    assert.ok(selling);
    assert.equal(selling.actionable,false);
    assert.match(selling.limitations,/NEPRODÁVAT/);
});

test('donor recommendations never claim surpluses without manual reserves',()=>{
    const defs={home:def('Estate','residential',100,0)};
    const entities=[{cityentity_id:'home'}];
    const noReserve=advisor.advise({profile:'donor',stock,entities,definitions:defs});
    assert.ok(noReserve.blockers.some(x=>x.includes('chráněná rezerva')));
    const withReserve=advisor.advise({profile:'donor',stock,entities,
        definitions:defs,reserves:{
            guild_raids_money:95000,guild_raids_supplies:70000
        }});
    const donation=withReserve.recommendations.find(x=>x.code==='donate');
    assert.equal(donation.actionable,false);
    assert.equal(donation.surplusAboveManualReserve.guild_raids_money,5000);
});

test('schema discovery finds nested price structure without emitting values or entity ids',()=>{
    const bakery=def('Bakery','production',-50,0,{guild_raids_supplies:100});
    bakery.components.AllAge.constructionCost={
        resources:{guild_raids_money:42000,guild_raids_supplies:21500,guild_raids_chrono_alloy:200}
    };
    bakery.player_id=9999;
    const report=advisor.priceSchemaDiscovery({'secret-city-identifier':bakery});
    assert.equal(report.examinedDefinitions,1);
    assert.equal(report.definitionsWithQIPriceTokens,1);
    const path=report.paths.find(x=>x.priceContext&&x.money&&x.supplies&&x.alloy);
    assert.ok(path);
    assert.match(path.path,/constructionCost/);
    const text=JSON.stringify(report);
    assert.equal(text.includes('9999'),false);
    assert.equal(text.includes('secret-city-identifier'),false);
    assert.equal(text.includes('42000'),false);
    assert.equal(text.includes('21500'),false);
});

test('price schema probe handles empty metadata and does not invent prices',()=>{
    assert.equal(advisor.priceSchemaDiscovery(null),null);
    const bakery=def('Bakery','production',-20,0,{guild_raids_supplies:100});
    const result=advisor.priceSchemaDiscovery({bakery});
    assert.equal(result.examinedDefinitions,1);
    assert.equal(result.definitionsWithQIPriceTokens,0);
    assert.equal(result.paths.every(x=>!x.priceContext),true);
});

test('unpriced building candidates are not presented as prioritized investments',()=>{
    const bakery=def('Bakery','production',-50,0,{
        guild_raids_supplies:400
    });
    const result=advisor.advise({
        profile:'donor',stock,entities:[{cityentity_id:'bakery'}],
        definitions:{bakery}
    });
    assert.equal(result.recommendations.some(x=>x.code==='build-candidate'),false);
    assert.ok(result.blockers.some(x=>x.includes('stavební ceny QI nejsou ověřené')));
});

test('live schema: a unique AllAge direct component cost yields spendable QI build costs',()=>{
    const bakery=def('Bakery','production',-50,0,{guild_raids_supplies:800});
    bakery.components.AllAge.buildingRequirements={cost:{resources:{
        guild_raids_money:42000,guild_raids_supplies:21500,
        guild_raids_chrono_alloy:125,guild_raids_rope:8
    }}};
    const price=advisor.priceEvidence(bakery);
    assert.equal(price.status,'metadata-candidate');
    assert.equal(price.source,'components.AllAge.[component].cost.resources');
    assert.equal(price.cost.guild_raids_money,42000);
    assert.equal(price.cost.guild_raids_rope,8);
    const ranked=advisor.rankBuilds({bakery},'donor','supplies',500,1200,{
        ...stock,guild_raids_rope:7
    });
    assert.equal(ranked.length,1);
    assert.equal(ranked[0].affordable,false);
    assert.equal(ranked[0].shortages.guild_raids_rope,1);
});

test('production input cost is never interpreted as building price',()=>{
    const bakery=def('Bakery','production',-50,0);
    bakery.components.AllAge.production={options:[{products:[{
        requirements:{resources:{guild_raids_money:5000,guild_raids_supplies:2500}}
    }]}]};
    assert.equal(advisor.moneyCost(bakery),null);
    assert.equal(advisor.priceEvidence(bakery).status,'unknown');
});

test('ambiguous and unknown positive cost resources block affordability assertions',()=>{
    const bakery=def('Bakery','production',-50,0,{guild_raids_supplies:1000});
    bakery.components.AllAge.buildingRequirements={cost:{resources:{
        guild_raids_money:6000,guild_raids_supplies:8000
    }}};
    bakery.components.AllAge.purchaseRequirements={cost:{resources:{
        guild_raids_money:9000,guild_raids_supplies:3000
    }}};
    assert.equal(advisor.priceEvidence(bakery).status,'ambiguous');
    assert.equal(advisor.moneyCost(bakery),null);
    delete bakery.components.AllAge.purchaseRequirements;
    bakery.components.AllAge.buildingRequirements.cost.resources.diamonds=10;
    assert.equal(advisor.moneyCost(bakery),null);
});

test('missing resource cost stays unknown, not silently zero',()=>{
    const bakery=def('Bakery','production',-50,0,{guild_raids_supplies:100});
    bakery.components.AllAge.buildingRequirements={cost:{resources:{
        guild_raids_money:9000,guild_raids_supplies:0
    }}};
    assert.deepEqual(advisor.moneyCost(bakery),{guild_raids_money:9000});
    const sample=advisor.priceSamples({bakery});
    assert.equal(sample.summary.priced,1);
    assert.equal(sample.samples[0].priceStatus,'metadata-candidate');
    assert.equal(sample.samples[0].costs.guild_raids_money,9000);
    assert.equal(sample.samples[0].costs.guild_raids_supplies,undefined);
});

test('cost samples avoid ids, map coordinates and player data',()=>{
    const bakery=def('Bakery','production',-50,0,{guild_raids_supplies:500});
    bakery.components.AllAge.aBuildingPrice={cost:{resources:{
        guild_raids_money:10000,guild_raids_supplies:6000
    }}};
    bakery.player_id=112233;
    const output=advisor.priceSamples({'secret-entity-id':bakery});
    const json=JSON.stringify(output);
    assert.equal(json.includes('112233'),false);
    assert.equal(json.includes('secret-entity-id'),false);
    assert.equal(json.includes('aBuildingPrice'),false);
    assert.equal(output.samples[0].costs.guild_raids_money,10000);
});
