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

test('an active or uncollected production is excluded from demolition candidates',()=>{
    for(const state of ['ProducingState','CompletedState']){
        const result=seq.explore({stock:inventory,
            entities:[{id:1,x:0,y:0,cityentity_id:'oldFactory',
                state:{__class__:state,next_state_transition_in:30}}],
            definitions:{printer,oldFactory},profile:'donor'});
        assert.equal(result.skippedBusySaleCandidates,1);
        assert.equal(result.inspectedOriginalBuildings,0);
        assert.equal(result.plans.some(p=>p.steps.some(x=>x.type==='sell')),false);
    }
    const idle=seq.explore({stock:inventory,
        entities:[{id:1,x:0,y:0,cityentity_id:'oldFactory',
            state:{__class__:'IdleState'}}],
        definitions:{printer,oldFactory},profile:'donor'});
    assert.equal(idle.skippedBusySaleCandidates,0);
    assert.equal(idle.inspectedOriginalBuildings,1);
});
test('integrated two-step search cannot place two houses in space for only one',()=>{
    const defs={printer};
    const plot=geometry.indexMap([{x:0,y:0,width:3,length:2}],[],defs);
    const result=seq.explore({stock:inventory,entities:[],
        definitions:defs,geometryIndex:plot,profile:'donor'});
    assert.ok(result.plans.some(p=>p.steps.length===1));
    assert.equal(result.plans.some(p=>p.steps.length===2),false);
    assert.ok(result.plans.every(p=>p.executable===false));
});
test('integrated two-step search retains paired build only when plots coexist',()=>{
    const defs={printer};
    const plot=geometry.indexMap([{x:0,y:0,width:4,length:2}],[],defs);
    const result=seq.explore({stock:inventory,entities:[],
        definitions:defs,geometryIndex:plot,profile:'donor'});
    assert.ok(result.plans.some(p=>p.steps.filter(x=>x.type==='build').length===2));
    assert.ok(result.plans.some(p=>p.placementEvidence==='geometry-sequence-fit'));
});
test('unknown map geometry does not masquerade as verified placement',()=>{
    const result=seq.explore({stock:inventory,entities:[],
        definitions:{printer},profile:'donor',
        geometryIndex:{status:'insufficient-evidence'}});
    assert.ok(result.plans.length>0);
    assert.ok(result.plans.every(p=>p.placementEvidence==='unknown'));
    assert.ok(result.plans.every(p=>p.executable===false));
});

test('two sales can release adjoining footprints for one larger QI producer',()=>{
    const wide=def('Wide Printer','production',-30,0,
        {[M]:50000,[S]:40000}, {[M]:7000});
    wide.components.AllAge.placement.size={x:4,y:2};
    const defs={wide,oldFactory};
    const entities=[
        {id:1,cityentity_id:'oldFactory',x:0,y:0,state:{__class__:'IdleState'}},
        {id:2,cityentity_id:'oldFactory',x:2,y:0,state:{__class__:'IdleState'}}
    ];
    const index=geometry.indexMap([{x:0,y:0,width:4,length:2}],entities,defs);
    assert.equal(index.status,'geometry-indexed');
    const r=seq.explore({stock:inventory,entities,definitions:defs,
        geometryIndex:index,profile:'donor'});
    const found=r.plans.find(p=>p.steps.length===3&&
        p.steps[0].type==='sell'&&p.steps[1].type==='sell'&&
        p.steps[2].type==='build'&&p.steps[2].building==='Wide Printer');
    assert.ok(found);
    assert.equal(found.placementEvidence,'geometry-sequence-fit');
    assert.equal(found.steps.filter(x=>x.type==='sell').length,2);
    assert.ok(r.doubleSalePairsInspected>=1);
    assert.equal(found.executable,false);
    assert.equal(r.gameActionsPerformed,false);
});
test('a second demolition is blocked if interim free population goes negative',()=>{
    const wide=def('Wide Printer','production',-30,0,
        {[M]:50000,[S]:40000}, {[M]:7000});
    wide.components.AllAge.placement.size={x:4,y:2};
    const defs={wide,house};
    const entities=[
        {id:1,cityentity_id:'house',x:0,y:0,state:{__class__:'IdleState'}},
        {id:2,cityentity_id:'house',x:2,y:0,state:{__class__:'IdleState'}}
    ];
    const index=geometry.indexMap([{x:0,y:0,width:4,length:2}],entities,defs);
    const r=seq.explore({stock:{...inventory,[P]:300},
        entities,definitions:defs,geometryIndex:index});
    assert.equal(r.plans.some(p=>p.steps.filter(x=>x.type==='sell').length===2),false);
});

test('unaffordable top-ranked buildings do not displace cheaper valid planning options',()=>{
    const defs={};
    for(let i=0;i<18;i++){
        defs['expensive_'+i]=def('High-yield QI '+i,'production',-20,0,
            {[M]:250000,[S]:250000,[A]:500},
            {[S]:20000-i});
    }
    defs.printer=printer;
    const r=seq.explore({stock:inventory,entities:[],definitions:defs,
        profile:'donor'});
    assert.ok(r.candidateDefinitions>=1);
    assert.ok(r.plans.some(p=>p.steps.some(s=>s.building==='Printer')));
    assert.equal(r.plans.some(p=>p.steps.some(s=>s.building.startsWith('High-yield QI'))),false);
});

test('Rope consumed by construction remains visible in total plan balances',()=>{
    const ropePrinter=def('QI Rope Printer','production',-20,0,
        {[M]:10000,[S]:10000,guild_raids_rope:20},{[S]:4000});
    const stock={...inventory,guild_raids_rope:30};
    const result=seq.explore({stock,entities:[],definitions:{ropePrinter},
        profile:'donor'});
    const plan=result.plans.find(p=>p.steps.some(x=>x.building==='QI Rope Printer'));
    assert.ok(plan);
    assert.equal(plan.spent.guild_raids_rope,20);
    assert.equal(plan.remaining.guild_raids_rope,10);
    assert.equal(plan.executable,false);
});

test('live Donor regression never recommends selling a critical Ropery for Clapboard',()=>{
    const ropery=def('Ropery','production',-60,0,
        {[M]:45000,[S]:22500,[A]:200},
        {guild_raids_rope:100});
    const clapboard=def('Clapboard House','residential',150,0,
        {[M]:210000,[S]:200000,[A]:1000},{[M]:15000});
    const city={...inventory,[M]:1200000,[S]:1000000,[A]:10000,
        [P]:500,[T]:1200,[H]:2800};
    const r=seq.explore({stock:city,
        entities:[{id:999,cityentity_id:'ropery',x:0,y:0,
            state:{__class__:'IdleState'}}],
        definitions:{ropery,clapboard},profile:'donor'});
    assert.ok(r.skippedStrategicSaleCandidates>=1);
    assert.equal(r.plans.some(p=>p.steps.some(step=>
        step.type==='sell'&&step.building==='Ropery')),false);
    assert.equal(seq.saleRisk(ropery,city,{}),'strategic-rope-chain-unpriced');
    assert.equal(r.gameActionsPerformed,false);
});
test('multi-choice production without verified yield is protected from demolition',()=>{
    const unknown=def('Mystery Workshop','production',-20,0,
        {[M]:12000}, {[S]:500});
    unknown.components.AllAge.production.options.push({
        time:600,products:[{playerResources:{resources:{guild_raids_rope:100}}}]
    });
    assert.equal(seq.saleRisk(unknown,inventory,{}),'unmodeled-production-loss');
    const r=seq.explore({stock:inventory,
        entities:[{id:4,cityentity_id:'unknown',x:0,y:0}],
        definitions:{unknown,printer},profile:'donor'});
    assert.equal(r.inspectedOriginalBuildings,0);
    assert.equal(r.plans.some(p=>p.steps.some(s=>s.type==='sell')),false);
});
test('a known active goods-producing site is still strategic even with one option',()=>{
    const workshop=def('Special Workshop','production',-20,0,
        {[M]:10000},{guild_raids_rope:20});
    assert.equal(seq.saleRisk(workshop,inventory,{}),'strategic-goods-production');
});
test('a single modeled supplies producer may still be considered for a replacement',()=>{
    assert.equal(seq.saleRisk(oldFactory,inventory,{}),null);
    const r=explore({entities:[{id:5,cityentity_id:'oldFactory',x:0,y:0,
        state:{__class__:'IdleState'}}]});
    assert.equal(r.inspectedOriginalBuildings>=1,true);
});
