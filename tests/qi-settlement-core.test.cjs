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

test('reconcile building totals against observed QI resource bag', () => {
    const calculated = {
        totalPopulation: 400, availablePopulation: 200, euphoria: 1000
    };
    const observedStock = {
        guild_raids_total_population: 250,
        guild_raids_population: 50,
        guild_raids_happiness: 250
    };
    const r = core.reconcileEconomy(calculated, observedStock);
    assert.equal(r.source, 'resourceBag');
    assert.equal(r.hasMismatch, true);
    assert.equal(r.calculatedMinusObserved.totalPopulation, 150);
    assert.equal(r.calculatedMinusObserved.availablePopulation, 150);
    assert.equal(r.calculatedMinusObserved.euphoria, 750);
    assert.equal(r.observedUsedPopulation, 200);
    assert.equal(r.calculatedUsedPopulation, 200);
    assert.equal(r.usedPopulationDifference, 0);
    assert.equal(r.observed.euphoriaFactor, 1);
});

test('incomplete observations cannot be represented as zeros', () => {
    const r = core.reconcileEconomy({totalPopulation:100,availablePopulation:25,euphoria:200}, {});
    assert.equal(r.source, 'unknown');
    assert.equal(r.observed.availablePopulation,null);
    assert.equal(r.calculatedMinusObserved.euphoria,null);
    assert.equal(r.hasMismatch,false);
});

test('building state grouping summarizes metadata but never leaks entity ids', () => {
    const groups = core.auditBuildingStates(
        [
            {id:999,cityentity_id:'h',state:{__class__:'ProducingState'}},
            {id:998,cityentity_id:'c',state:{__class__:'UnderConstructionState'}},
            {id:997,cityentity_id:'f',state:{__class__:'IdleState'}}
        ],
        {h:def(150,0),c:def(0,750),f:def(-30,0)}
    );
    assert.equal(groups.producing.populationProvided,150);
    assert.equal(groups.construction.euphoria,750);
    assert.equal(groups.idle.populationUsed,30);
    assert.equal(groups.producing.count,1);
    assert.equal(JSON.stringify(groups).includes('999'),false);
});

test('donation capacity excludes non-spendable pseudo-resources by default',()=>{
    const available = core.donationCapacity({
        guild_raids_money:400,guild_raids_supplies:100,
        guild_raids_happiness:500,guild_raids_population:30,
        guild_raids_action_points:5000,guild_raids_rope:20
    }, {guild_raids_money:150});
    assert.deepEqual(Object.keys(available), ['guild_raids_money','guild_raids_supplies']);
    const withGoods = core.donationCapacity({guild_raids_rope:20},{guild_raids_rope:10},{},{},
        ['guild_raids_rope']);
    assert.equal(withGoods.guild_raids_rope.available,10);
});


test('city A: construction exactly explains +150 population and +750 euphoria', () => {
    const compared=core.reconcileEconomy({
        totalPopulation:1750, availablePopulation:400, euphoria:5300
    },{
        guild_raids_total_population:1600, guild_raids_population:250,
        guild_raids_happiness:4550
    });
    const evidence=core.attributeConstructionGap(compared,{
        construction:{
            count:3,populationProvided:150,populationUsed:120,euphoria:750,
            missingDefinitionCount:0,unknownStatCount:0
        }
    });
    assert.equal(evidence.status,'evaluated');
    assert.equal(evidence.exactMatch,true);
    assert.equal(evidence.usedPopulationMatches,true);
});

test('city B: zero population discrepancy and +2925 euphoria match construction', () => {
    const compared=core.reconcileEconomy({
        totalPopulation:1030, availablePopulation:210, euphoria:5085
    },{
        guild_raids_total_population:1030, guild_raids_population:210,
        guild_raids_happiness:2160
    });
    const evidence=core.attributeConstructionGap(compared,{
        construction:{
            count:3,populationProvided:0,populationUsed:0,euphoria:2925,
            missingDefinitionCount:0,unknownStatCount:0
        }
    });
    assert.equal(evidence.exactMatch,true);
    assert.equal(evidence.populationMatches,true);
    assert.equal(evidence.euphoriaMatches,true);
});

test('construction attribution does not claim exact match on missing or conflicting evidence', () => {
    const compared=core.reconcileEconomy(
        {totalPopulation:150,availablePopulation:150,euphoria:800},
        {guild_raids_total_population:100,guild_raids_population:100,guild_raids_happiness:200}
    );
    assert.equal(core.attributeConstructionGap(compared,{}),null);
    assert.equal(core.attributeConstructionGap(compared,{
        construction:{count:1,populationProvided:50,euphoria:600,
            missingDefinitionCount:0,unknownStatCount:1}
    }).exactMatch,null);
    assert.equal(core.attributeConstructionGap(compared,{
        construction:{count:1,populationProvided:50,euphoria:500,
            missingDefinitionCount:0,unknownStatCount:0}
    }).exactMatch,false);
});
