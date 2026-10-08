/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 * Run: node --test tests/qi-settlement-core.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/web/qi-settlement-core/js/qi-settlement-core.js');

test('running/pending states and missing difficulty are distinct', () => {
    assert.deepEqual(core.normalizeRun({__class__:'GuildRaidsRunningState',raidInstance:{difficultyLevel:5}}), {
        status:'running', difficultyLevel:5
    });
    assert.equal(core.normalizeRun({__class__:'GuildRaidsPendingState'}).status, 'pending');
    assert.equal(core.normalizeRun({__class__:'GuildRaidsRunningState'}).difficultyLevel, null);
});

test('QI resources: nested payload, zero as observed and no unrelated inventory', () => {
    assert.deepEqual(core.normalizeQIStock({resources:{resources:{
        guild_raids_money:0, guild_raids_supplies:150, coins:400, player_id:123,
        guild_raids_chrono_alloy:-5, guild_raids_unsafe:NaN
    }}}), {guild_raids_money:0,guild_raids_supplies:150});
    assert.deepEqual(core.normalizeQIStock({resources:{guild_raids_money:42}}), {guild_raids_money:42});
    assert.deepEqual(core.normalizeQIStock(null), {});
});

test('map derived counts omit entity identifiers and coordinates', () => {
    assert.deepEqual(core.normalizeMap({entities:[
        {id:99,x:5,y:8,state:{__class__:'ProducingState'}},
        {id:100,state:{__class__:'IdleState'}}
    ],unlocked_areas:[{},{}]}), {
        entityCount:2, unlockedAreaCount:2, producingCount:1
    });
    assert.equal(core.normalizeMap(null), null);
    assert.equal(core.normalizeMap({}).entityCount, null);
});

const def = (population, euphoria) => ({
    components:{AllAge:{staticResources:{resources:{resources:{
        guild_raids_population:population,guild_raids_happiness:euphoria
    }}}}}
});

test('euphoria ratio boundary 2.0 yields factor 1.5', () => {
    const res=core.deriveEconomy([{cityentity_id:'home'},{cityentity_id:'culture'}],
        {home:def(100,0),culture:def(0,200)});
    assert.equal(res.complete,true);
    assert.equal(res.totalPopulation,100);
    assert.equal(res.availablePopulation,100);
    assert.equal(res.euphoriaFactor,1.5);
});

test('population consumption and deficit are applied', () => {
    const res=core.deriveEconomy([{cityentity_id:'home'},{cityentity_id:'factory'}],
        {home:def(100,0),factory:def(-35,0)});
    assert.equal(res.totalPopulation,100);
    assert.equal(res.availablePopulation,65);
});

test('missing metadata never produces falsely precise economy totals', () => {
    const res=core.deriveEconomy([{cityentity_id:'unknown'}],{});
    assert.equal(res.complete,false);
    assert.equal(res.missingDefinitionCount,1);
    assert.equal(res.availablePopulation,null);
    assert.equal(res.euphoria,null);
    assert.equal(res.euphoriaFactor,null);
    assert.equal(core.deriveEconomy(null,{}),null);
});

test('donation available = max(0, held - max(minimum, plan + buffer))', () => {
    assert.deepEqual(core.donationCapacity(
        {guild_raids_money:500},{guild_raids_money:300},
        {guild_raids_money:100},{guild_raids_money:50}
    ).guild_raids_money,{held:500,protected:350,available:150});
    assert.equal(core.donationCapacity(
        {guild_raids_money:10},{guild_raids_money:300}
    ).guild_raids_money.available,0);
});

test('unknown stock, invalid values and unobserved resources are not treated as zero', () => {
    assert.equal(core.donationCapacity({}, {guild_raids_money:300}).guild_raids_money.available,null);
    assert.equal(core.donationCapacity(
        {guild_raids_money:-1},{guild_raids_money:0}
    ).guild_raids_money.available,null);
    assert.equal(core.donationCapacity(null,{}),null);
});

test('external identifiers and unrelated resource keys are ignored', () => {
    const result=core.donationCapacity(
        {guild_raids_money:200,player_id:20},
        {guild_raids_money:60,player_id:5});
    assert.deepEqual(Object.keys(result),['guild_raids_money']);
});
