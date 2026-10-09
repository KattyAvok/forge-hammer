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
    assert.equal(selling,undefined); // not an explicitly recognized alias/building
});

test('donor recommendations never claim surpluses without manual reserves',()=>{
    const defs={home:def('Estate','residential',100,0)};
    const entities=[{cityentity_id:'home'}];
    const noReserve=advisor.advise({profile:'donor',stock,entities,definitions:defs});
    assert.ok(noReserve.blockers.some(x=>x.includes('protected reserve')));
    const withReserve=advisor.advise({profile:'donor',stock,entities,
        definitions:defs,reserves:{
            guild_raids_money:95000,guild_raids_supplies:70000
        }});
    const donation=withReserve.recommendations.find(x=>x.code==='donate');
    assert.equal(donation.actionable,false);
    assert.equal(donation.surplusAboveManualReserve.guild_raids_money,5000);
});
