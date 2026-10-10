const test=require('node:test');
const assert=require('node:assert/strict');
const readiness=require('../js/web/qi-settlement-readiness/js/qi-settlement-readiness.js');
test('production transitions grouped by accurate observed seconds',()=>{
 const e=[
  {id:999,cityentity_id:'private',state:{__class__:'ProducingState',next_state_transition_in:120}},
  {state:{__class__:'ProducingState',next_state_transition_in:7200}},
  {state:{__class__:'ProducingState',next_state_transition_in:18000}},
  {state:{__class__:'IdleState',next_state_transition_in:60}}
 ];
 const result=readiness.summarize(e);
 assert.equal(result.active,3);
 assert.equal(result.within1Hour,1);
 assert.equal(result.within3Hours,2);
 assert.equal(result.within24Hours,3);
 assert.equal(result.nearestTransitionMinutes,2);
 assert.equal(result.outputAmountsKnown,false);
 assert.equal(JSON.stringify(result).includes('private'),false);
 assert.equal(JSON.stringify(result).includes('999'),false);
});
test('unknown transition time is not zero or proof that production is ready',()=>{
 const result=readiness.summarize([
  {state:{__class__:'ProducingState',next_state_transition_in:null}},
  {state:{__class__:'ProducingState',next_state_transition_in:-1}},
  {state:{__class__:'CompletedState'}}
 ]);
 assert.equal(result.active,2);
 assert.equal(result.unknownTime,2);
 assert.equal(result.nearestTransitionMinutes,null);
 assert.equal(result.status,'unknown-production-transition');
});
test('off-map idle and missing entities cannot become fictitious production',()=>{
 assert.equal(readiness.summarize(null).status,'missing-map');
 assert.equal(readiness.summarize([]).status,'no-active-production-observed');
});
