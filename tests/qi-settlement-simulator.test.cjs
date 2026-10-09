/* AGPL-3.0: QI economic scenario tests.
 * Run: node --test tests/qi-settlement-simulator.test.cjs
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const advisor=require('../js/web/qi-settlement-advisor/js/qi-settlement-advisor.js');
const simulator=require('../js/web/qi-settlement-simulator/js/qi-settlement-simulator.js');
function def(name,price,pop,happiness,{qa=false,area=9}={}){
    return {name,type:happiness?'culture':'production',
        components:{AllAge:{
            placement:{size:{x:area/3,y:3}},
            staticResources:{resources:{resources:{
                guild_raids_population:pop,guild_raids_happiness:happiness
            }}},
            constructionCost:{cost:{resources:price}},
            ...(qa?{boosts:{boosts:[{
                type:'guild_raids_action_points_collection',value:100
            }]}}:{})
        }}
    };
}
const stock={
    guild_raids_money:300000,guild_raids_supplies:150000,
    guild_raids_chrono_alloy:4000,guild_raids_rope:80,
    guild_raids_total_population:1000,guild_raids_population:200,
    guild_raids_happiness:2100
};

test('Bakery quoted from live price fixture: balances, current and future population',()=>{
    const bakery=def('Bakery',{
        guild_raids_money:84000,guild_raids_supplies:100000,
        guild_raids_chrono_alloy:1000
    },-100,0);
    const q=simulator.quoteBuild({stock,definition:bakery});
    assert.equal(q.financiallyCovered,true);
    assert.equal(q.populationViable,true);
    assert.equal(q.afterCost.guild_raids_money,216000);
    assert.equal(q.afterCost.guild_raids_supplies,50000);
    assert.equal(q.afterCost.guild_raids_chrono_alloy,3000);
    assert.equal(q.duringConstruction.availablePopulation,100);
    assert.equal(q.afterCompletion.availablePopulation,100);
    assert.equal(q.actionable,false);
    assert.equal(q.layoutVerified,false);
});

test('donor reserve makes otherwise affordable Bakery financially unavailable',()=>{
    const bakery=def('Bakery',{
        guild_raids_money:84000,guild_raids_supplies:100000,
        guild_raids_chrono_alloy:1000
    },-100,0);
    const q=simulator.quoteBuild({stock,definition:bakery,reserves:{
        guild_raids_money:220000,guild_raids_supplies:100000
    }});
    assert.equal(q.financiallyCovered,false);
    assert.equal(q.shortages.guild_raids_money,4000);
    assert.equal(q.shortages.guild_raids_supplies,50000);
    assert.equal(q.actionable,false);
});

test('Clapboard fails actual supplies even with enough money',()=>{
    const clapboard=def('Clapboard House',{
        guild_raids_money:210000,guild_raids_supplies:200000,
        guild_raids_chrono_alloy:1000
    },150,0);
    const q=simulator.quoteBuild({stock,definition:clapboard});
    assert.equal(q.financiallyCovered,false);
    assert.equal(q.shortages.guild_raids_supplies,50000);
});

test('population constraint blocks immediate recruitment or construction',()=>{
    const d=def('Trebuchet Camp',{guild_raids_money:45000,
        guild_raids_supplies:22500,guild_raids_chrono_alloy:200},-300,0);
    const q=simulator.quoteBuild({stock,definition:d});
    assert.equal(q.financiallyCovered,true);
    assert.equal(q.populationViable,false);
    assert.equal(q.modeledConstraintsPass,false);
});

test('unknown building cost cannot become a zero-cost simulation',()=>{
    const d=def('Bakery',{},-100,0);
    const q=simulator.quoteBuild({stock,definition:d});
    assert.equal(q.priceStatus,'unknown');
    assert.equal(q.financiallyCovered,null);
    assert.equal(q.modeledConstraintsPass,false);
});

test('replacement releases land and consumes benefits in correct intermediate order',()=>{
    const church=def('Church',{guild_raids_money:16800},0,1000,{area:16});
    const newBuilding=def('Alchemist',{guild_raids_money:50400,
        guild_raids_supplies:60000,guild_raids_chrono_alloy:200},-150,0,{area:9});
    const q=simulator.quoteReplacement({stock,removed:church,added:newBuilding});
    assert.equal(q.afterSale.euphoria,1100);
    assert.equal(q.afterSale.availablePopulation,200);
    assert.equal(q.build.duringConstruction.availablePopulation,50);
    assert.equal(q.areaChange,7);
    assert.equal(q.modeledConstraintsPass,true);
    assert.equal(q.actionable,false);
});

test('replacement rejects demolition of housing that would make population invalid',()=>{
    const house=def('Estate House',{guild_raids_money:16000},300,0);
    const bakery=def('Bakery',{guild_raids_money:84000,
        guild_raids_supplies:100000,guild_raids_chrono_alloy:1000},-30,0);
    const q=simulator.quoteReplacement({stock,removed:house,added:bakery});
    assert.equal(q.modeledConstraintsPass,false);
    assert.ok(q.blockers.some(x=>x.includes('Demolice')));
});

test('QA-yielding cultural building is protected from automatic sell classification',()=>{
    const church=def('Church',{guild_raids_money:16800},0,100,{qa:true});
    const bakery=def('Bakery',{guild_raids_money:84000,
        guild_raids_supplies:100000,guild_raids_chrono_alloy:1000},-30,0);
    const q=simulator.quoteReplacement({stock,removed:church,added:bakery});
    assert.equal(q.actionable,false);
    assert.equal(q.modeledConstraintsPass,false);
    assert.ok(q.blockers.some(x=>x.includes('bonusy QI')));
});

test('all explore candidates remain explicitly non-actionable',()=>{
    const bakery=def('Bakery',{guild_raids_money:84000,
        guild_raids_supplies:100000,guild_raids_chrono_alloy:1000},-30,0);
    bakery.components.AllAge.production={options:[{products:[{
        playerResources:{resources:{guild_raids_supplies:200}}
    }]}]};
    const church=def('Church',{guild_raids_money:16800},0,100,{area:16});
    const definitions={bakery,church};
    const result=simulator.explore({stock,entities:[{cityentity_id:'church',state:{__class__:'IdleState'}}],
        definitions,profile:'donor',reserves:{guild_raids_money:0,guild_raids_supplies:0}});
    assert.equal(result.status,'model-preview');
    assert.ok(result.builds.length>0);
    assert.ok(result.builds.every(x=>x.actionable===false));
    assert.ok(result.replacements.every(x=>x.actionable===false));
});
