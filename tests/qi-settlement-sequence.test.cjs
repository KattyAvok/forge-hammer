/* AGPL-3.0 — bounded QI sequence planning regression tests */
const test=require('node:test');
const assert=require('node:assert/strict');
const seq=require('../js/web/qi-settlement-sequence/js/qi-settlement-sequence.js');
const geometry=require('../js/web/qi-settlement-geometry/js/qi-settlement-geometry.js');
const def=(name,type,pop,happiness,cost,output={},extra={})=>({
    name,type,components:{AllAge:{
        placement:{size:{x:2,y:2}},
        staticResources:{resources:{resources:{
            guild_raids_population:pop,guild_raids_happiness:happiness
        }}},
        buildingRequirements:{cost:{resources:cost}},
        production:{options:[{time:14400,products:[{
            playerResources:{resources:output},
            requirements:{resources:{}}
        }]}]},
        ...extra
    }}
});
const M='guild_raids_money',S='guild_raids_supplies',A='guild_raids_chrono_alloy',
 P='guild_raids_population',T='guild_raids_total_population',H='guild_raids_happiness';
const inventory={
    [M]:150000,[S]:145000,[A]:2500,
    [P]:300,[T]:1000,[H]:2500
};
const bakery=def('Bakery','production',-50,0,
    {[M]:84000,[S]:100000,[A]:1000},{[S]:4000});
const alchemist=def('Alchemist','production',-40,0,
    {[M]:50400,[S]:60000,[A]:200},{[S]:3000});
const printer=def('Printer','production',-20,0,
    {[M]:50400,[S]:43200,[A]:100},{[M]:5000});
const clapboard=def('Clapboard House','residential',150,0,
    {[M]:210000,[S]:200000,[A]:1000},{[M]:1500});
const church=def('Church','culture',0,700,
    {[M]:16800}, {});
const oldFactory=def('Tannery','production',-25,0,{[M]:12000},{[S]:2000});
const house=def('Estate House','residential',200,0,{[M]:16000},{[M]:500});

const definitions={bakery,alchemist,printer,clapboard,church,oldFactory,house};
function explore(opts={}){
    return seq.explore({stock:inventory,entities:[],definitions,
        profile:'donor',boosts:{guild_raids_supplies_production:0},
        ...opts});
}

test('sequence mode produces non-executable financial scenarios, not game actions',()=>{
    const r=explore();
    assert.equal(r.status,'heuristic-sequence-preview');
    assert.ok(r.plans.length>0);
    assert.ok(r.plans.length<=8);
    assert.ok(r.plans.every(x=>x.executable===false));
    assert.ok(r.plans.every(x=>x.projectedProductionTime==='unverified'));
    assert.ok(r.plans.every(x=>x.donationSafetyVerified===false));
    assert.equal(r.gameActionsPerformed,false);
});
test('a pair of builds cannot double-spend the same shared supplies',()=>{
    const r=explore();
    for(const plan of r.plans){
        const totalSupplySpent=plan.spent[S]||0;
        assert.ok(totalSupplySpent<=inventory[S]);
        assert.ok(plan.remaining[S]>=0);
        const m=plan.spent[M]||0;
        assert.ok(m<=inventory[M]);
    }
    // Bakery and Alchemist each affordable singly, but not together.
    assert.equal(r.plans.some(p=>p.steps.filter(x=>x.type==='build')
        .map(x=>x.building).includes('Bakery') &&
        p.steps.map(x=>x.building).includes('Alchemist')),false);
});
test('protected Donor money/supplies reserves constrain all steps',()=>{
    const r=explore({reserves:{[M]:120000,[S]:130000}});
    for(const p of r.plans){
        assert.ok(p.remaining[M]>=120000);
        assert.ok(p.remaining[S]>=130000);
    }
    assert.equal(r.reserveMode,'manual-protected');
});
test('spent resources are not replenished with uncollected production',()=>{
    const defs={printer};
    const r=seq.explore({stock:{...inventory,[M]:90000},
        entities:[],definitions:defs});
    assert.ok(r.plans.every(p=>p.spent[M]<=90000));
    assert.equal(r.plans.some(p=>p.steps.filter(x=>x.type==='build').length===2),false);
});
test('negative intermediate population disallows a construction even if final housing would help',()=>{
    const defs={bakery};
    const r=seq.explore({stock:{...inventory,[P]:20},
        entities:[],definitions:defs});
    assert.equal(r.plans.length,0);
});
test('selling valuable housing before building can violate population even if the shape fits',()=>{
    const r=explore({stock:{...inventory,[P]:100,[T]:1000,[H]:2500},
        entities:[{id:1,cityentity_id:'house',x:0,y:0}]});
    assert.equal(r.plans.some(p=>p.steps.some(x=>x.type==='sell'&&x.building==='Estate House')),false);
});
test('a culture demolition is vetoed when it reduces current euphoria multiplier',()=>{
    const r=explore({stock:{...inventory,[H]:2100},
        entities:[{id:10,cityentity_id:'church',x:0,y:0}]});
    assert.equal(r.plans.some(p=>p.steps.some(x=>x.type==='sell'&&x.building==='Church')),false);
});
test('selling a productive building subtracts its net production from projected gain',()=>{
    const state={
        stock:{...inventory},initial:{...inventory},protectedReserves:{},
        floor:1.5,minFreePopulation:inventory[P],minEuphoriaFactor:1.5,
        increments:{},qa:{},totalCosts:{},steps:[],usedOriginals:new Set()
    };
    const sold=seq.applySell(state,'sold-tannery',oldFactory,{});
    assert.ok(sold);
    assert.equal(sold.increments[S],-3000);
    assert.equal(sold.stock[P],inventory[P]+25);
    assert.equal(sold.steps[0].refunds,'not-assumed');
    assert.equal(state.increments[S],undefined);
});
test('selling a QI-boosting building is excluded because the lost bonus is unpriced',()=>{
    const guarded=def('Gallows','culture',0,20,{[M]:36000},{},
        {boosts:{boosts:[{type:'guild_raids_action_points_collection',value:50}]}});
    const r=explore({entities:[{id:21,cityentity_id:'guarded',x:0,y:0}],
        definitions:{...definitions,guarded}});
    assert.equal(r.plans.some(p=>p.steps.some(x=>x.type==='sell'&&x.building==='Gallows')),false);
});
test('one known geometry no-fit cannot become an approved or ranked direct build',()=>{
    const areas=[{x:0,y:0,width:2,length:2}];
    const defs={printer,house};
    const index=geometry.indexMap(areas,[{cityentity_id:'house',x:0,y:0}],defs);
    const r=seq.explore({stock:inventory,entities:[{cityentity_id:'house',x:0,y:0}],
        definitions:defs,geometryIndex:index});
    assert.equal(r.plans.some(p=>p.steps.length===1&&p.steps[0].building==='Printer'),false);
    assert.ok(r.plans.every(p=>p.executable===false));
});
test('profile-specific ranking is explicit heuristic, not certified optimization',()=>{
    const donor=explore({profile:'donor'});
    const fighter=explore({profile:'fighter'});
    assert.match(donor.ranking,/heuristic/);
    assert.equal(donor.plans.every(x=>typeof x.heuristicScore==='number'),true);
    assert.equal(fighter.plans.every(x=>x.donationSafetyVerified===false),true);
});
test('missing inventory, invalid reserves and incomplete euphoria fail closed',()=>{
    assert.equal(seq.explore({stock:null,entities:[],definitions}).status,'insufficient-economy');
    assert.equal(explore({reserves:{[M]:-5}}).status,'invalid-reserve');
    assert.equal(explore({stock:{...inventory,[H]:undefined}}).status,'insufficient-economy');
});
test('no plan exports map coordinates, metadata ids, or player identifiers',()=>{
    const r=explore({entities:[{id:999123,cityentity_id:'oldFactory',x:536,y:523}]});
    const output=JSON.stringify(r);
    assert.equal(output.includes('999123'),false);
    assert.equal(output.includes('536'),false);
    assert.equal(output.includes('523'),false);
    assert.equal(output.includes('oldFactory'),false);
});

test('QI bonus branches do not share state between alternative builds',()=>{
    const aBonus=def('Gallows','culture',0,0,{[M]:36000},{},{
        boosts:{boosts:[{type:'guild_raids_action_points_collection',value:50}]}
    });
    const initial={
        stock:{...inventory},initial:{...inventory},protectedReserves:{},
        floor:1.5,minFreePopulation:inventory[P],minEuphoriaFactor:1.5,
        increments:{},qa:{},totalCosts:{},steps:[],usedOriginals:new Set()
    };
    const first=seq.applyBuild(initial,'gallows',aBonus,{},{});
    const second=seq.applyBuild(initial,'gallows',aBonus,{},{});
    assert.ok(first);
    assert.ok(second);
    assert.equal(initial.qa.guild_raids_action_points_collection,undefined);
    assert.equal(first.qa.guild_raids_action_points_collection,50);
    assert.equal(second.qa.guild_raids_action_points_collection,50);
    assert.equal(first.totalCosts[M],36000);
    assert.equal(initial.totalCosts[M],undefined);
});
