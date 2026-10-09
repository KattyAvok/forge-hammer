/* AGPL-3.0 - QI settlement panel state tests.
 * Run: node --test tests/qi-settlement-support.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('../js/web/qi-settlement-core/js/qi-settlement-core.js');
const strategies = require('../js/web/qi-settlement-strategies/js/qi-settlement-strategies.js');
const advisor = require('../js/web/qi-settlement-advisor/js/qi-settlement-advisor.js');
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
            if (typeof method === 'function') {handler = method;method = 'all';}
            if (!handlers[service]) handlers[service]={};
            (handlers[service][method] ||= []).push(handler);
        }},
        HTML:{Box:()=>{throw Error('No UI in headless test')},AddCssFile:()=>{},
            CloseOpenBox:()=>{}}
    };
    const globals = {window,FH,QISettlementCore:core,QISettlementStrategies:strategies,QISettlementAdvisor:advisor,$:()=>({length:0})};
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
    assert.equal(s.selectedStage,'day1a');
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
        JSON.stringify({profile:'donor',stage:'day4b',reserveMoney:'500',reserveSupplies:'100'}));
    assert.equal(t.api.Status().selectedProfile,'donor');
    assert.equal(t.api.Status().selectedStage,'day4b');
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

test('invalid stored stage returns to safe default',()=>{
    const t=setup();
    t.store.set('QISettlementSupportSettingsV1_world1_123',
        JSON.stringify({profile:'donor',stage:'unsafe-stage',reserveMoney:'',reserveSupplies:''}));
    assert.equal(t.api.Status().selectedStage,'day1a');
});

test('visible QI panel renders selected guide, observed stock and donor reserves',()=>{
    const store=new Map(), handlers={};
    const createNode=()=>({
        length:1, children:[], raw:'',
        text(v){if (arguments.length) {this.raw+=String(v);return this;}return this.raw;},
        append(...v){this.children.push(...v);return this;},
        empty(){this.children=[];this.raw='';return this;},
        val(v){if (arguments.length) {this.value=v;return this;}return this.value;},
        attr(){return this;},on(){return this;}
    });
    let hasWindow=false;
    const body=createNode();
    const $=value=>{
        if(value==='#qiSettlementSupport')return {length:hasWindow?1:0};
        if(value==='#qiSettlementSupportBody')return {...body,length:hasWindow?1:0,
            append:(...nodes)=>{body.append(...nodes);return body;},
            empty:()=>{body.empty();return body;}};
        return createNode();
    };
    const FH={
        World:'world1',Player:{ID:123},ActiveMap:'guild_raids',
        Main:{CityEntities:{}},
        Storage:{
            getItem:k=>store.get(k)??null,
            setItem:(k,v)=>store.set(k,v)
        },
        proxy:{addHandler:(name,method,callback)=>{
            if(typeof method==='function'){callback=method;method='all';}
            (handlers[name] ||= {})[method] ||= [];
            handlers[name][method].push(callback);
        }},
        HTML:{
            Box:()=>{hasWindow=true;},
            AddCssFile:()=>{},CloseOpenBox:()=>{}
        }
    };
    store.set('QISettlementSupportSettingsV1_world1_123',
        JSON.stringify({profile:'donor',stage:'day4b',reserveMoney:'500',reserveSupplies:'100'}));
    const globals={FH,window:{location:{hostname:'world1.forgeofempires.com'}},
        QISettlementCore:core,QISettlementStrategies:strategies,QISettlementAdvisor:advisor,$};
    globals.globalThis=globals;
    vm.runInNewContext(source,globals);
    const send=(service,method,responseData)=>{
        for(const fn of handlers[service]?.[method]||[])fn({requestMethod:method,responseData});
        for(const fn of handlers[service]?.all||[])fn({requestMethod:method,responseData});
    };
    send('GuildRaidsService','getState',{__class__:'GuildRaidsRunningState',
        endsAt:20000,raidInstance:{difficultyLevel:9}});
    send('ResourceService','getPlayerResources',{resources:{
        guild_raids_money:1000,guild_raids_supplies:300,
        guild_raids_happiness:200,guild_raids_total_population:100
    }});
    globals.QISettlementSupport.Show();
    const collect=node=>node.raw+' '+node.children.map(n=>typeof n==='string'?n:collect(n)).join(' ');
    const output=collect(body);
    assert.match(output,/Bakery/);
    assert.match(output,/Donor/);
    assert.match(output,/QI mince/);
    assert.match(output,/Přebytek mincí/);
    assert.match(output,/500/);
});

test('automatic phase is independent of manually selected guide stage',()=>{
    const t=setup();t.FH.ActiveMap='guild_raids';
    t.FH.Main.CityEntities={
        estate:{name:'Estate',type:'residential',components:{AllAge:{
            staticResources:{resources:{resources:{guild_raids_population:100}}}}}},
        ropery:{name:'Ropery',type:'goods',components:{AllAge:{
            staticResources:{resources:{resources:{guild_raids_population:-100}}}}}}
    };
    t.store.set('QISettlementSupportSettingsV1_world1_123',
        JSON.stringify({profile:'fighter',stage:'day4b',reserveMoney:'',reserveSupplies:''}));
    t.send('GuildRaidsService','getState',{
        __class__:'GuildRaidsRunningState',endsAt:12345
    });
    t.send('ResourceService','getPlayerResources',{resources:{
        guild_raids_money:50000,guild_raids_supplies:30000,
        guild_raids_chrono_alloy:200,guild_raids_population:100,
        guild_raids_happiness:300,guild_raids_total_population:200
    }});
    t.send('CityMapService','getCityMap',{gridId:'guild_raids',
        entities:[{cityentity_id:'estate'},{cityentity_id:'ropery'}],
        unlocked_areas:[{}]
    });
    const status=t.api.Status();
    assert.equal(status.selectedStage,'day4b');
    assert.equal(status.autoPhase.code,'rope');
    assert.equal(status.autoPhase.confidence,'medium');
});

test('cost samples are opt-in and unavailable outside QI map',()=>{
    const t=setup();
    t.FH.Main.CityEntities.bakery={
        name:'Bakery',type:'production',
        components:{AllAge:{
            staticResources:{resources:{resources:{guild_raids_population:-50}}},
            buildingRequirements:{cost:{resources:{
                guild_raids_money:2000,guild_raids_supplies:1500
            }}}
        }}
    };
    assert.equal(t.api.CostSamples(),null);
    t.FH.ActiveMap='guild_raids';
    const samples=t.api.CostSamples();
    assert.equal(samples.summary.priced,1);
    assert.equal(samples.samples[0].costs.guild_raids_money,2000);
    assert.equal(samples.samples[0].name,'Bakery');
});
