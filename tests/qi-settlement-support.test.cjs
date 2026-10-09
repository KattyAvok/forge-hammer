/* AGPL-3.0 - QI settlement panel state tests.
 * Run: node --test tests/qi-settlement-support.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('../js/web/qi-settlement-core/js/qi-settlement-core.js');
const source = fs.readFileSync(path.join(__dirname,
    '../js/web/qi-settlement-support/js/qi-settlement-support.js'), 'utf8');

function setup() {
    const store = new Map(), handlers = {}, window = {location:{hostname:'world1.forgeofempires.com'}};
    const FH = {
        World:'world1', Player:{ID:123}, ActiveMap:'main',
        Main:{CityEntities:{}},
        Storage:{
            getItem: key => store.get(key) ?? null,
            setItem: (key,value) => store.set(key,value)
        },
        proxy:{addHandler:(service,method,handler)=>{
            if (!handlers[service]) handlers[service]={};
            (handlers[service][method] ||= []).push(handler);
        }},
        HTML:{Box:()=>{throw Error('No UI in headless test')},AddCssFile:()=>{},
            CloseOpenBox:()=>{}}
    };
    const globals = {window,FH,QISettlementCore:core,$:()=>({length:0})};
    globals.globalThis=globals;
    vm.runInNewContext(source,globals);
    return {
        FH,store, api:globals.QISettlementSupport,
        send:(service,method,responseData)=>{
            for(const h of handlers[service]?.[method]||[])h({requestMethod:method,responseData});
            for(const h of handlers[service]?.['all']||[])h({requestMethod:method,responseData});
        }
    };
}

test('panel is read-only and begins without invented inventory',()=>{
    const t=setup(), s=t.api.Status();
    assert.equal(s.hasStock,false);
    assert.equal(s.hasMap,false);
    assert.equal(s.mapStale,true);
    assert.equal(s.selectedProfile,'fighter');
    assert.equal(t.store.size,0);
    t.api.Show(); // main city: no window opened
});

test('QI map and resource bag are observed, then a collection invalidates map',()=>{
    const t=setup();t.FH.ActiveMap='guild_raids';
    t.send('GuildRaidsService','getState',{
        __class__:'GuildRaidsRunningState',endsAt:10000,raidInstance:{difficultyLevel:8}
    });
    t.send('ResourceService','getPlayerResourceBag',{
        type:{value:'PlayerMain'},resources:{resources:{guild_raids_money:200,guild_raids_supplies:100}}
    });
    t.send('CityMapService','getCityMap',{
        gridId:'guild_raids',entities:[],unlocked_areas:[{}]
    });
    assert.equal(t.api.Status().hasStock,true);
    assert.equal(t.api.Status().mapStale,false);
    t.send('CityProductionService','pickupProduction',{updatedEntities:[]});
    assert.equal(t.api.Status().mapStale,true);
    assert.equal(t.api.Status().hasStock,true);
});

test('profile settings remain scoped to world and player',()=>{
    const t=setup();
    t.store.set('QISettlementSupportSettingsV1_world1_123',
        JSON.stringify({profile:'donor',reserveMoney:'500',reserveSupplies:'100'}));
    assert.equal(t.api.Status().selectedProfile,'donor');
    t.FH.World='world2';
    assert.equal(t.api.Status().selectedProfile,'fighter');
    t.FH.World='world1';t.FH.Player.ID=555;
    assert.equal(t.api.Status().selectedProfile,'fighter');
});

test('difficulty progression does not reset inventory, but a season change does',()=>{
    const t=setup();t.FH.ActiveMap='guild_raids';
    t.send('GuildRaidsService','getState',{__class__:'GuildRaidsRunningState',
        endsAt:10000,raidInstance:{difficultyLevel:8}});
    t.send('ResourceService','getPlayerResources',{resources:{guild_raids_money:100}});
    t.send('GuildRaidsService','getState',{__class__:'GuildRaidsRunningState',
        endsAt:10000,raidInstance:{difficultyLevel:9}});
    assert.equal(t.api.Status().hasStock,true);
    assert.equal(t.api.Status().difficulty,9);
    t.send('GuildRaidsService','getState',{__class__:'GuildRaidsRunningState',
        endsAt:20000,raidInstance:{difficultyLevel:1}});
    assert.equal(t.api.Status().hasStock,false);
});

test('pending run resets old QI holdings and map',()=>{
    const t=setup();t.FH.ActiveMap='guild_raids';
    t.send('ResourceService','getPlayerResources',{resources:{guild_raids_money:100}});
    t.send('CityMapService','getCityMap',{gridId:'guild_raids',entities:[]});
    t.send('GuildRaidsService','getState',{__class__:'GuildRaidsPendingState'});
    assert.equal(t.api.Status().hasStock,false);
    assert.equal(t.api.Status().hasMap,false);
    assert.equal(t.api.Status().running,false);
});

test('non-QI city map is ignored even while QI is active',()=>{
    const t=setup();t.FH.ActiveMap='guild_raids';
    t.send('CityMapService','getCityMap',{gridId:'main',entities:[{}]});
    assert.equal(t.api.Status().hasMap,false);
});
