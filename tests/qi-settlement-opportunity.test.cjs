/* AGPL-3.0 — production transition versus demolition opportunity tests */
const test=require('node:test');
const assert=require('node:assert/strict');
const opportunity=require('../js/web/qi-settlement-opportunity/js/qi-settlement-opportunity.js');
const production=(name,time=null,state='ProducingState',id=1)=>({
  id,cityentity_id:name,x:512,y:523,
  state:{__class__:state,next_state_transition_in:time}
});
const definition=(name,options)=>({
 name,type:'production',
 components:{AllAge:{staticResources:{resources:{resources:{
  guild_raids_population:-50
 }}},production:{options}}}
});
const opt=(amount)=>({time:3600,products:[{
 playerResources:{resources:{guild_raids_supplies:amount}}
}]});
const stock={guild_raids_total_population:1000,guild_raids_happiness:2100};
test('wait decision is based on observed transition, never claimed collection',()=>{
 const defs={Bakery:definition('Bakery',[opt(1000)])};
 const x=opportunity.assess({entities:[production('Bakery',120)],definitions:defs,
  stock,boosts:{guild_raids_supplies_production:150},horizonHours:2});
 assert.equal(x.status,'production-opportunities-observed');
 assert.equal(x.nearestTransitionMinutes,2);
 assert.equal(x.counts.producing,1);
 const row=x.opportunities[0];
 assert.equal(row.recommendedReview,'wait-for-transition-before-considering-sale');
 assert.equal(row.potentialCycleOutput.guild_raids_supplies,3000);
 assert.equal(row.transitionBeforeQIEnd,true);
 assert.equal(row.safeSaleNow,false);
 assert.equal(row.collectibleVerified,false);
 assert.equal(x.collectibleAmountsCredited,false);
 assert.equal(JSON.stringify(x).includes('512'),false);
 assert.equal(JSON.stringify(x).includes('523'),false);
});
test('completed production is prioritized before running production, not sold now',()=>{
 const defs={Bakery:definition('Bakery',[opt(1000)])};
 const x=opportunity.assess({entities:[
   production('Bakery',4000),production('Bakery',null,'CompletedState',22)
 ],definitions:defs,stock});
 assert.equal(x.counts.completed,1);
 assert.equal(x.counts.producing,1);
 assert.equal(x.opportunities[0].phase,'completed-state');
 assert.equal(x.opportunities[0].recommendedReview,'inspect-collection-before-selling');
 assert.equal(x.opportunities[0].remainingMinutes,null);
});
test('ambiguous production choice never invents the collected amount',()=>{
 const defs={Bakery:definition('Bakery',[opt(1000),opt(2000)])};
 const x=opportunity.assess({entities:[production('Bakery',1200)],definitions:defs,stock});
 assert.equal(x.counts.unknownCycleYields,1);
 assert.equal(x.opportunities[0].potentialCycleOutput,null);
 assert.equal(x.opportunities[0].collectibleVerified,false);
});
test('missing transition duration remains unknown and uncollected',()=>{
 const defs={Bakery:definition('Bakery',[opt(1000)])};
 const x=opportunity.assess({entities:[production('Bakery',null)],definitions:defs,stock});
 assert.equal(x.counts.unknownTransitionTimes,1);
 assert.equal(x.nearestTransitionMinutes,null);
 assert.equal(x.opportunities[0].recommendedReview,'protect-in-progress-production');
 assert.equal(x.opportunities[0].transitionBeforeQIEnd,null);
});
test('existing building types that cannot be sold are excluded from advice',()=>{
 const defs={obstacle:{name:'Rocks',type:'impediment'},
  bakery:definition('Bakery',[opt(1000)])};
 const x=opportunity.assess({entities:[
  production('obstacle',120),{cityentity_id:'bakery',state:{__class__:'IdleState'}}
 ],definitions:defs,stock});
 assert.equal(x.status,'no-busy-producers');
 assert.equal(x.counts.excludedUnrelated,1);
 assert.equal(x.opportunities.length,0);
});
test('observed end-of-run horizon only affects timing label not inventory',()=>{
 const defs={bakery:definition('Bakery',[opt(1000)])};
 const x=opportunity.assess({entities:[production('bakery',10800)],
  definitions:defs,stock,horizonHours:1});
 assert.equal(x.opportunities[0].transitionBeforeQIEnd,false);
 assert.equal(x.opportunities[0].recommendedReview,'transition-beyond-observed-qi-end');
 assert.equal(x.grossResourceAvailabilityUnchanged,true);
});
test('unknown map remains safely unobserved',()=>{
 const x=opportunity.assess({entities:null,definitions:{},stock});
 assert.equal(x.status,'missing-map');
 assert.equal(x.actionable,false);
});

test('short wait before season end remains an uncollected protected production',()=>{
 const defs={bakery:definition('Bakery',[opt(1000)])};
 const x=opportunity.assess({entities:[production('bakery',600)],
     definitions:defs,stock,horizonHours:2});
 assert.equal(x.opportunities[0].transitionBeforeQIEnd,true);
 assert.equal(x.opportunities[0].recommendedReview,'wait-for-transition-before-considering-sale');
 assert.equal(x.opportunities[0].safeSaleNow,false);
});
