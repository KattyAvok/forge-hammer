/* AGPL-3.0 — Donor protected investment buffers */
const test=require('node:test');
const assert=require('node:assert/strict');
const donor=require('../js/web/qi-settlement-donation-budget/js/qi-settlement-donation-budget.js');
const p=(cost)=>({steps:[{type:'build',building:'public'}],
    spent:cost,executable:false});
test('alternative plans use the maximum required investment per resource',()=>{
    const r=donor.budget({
        stock:{guild_raids_money:150000,guild_raids_supplies:200000,
            guild_raids_chrono_alloy:1500},
        plans:[p({guild_raids_money:80000,guild_raids_supplies:100000}),
            p({guild_raids_money:120000,guild_raids_supplies:60000})],
        manualReserves:{guild_raids_money:10000,guild_raids_supplies:20000}
    });
    assert.equal(r.status,'investment-reserve-projection');
    assert.equal(r.investmentBuffer.guild_raids_money.protectedTotal,130000);
    assert.equal(r.investmentBuffer.guild_raids_money.aboveModeledProtection,20000);
    assert.equal(r.investmentBuffer.guild_raids_supplies.protectedTotal,120000);
    assert.equal(r.investmentBuffer.guild_raids_supplies.aboveModeledProtection,80000);
    assert.equal(r.safeDonation,null);
    assert.equal(r.donationInstructionAllowed,false);
});
test('missing manual reserves do not become a verified donation allowance',()=>{
    const r=donor.budget({stock:{guild_raids_money:100000},
        plans:[p({guild_raids_money:50000})]});
    assert.equal(r.manualReserveComplete,false);
    assert.equal(r.safeDonation,null);
    assert.equal(r.investmentBuffer.guild_raids_money.aboveModeledProtection,50000);
});
test('a higher investment cost records shortfall without negative spendable stock',()=>{
    const r=donor.budget({stock:{guild_raids_money:10000},
        plans:[p({guild_raids_money:20000})]});
    assert.equal(r.investmentBuffer.guild_raids_money.shortfall,10000);
    assert.equal(r.investmentBuffer.guild_raids_money.aboveModeledProtection,0);
});
test('node and QA figures cannot authorize donation without validated geometry or schedule',()=>{
    const r=donor.budget({stock:{guild_raids_money:200000},
        plans:[p({guild_raids_money:10000})],nodePrice:{guild_raids_money:1000},
        qaCost:100,nodeCostVerified:true,qaVerified:true});
    assert.equal(r.nodeCostVerified,true);
    assert.equal(r.qaCostVerified,true);
    assert.equal(r.safeDonation,null);
    assert.equal(r.donationInstructionAllowed,false);
});
test('invalid costs or missing actual stock do not assert a complete financial buffer',()=>{
    const r=donor.budget({stock:{guild_raids_money:10000},
        plans:[p({guild_raids_money:1500,guild_raids_supplies:1000})]});
    assert.equal(r.status,'incomplete-resources');
    assert.equal(r.investmentBuffer.guild_raids_supplies,undefined);
});
test('unmodeled or executable plans are not used to protect a fictional budget',()=>{
    assert.equal(donor.budget({}).status,'missing-plan');
    assert.equal(donor.budget({stock:{},plans:[{steps:[],spent:{}}]}).status,'no-modeled-plan');
});
