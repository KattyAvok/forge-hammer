/* AGPL-3.0 — metadata production discovery tests */
const test=require('node:test');
const assert=require('node:assert/strict');
const production=require('../js/web/qi-settlement-production/js/qi-settlement-production.js');
test('inputs and output are distinct; no simulated return-on-investment time',()=>{
    const metadata={bakery:{name:'Bakery',
      components:{AllAge:{production:{options:[{
        timeInSeconds:3600,products:[{
          requirements:{resources:{guild_raids_money:1000}},
          playerResources:{resources:{guild_raids_supplies:3000,coins:20000}}
        }]
      }]}}}
    }};
    const x=production.inspect(metadata);
    assert.equal(x.options,1);
    assert.equal(x.optionsWithQIInputs,1);
    assert.equal(x.optionsWithQIOutputs,1);
    assert.equal(x.optionsWithPotentialDuration,1);
    assert.equal(x.timeUnitsVerified,false);
    assert.equal(x.samples[0].input.guild_raids_money,1000);
    assert.equal(x.samples[0].output.guild_raids_supplies,3000);
    assert.equal(x.samples[0].output.coins,undefined);
    assert.equal(x.samples[0].timeFields[0],'option.timeInSeconds');
});
test('missing production metadata is unknown, not a free or zero cycle',()=>{
    assert.equal(production.inspect(null),null);
    const result=production.inspect({bakery:{name:'Bakery',components:{AllAge:{}}}});
    assert.equal(result.options,0);
    assert.equal(result.optionsWithQIOutputs,0);
    assert.equal(result.timeUnitsVerified,false);
});
test('bounded samples do not disclose raw identifiers or player records',()=>{
    const entry={name:'Bakery',private_id:'private_account_867',
        components:{AllAge:{production:{options:[{
            products:[{playerResources:{resources:{guild_raids_money:100}}}]
        }]}}}};
    const x=production.inspect({secret_entity_867:entry});
    const serialized=JSON.stringify(x);
    assert.equal(serialized.includes('secret_entity_867'),false);
    assert.equal(serialized.includes('private_account_867'),false);
});
test('QI bonus summary reads allowlisted static values only',()=>{
    const x=production.qiBoostSummary({Sums:{
        'guild_raids_coins_production':20,
        'guild_raids-att_boost_attacker':90,
        player_id:123456,
        secret_token:'abcd'
    }});
    assert.equal(x.status,'observed');
    assert.equal(x.fields['guild_raids_coins_production'],20);
    assert.equal(x.fields['guild_raids-att_boost_attacker'],90);
    assert.equal(JSON.stringify(x).includes('123456'),false);
    assert.equal(JSON.stringify(x).includes('abcd'),false);
});

test('single production cycle follows existing QI euphoria plus production boost',()=>{
 const building={name:'Bakery',type:'production',components:{AllAge:{
  production:{options:[{time:14400,products:[{
   playerResources:{resources:{guild_raids_supplies:3000}},
   requirements:{resources:{guild_raids_money:500}}
  }]}]}
 }}};
 const stock={guild_raids_happiness:2000,guild_raids_total_population:1000};
 const sums={guild_raids_supplies_production:150};
 const value=production.estimateCycle(building,stock,sums);
 assert.equal(value.status,'estimated-cycle');
 assert.equal(value.output.guild_raids_supplies,9000);
 assert.equal(value.net.guild_raids_money,-500);
 assert.equal(value.optionTime,14400);
 assert.equal(value.optionTimeUnit,'unverified');
 const payback=production.perResourcePayback(building,
  {guild_raids_supplies:100000,guild_raids_money:84000},stock,sums);
 assert.equal(payback.cycles.guild_raids_supplies,12);
 assert.equal(payback.cycles.guild_raids_money,null);
 assert.equal(payback.timePaybackVerified,false);
});
test('main building bypasses euphoria and coins production boosts',()=>{
 const building={name:'Town Hall',type:'main_building',
  components:{AllAge:{production:{options:[{products:[{
   playerResources:{resources:{guild_raids_money:500}}
  }]}]}}}};
 const result=production.estimateCycle(building,
  {guild_raids_happiness:0,guild_raids_total_population:1000},
  {guild_raids_coins_production:150});
 assert.equal(result.output.guild_raids_money,500);
 assert.equal(result.multipliers.guild_raids_money,1);
});
test('multiple QI production choices cannot be treated as one deterministic cycle',()=>{
 const building={components:{AllAge:{production:{options:[{},{}]}}}};
 assert.equal(production.estimateCycle(building,{}).status,
  'unresolved-production-option');
});
test('missing euphoria blocks speculative production yields',()=>{
 const building={components:{AllAge:{production:{options:[{products:[{
  playerResources:{resources:{guild_raids_money:2000}}
 }]}]}}}};
 assert.equal(production.estimateCycle(building,{}).status,'missing-observed-euphoria');
});
