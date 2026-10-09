/* AGPL-3.0 — production time unit evidence and horizon safety */
const test=require('node:test');
const assert=require('node:assert/strict');
const timing=require('../js/web/qi-settlement-timing/js/qi-settlement-timing.js');
const def=(duration)=>({components:{AllAge:{production:{options:[{
    time:duration,products:[{playerResources:{resources:{guild_raids_money:1000}}}]
}]}}}});
function states(ratios){
    const defs={a:def(3600),b:def(14400),c:def(3600),d:def(14400)};
    const keys=['a','b','c','d'];
    return {defs,entities:ratios.map((ratio,i)=>({
        cityentity_id:keys[i],
        state:{__class__:'ProducingState',
            next_state_transition_in:defs[keys[i]].components.AllAge.production.options[0].time*ratio}
    }))};
}
test('two durations with several near-full second-based states corroborate second hypothesis',()=>{
    const {defs,entities}=states([1,.995,.993]);
    const x=timing.inspect(entities,defs);
    assert.equal(x.status,'unit-corroborated');
    assert.equal(x.unit,'seconds');
    assert.equal(x.timeUnitVerified,false);
    assert.equal(x.canUseForIllustrativeHorizon,true);
});
test('ordinary mid-cycle snapshots are not evidence for time units',()=>{
    const {defs,entities}=states([.12,.35,.59,.8]);
    const x=timing.inspect(entities,defs);
    assert.equal(x.unit,'unknown');
    assert.equal(x.status,'insufficient-calibration');
});
test('seconds cannot be inferred from a production option with multiple choices',()=>{
    const {defs,entities}=states([1,.995,1,.994]);
    defs.a.components.AllAge.production.options.push({time:60});
    defs.b.components.AllAge.production.options.push({time:120});
    const x=timing.inspect(entities,defs);
    assert.equal(x.unit,'unknown');
});
test('missing map and unverifiable field names fail closed',()=>{
    assert.equal(timing.inspect(null,{}).status,'missing-evidence');
    const defs={a:def(600)};
    const entities=[{cityentity_id:'a',state:{__class__:'IdleState',next_state_transition_in:600}}];
    assert.equal(timing.inspect(entities,defs).samples,0);
});
test('unverified duration prevents hours-based resource claims',()=>{
    const plan={steps:[{type:'build',building:'Bakery',
        rawProductionOptionTime:3600,productionGain:{guild_raids_supplies:500}}]};
    const p=timing.theoreticalPlanHorizon(plan,68,{status:'insufficient-calibration',unit:'unknown'});
    assert.equal(p.status,'time-unit-unverified');
    assert.equal(p.spendableGains,null);
    assert.equal(p.optimisticUpperBound,null);
});
test('corroborated time permits only optimistic no-construction-delay projection',()=>{
    const {defs,entities}=states([1,.995,1]);
    const calibration=timing.inspect(entities,defs);
    const plan={steps:[
        {type:'sell',building:'Tannery',rawProductionOptionTime:3600,
            productionLoss:{guild_raids_supplies:200}},
        {type:'build',building:'Bakery',rawProductionOptionTime:14400,
            productionGain:{guild_raids_supplies:2000,guild_raids_money:-100}}
    ]};
    const x=timing.theoreticalPlanHorizon(plan,8,calibration);
    assert.equal(x.status,'zero-delay-comparison');
    assert.equal(x.optimisticUpperBound,null);
    assert.equal(x.comparisonOnly,true);
    assert.equal(x.possibleResourceDelta.guild_raids_supplies,2400);
    assert.equal(x.possibleResourceDelta.guild_raids_money,-200);
    assert.equal(x.spendableGains,null);
    assert.equal(x.actionable,false);
});
test('unknown production option duration blocks future gains even with calibrated unit',()=>{
    const plan={steps:[{type:'build',building:'Bakery',
        rawProductionOptionTime:null,productionGain:{guild_raids_supplies:1000}}]};
    const x=timing.theoreticalPlanHorizon(plan,12,{
        status:'unit-corroborated',unit:'seconds'
    });
    assert.equal(x.status,'unknown-cycle-duration');
    assert.equal(x.optimisticUpperBound,null);
});

test('signed net differences cannot be described as a benefit upper bound',()=>{
    const calibrated={status:'unit-corroborated',unit:'seconds'};
    const plan={steps:[
        {type:'sell',building:'Old Brewery',
            rawProductionOptionTime:3600,
            productionLoss:{guild_raids_money:2000}},
        {type:'build',building:'Printer',
            rawProductionOptionTime:7200,
            productionGain:{guild_raids_money:500}}
    ]};
    const r=timing.theoreticalPlanHorizon(plan,2,calibrated);
    assert.equal(r.status,'zero-delay-comparison');
    assert.equal(r.possibleResourceDelta.guild_raids_money,-3500);
    assert.equal(r.optimisticUpperBound,null);
    assert.equal(r.spendableGains,null);
    assert.equal(r.actionable,false);
});
