/* AGPL-3.0 - QI diagnostics smoke tests. Run: node --test tests/qi-settlement-diagnostics.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../js/web/qi-settlement-core/js/qi-settlement-core.js');
const source = fs.readFileSync(path.join(__dirname,'../js/web/qi-settlement-diagnostics/js/qi-settlement-diagnostics.js'),'utf8');
function harness() {
  const handlers={}, store=new Map();
  const FH={ActiveMap:'main',Main:{CityEntities:{home:{components:{AllAge:{staticResources:{resources:{resources:{guild_raids_population:100}}}}}}}},
    Storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    proxy:{addHandler:(name,fn)=>(handlers[name]??=[]).push(fn)}};
  const globals={FH,QISettlementCore:core,window:{}};
  vm.runInNewContext(source,globals);
  return {api:globals.window.QISettlementDiagnostics,FH,store,send:(service,method,responseData)=>
    (handlers[service]||[]).forEach(fn=>fn({requestMethod:method,responseData}))};
}
test('disabled until explicit opt-in; no saved snapshot',()=>{
  const t=harness();
  t.send('ResourceService','getPlayerResources',{resources:{guild_raids_money:99}});
  assert.equal(t.api.report().enabled,false);
  assert.equal(t.api.report().qiResources.guild_raids_money,undefined);
  assert.equal(t.store.size,0);
});
test('QI report is sanitized; pending state invalidates season snapshot',()=>{
  const t=harness();t.api.enable();t.FH.ActiveMap='guild_raids';
  t.send('ResourceService','getPlayerResourceBag',{type:{value:'GuildRaids'},player_id:987654,secret:'xyz',resources:{resources:{guild_raids_money:100,main_money:500}}});
  t.send('CityMapService','getCityMap',{gridId:'guild_raids',entities:[{id:987654,cityentity_id:'home'}],unlocked_areas:[{}]});
  const r=t.api.report();
  assert.equal(r.qiResources.guild_raids_money,100);
  assert.equal(r.cityMap.entityCount,1);
  assert.equal(r.economy.availablePopulation,100);
  assert.equal(JSON.stringify(r).includes('987654'),false);
  assert.equal(JSON.stringify(r).includes('xyz'),false);
  t.send('GuildRaidsService','getState',{__class__:'GuildRaidsPendingState'});
  assert.equal(t.api.report().qiResources.guild_raids_money,undefined);
  assert.equal(t.api.report().cityMap,null);
  t.api.disable();assert.equal(t.store.size,0);
});
test('main-city map does not overwrite QI state',()=>{
  const t=harness();t.api.enable();
  t.send('CityMapService','getCityMap',{gridId:'main',entities:[{}]});
  assert.equal(t.api.report().cityMap,null);
});

test('a new QI season end time invalidates data from the previous run',()=>{
  const t=harness();t.api.enable();t.FH.ActiveMap='guild_raids';
  t.send('GuildRaidsService','getState',{__class__:'GuildRaidsRunningState',endsAt:10000});
  t.send('ResourceService','getPlayerResources',{resources:{guild_raids_money:250}});
  t.send('GuildRaidsService','getState',{__class__:'GuildRaidsRunningState',endsAt:20000});
  assert.equal(t.api.report().qiResources.guild_raids_money,undefined);
  assert.equal(t.api.report().qiRunning,true);
});
test('explicit non-QI map payload cannot overwrite QI map during transition',()=>{
  const t=harness();t.api.enable();t.FH.ActiveMap='guild_raids';
  t.send('CityMapService','getCityMap',{gridId:'main',entities:[{}]});
  assert.equal(t.api.report().cityMap,null);
});

test('reports bag/map differences without exposing building or player IDs',()=>{
  const t=harness(); t.api.enable();t.FH.ActiveMap='guild_raids';
  t.FH.Main.CityEntities.culture={components:{AllAge:{staticResources:{resources:{resources:{guild_raids_happiness:750}}}}}};
  t.send('CityMapService','getCityMap',{gridId:'guild_raids',entities:[
    {id:4355,cityentity_id:'home',state:{__class__:'ProducingState'}},
    {id:4356,cityentity_id:'culture',state:{__class__:'ConstructionState'}}
  ]});
  t.send('ResourceService','getPlayerResourceBag',{type:{value:'PlayerMain'},
    resources:{resources:{guild_raids_total_population:50,guild_raids_population:50,
      guild_raids_happiness:0,guild_raids_money:123}}
  });
  const r=t.api.report();
  assert.equal(r.schemaVersion,2);
  assert.equal(r.economyComparison.source,'resourceBag');
  assert.equal(r.economyComparison.calculatedMinusObserved.totalPopulation,50);
  assert.equal(r.economyComparison.calculatedMinusObserved.euphoria,750);
  assert.equal(r.buildingStateAudit.construction.euphoria,750);
  assert.equal(JSON.stringify(r).includes('4356'),false);
});
