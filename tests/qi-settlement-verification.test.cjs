/* AGPL-3.0 — independent QI investment plan acceptance checks */
const test=require('node:test');
const assert=require('node:assert/strict');
const verification=require('../js/web/qi-settlement-verification/js/qi-settlement-verification.js');
const M='guild_raids_money',S='guild_raids_supplies',A='guild_raids_chrono_alloy';
const stock={[M]:200000,[S]:150000,[A]:3000};
const validPlan=()=>({
 steps:[{type:'sell',building:'Tannery',gameActionVerified:false},
       {type:'build',building:'Bakery',gameActionVerified:false,
        cost:{[M]:84000,[S]:100000,[A]:1000}}],
 spent:{[M]:84000,[S]:100000,[A]:1000},
 remaining:{[M]:116000,[S]:50000,[A]:2000},
 minFreePopulation:70,minEuphoriaFactor:1.5,
 placementEvidence:'unknown',donationSafetyVerified:false,executable:false
});
const run=(plans,opts={})=>verification.audit({stock,plans,
    profile:'donor',geometry:{status:'insufficient-evidence'},
    activeQI:true,fresh:true,...opts});
test('matching build/sell plan is internally consistent but no executable action',()=>{
 const r=run([validPlan()]);
 assert.equal(r.status,'internally-consistent');
 assert.equal(r.checkedPlans,1);
 assert.equal(r.passedPlans,1);
 assert.equal(r.findings.length,0);
 assert.equal(r.actualGameplayActionsVerified,false);
 assert.equal(r.availability,'unverified');
 assert.equal(r.roadRequirements,'unverified');
 assert.equal(r.readyForManualComparison,true);
});
test('plan spending mismatch flags a numerical budget bug',()=>{
 const p=validPlan();p.spent[M]=83000;
 const r=run([p]);
 assert.equal(r.status,'inconsistent-model');
 assert.ok(r.findings.includes('step-cost-does-not-match-total'));
});
test('a plan claiming unverified donation and gameplay permissions is rejected',()=>{
 const p=validPlan();p.executable=true;p.donationSafetyVerified=true;
 p.steps[1].gameActionVerified=true;
 const r=run([p]);
 assert.equal(r.rejectedPlans,1);
 assert.ok(r.findings.includes('unverified-game-action-incorrectly-authorized'));
 assert.ok(r.findings.includes('step-game-action-incorrectly-verified'));
});
test('donor reserve must survive every modeled purchase',()=>{
 const r=run([validPlan()],{reserves:{[M]:120000}});
 assert.equal(r.status,'inconsistent-model');
 assert.ok(r.findings.includes('protected-reserve-violated'));
});
test('known footprint impossibility must never enter top ranked plans',()=>{
 const p=validPlan();p.placementEvidence='geometry-sequence-no-fit';
 const r=run([p]);
 assert.ok(r.findings.includes('known-geometrically-impossible-plan-included'));
});
test('off-QI, stale and absent economic snapshots do not pass a self-test',()=>{
 for(const overrides of [{activeQI:false},{fresh:false},{stock:null},
      {stock:{[M]:200000,[S]:150000}}]){
    const r=run([validPlan()],overrides);
    assert.equal(r.status,'missing-state');
    assert.equal(r.readyForManualComparison,false);
 }
});
test('outbound report contains neither stock nor metadata entity identifiers',()=>{
 const plan=validPlan();plan.steps[0].building='Tannery';
 const r=run([plan]);
 const data=JSON.stringify(r);
 assert.equal(data.includes('200000'),false);
 assert.equal(data.includes('Tannery'),false);
 assert.equal(data.includes('84000'),false);
 assert.equal(data.includes('guild_raids_money'),false);
});
test('empty but fresh state remains no-candidate rather than false PASS',()=>{
 const result=run([]);
 assert.equal(result.status,'no-candidate-plan');
 assert.equal(result.readyForManualComparison,false);
});
