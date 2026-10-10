/* AGPL-3.0 — node cost candidates never authorize contributions */
const test=require('node:test');
const assert=require('node:assert/strict');
const nodeBudget=require('../js/web/qi-settlement-node-budget/js/qi-settlement-node-budget.js');
const M='guild_raids_money',S='guild_raids_supplies';
test('one explicit requirements bundle can be assessed only as an unverified candidate',()=>{
 const data={nodes:[{id:'private-node',location:{x:545,y:530},
  choices:[{requirements:{resources:{[M]:20000,[S]:3000}},
    actionPoints:40}]}]};
 const snap=nodeBudget.extract(data);
 const res=nodeBudget.evaluate(snap,{[M]:50000,[S]:5000},
    {[M]:10000,[S]:2000});
 assert.equal(res.coverage.explicitlyPricedCandidates,1);
 assert.equal(res.coverage.grossBudgetCovered,1);
 assert.equal(res.coverage.protectedBudgetCovered,1);
 assert.equal(res.coverage.qaFieldCandidates,1);
 assert.equal(res.safeDonation,null);
 assert.equal(res.donationInstructionAllowed,false);
 const output=JSON.stringify(res);
 for(const x of ['private-node','545','530','20000','3000'])
  assert.equal(output.includes(x),false);
});
test('unclassified QI resources and rewards cannot become spendable node prices',()=>{
 const snap=nodeBudget.extract({nodes:[{
  rewards:[{resources:{guild_raids_chrono_alloy:99}}],
  options:[{mystery:{resources:{[M]:1000}}}]
 }]});
 const r=nodeBudget.evaluate(snap,{[M]:10000},{[M]:0});
 assert.equal(r.coverage.explicitlyPricedCandidates,0);
 assert.equal(r.coverage.rewardBundles,1);
 assert.equal(r.coverage.unclassifiedResourceBundles,1);
 assert.equal(r.status,'unclassified-node-data');
});
test('multiple alternative prices are ambiguous and not additive',()=>{
 const snap=nodeBudget.extract({nodes:[{
  choices:[{requirements:{resources:{[M]:100}}},
    {requirements:{resources:{[S]:100}}}]
 }]});
 const r=nodeBudget.evaluate(snap,{[M]:1000,[S]:1000},
    {[M]:0,[S]:0});
 assert.equal(r.coverage.ambiguousNodePricing,1);
 assert.equal(r.coverage.explicitlyPricedCandidates,0);
});
test('unknown balances or missing reserves cannot authorize contribution',()=>{
 const snap=nodeBudget.extract({nodes:[{
  cost:{resources:{guild_raids_rope:20}}
 }]});
 const insufficient=nodeBudget.evaluate(snap,{[M]:1000},{[M]:0});
 assert.equal(insufficient.coverage.unknownBalances,1);
 const gross=nodeBudget.evaluate(snap,{guild_raids_rope:50},{});
 assert.equal(gross.coverage.grossBudgetCovered,1);
 assert.equal(gross.coverage.protectedBudgetCovered,0);
 assert.equal(gross.donationInstructionAllowed,false);
});
test('reject malformed or missing node observations without any fictitious prices',()=>{
 const e=nodeBudget.extract(null);
 const r=nodeBudget.evaluate(e,{});
 assert.equal(e.status,'no-nodes');
 assert.equal(r.status,'no-node-contract');
 assert.equal(r.safeDonation,null);
});
test('non-QI and invalid resources do not become a valid price',()=>{
 const snap=nodeBudget.extract({nodes:[{
  requirements:{resources:{[M]:-100,[S]:300,forge_points:22}}
 }]});
 const r=nodeBudget.evaluate(snap,{[M]:1000,[S]:1000});
 assert.equal(r.coverage.explicitlyPricedCandidates,0);
 assert.equal(r.donationInstructionAllowed,false);
});

test('unknown positive resource in otherwise valid QI node price cannot be ignored',()=>{
 const snapshot=nodeBudget.extract({nodes:[{
   requirements:{resources:{guild_raids_money:1000,diamonds:10}}
 }]});
 const r=nodeBudget.evaluate(snapshot,{guild_raids_money:2000},
    {guild_raids_money:0});
 assert.equal(r.coverage.explicitlyPricedCandidates,0);
 assert.equal(r.coverage.unknownBalances,1);
 assert.equal(r.coverage.grossBudgetCovered,0);
 assert.equal(r.donationInstructionAllowed,false);
});

test('live 28-node sample with three QA alternatives per node is recognized',()=>{
    const nodes=Array.from({length:28},(_,i)=>({
        id:'private-node-'+i,
        choices:[
            {requirements:{resources:{guild_raids_action_points:100}}},
            {requirements:{resources:{guild_raids_action_points:200}}},
            {requirements:{resources:{guild_raids_action_points:400}}}
        ]
    }));
    const snap=nodeBudget.extract({nodes});
    const r=nodeBudget.evaluate(snap,{guild_raids_action_points:250},{});
    assert.equal(r.status,'qa-only-option-candidates');
    assert.equal(r.coverage.nodesObserved,28);
    assert.equal(r.coverage.qaOnlyCostBundles,84);
    assert.equal(r.coverage.nodesWithQACostCandidates,28);
    assert.equal(r.coverage.nodesWithMultipleQAOptions,28);
    assert.equal(r.coverage.qaGrossCoveredOptions,56);
    assert.equal(r.coverage.qaNotCoveredOptions,28);
    assert.equal(r.coverage.explicitlyPricedCandidates,0);
    assert.equal(r.qaResourceFieldObserved,true);
    assert.equal(r.qaCostSemanticsVerified,false);
    assert.equal(r.safeDonation,null);
    assert.equal(r.donationInstructionAllowed,false);
    const output=JSON.stringify(r);
    assert.equal(output.includes('private-node'),false);
    for(const amount of ['"100"','"200"','"400"'])
        assert.equal(output.includes(amount),false);
});
test('QA and QI money in one price are not mistaken for a free-QA purchase',()=>{
    const snap=nodeBudget.extract({nodes:[{
        payment:{resources:{guild_raids_action_points:100,
            guild_raids_money:25000}}
    }]});
    const r=nodeBudget.evaluate(snap,{
        guild_raids_action_points:50,guild_raids_money:50000
    },{guild_raids_money:5000});
    assert.equal(r.coverage.mixedQAAndGoodsCostBundles,1);
    assert.equal(r.coverage.qaNotCoveredOptions,1);
    assert.equal(r.coverage.explicitlyPricedCandidates,1);
    assert.equal(r.coverage.grossBudgetCovered,1);
    assert.equal(r.donationInstructionAllowed,false);
});
test('QA-only bundle without QA stock remains an unknown affordable candidate',()=>{
    const snap=nodeBudget.extract({nodes:[{
        cost:{resources:{guild_raids_action_points:110}}
    }]});
    const r=nodeBudget.evaluate(snap,{guild_raids_money:100000},{});
    assert.equal(r.coverage.qaUnknownStockOptions,1);
    assert.equal(r.coverage.grossBudgetCovered,0);
    assert.equal(r.status,'qa-only-option-candidates');
});
