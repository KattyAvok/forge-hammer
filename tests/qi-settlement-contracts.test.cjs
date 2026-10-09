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
