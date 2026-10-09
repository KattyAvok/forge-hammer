/* AGPL-3.0 - versioned QI strategy-guide tests */
const test = require('node:test');
const assert = require('node:assert/strict');
const guides = require('../js/web/qi-settlement-strategies/js/qi-settlement-strategies.js');

test('Fighter and Donor have every stage, in manual order',()=>{
    assert.equal(guides.stages.length,8);
    for (const stage of guides.stages) {
        assert.ok(guides.stageNames[stage]);
        assert.ok(guides.getSteps('fighter',stage).length>0);
        assert.ok(guides.getSteps('donor',stage).length>0);
    }
});
test('Fighter military stages are distinct from Donor',()=>{
    assert.match(guides.getSteps('fighter','day3a').join(' '), /Catapult/);
    assert.match(guides.getSteps('fighter','day4b').join(' '), /Trebuchet/);
    assert.doesNotMatch(guides.getSteps('donor','day4b').join(' '), /Trebuchet/);
});
test('guide copies are immutable at source',()=>{
    const steps=guides.getSteps('donor','day1a');
    steps.push('mutation');
    assert.equal(guides.getSteps('donor','day1a').includes('mutation'),false);
    assert.deepEqual(guides.getSteps('fighter','invalid-stage'),[]);
});
