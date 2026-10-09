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
