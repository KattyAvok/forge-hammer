/* AGPL-3.0 — passive QI response contract evidence */
const test=require('node:test');
const assert=require('node:assert/strict');
const contracts=require('../js/web/qi-settlement-contracts/js/qi-settlement-contracts.js');
test('node cost paths are visible but amounts, ids and tokens are not',()=>{
    const p=contracts.create();
    p.observe('qi-map-overview',{private_secret:'the-secret-0123',
        nodes:[{node_id:'k4-person-id',requirements:{
            resources:{guild_raids_money:123456,guild_raids_supplies:400}
        }}]});
    const report=p.report();
    assert.equal(report.status,'observed');
    assert.equal(report.eventCounts['qi-map-overview'],1);
    const output=JSON.stringify(report);
    assert.match(output,/requirements/);
    assert.equal(output.includes('123456'),false);
    assert.equal(output.includes('the-secret-0123'),false);
    assert.equal(output.includes('k4-person-id'),false);
    assert.equal(output.includes('private_secret'),false);
});
test('structural report starts empty and tracks allowed methods only',()=>{
    const p=contracts.create();
    assert.equal(p.report().status,'not-observed');
    p.observe('another-service',{node:{cost:100}});
    assert.equal(p.report().status,'not-observed');
    p.observe('qi-unit-info',{units:[{unit_id:'secret-unit',health:100}]});
    assert.equal(p.report().status,'observed');
    assert.equal(p.report().eventCounts['qi-unit-info'],1);
    assert.equal(JSON.stringify(p.report()).includes('secret-unit'),false);
});
test('cycles and very large arrays remain bounded',()=>{
    const p=contracts.create();
    const node={cost:{resources:{guild_raids_rope:10}}};
    node.self=node;
    p.observe('qi-run-state',{nodes:Array.from({length:1000},()=>node)});
    assert.ok(p.report().structuralPaths.length<=35);
    assert.equal(JSON.stringify(p.report()).includes('"10"'),false);
});

test('QI nodes expose anonymous resource bundle counts without leaking numeric costs',()=>{
    const p=contracts.create();
    p.observe('qi-map-overview',{nodes:[
        {id:'player-secret',choices:[{option:{requirements:{resources:{
            guild_raids_money:424242,guild_raids_supplies:121212}}}}]},
        {id:'another-secret',rewards:[{resources:{
            guild_raids_rope:777777}}]},
        {id:'no-resource',state:{active:true}}
    ]});
    const r=p.report().nodeResourceBundles;
    assert.equal(r.nodesScanned,3);
    assert.equal(r.nodesWithBundles,2);
    assert.equal(r.bundles,2);
    assert.equal(r.context.possibleCost,1);
    assert.equal(r.context.reward,1);
    assert.equal(r.keys.guild_raids_money,1);
    assert.equal(r.keys.guild_raids_rope,1);
    const text=JSON.stringify(r);
    assert.equal(text.includes('424242'),false);
    assert.equal(text.includes('121212'),false);
    assert.equal(text.includes('777777'),false);
    assert.equal(text.includes('player-secret'),false);
});
