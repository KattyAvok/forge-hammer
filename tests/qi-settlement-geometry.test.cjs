/* AGPL-3.0 — QI geometry evidence and conservative fit tests */
const test=require('node:test');
const assert=require('node:assert/strict');
const geometry=require('../js/web/qi-settlement-geometry/js/qi-settlement-geometry.js');
const def=(w,h,type='production')=>({
    type,components:{AllAge:{placement:{size:{x:w,y:h}}}}
});
test('a rectangular free plot supports a footprint candidate without confirming game placement',()=>{
    const defs={house:def(2,2,'residential'),road:def(1,3,'street')};
    const areas=[{x:500,y:500,width:5,length:5}];
    const buildings=[{cityentity_id:'house',x:500,y:500}];
    const indexed=geometry.indexMap(areas,buildings,defs);
    assert.equal(indexed.status,'geometry-indexed');
    assert.equal(geometry.summarize(indexed).totalTiles,25);
    assert.equal(geometry.summarize(indexed).occupiedTiles,4);
    assert.equal(geometry.summarize(indexed).freeTiles,21);
    const fit=geometry.probeFit(indexed,def(2,2));
    assert.equal(fit.status,'geometry-fit');
    assert.equal(fit.actionable,false);
    assert.equal(fit.roadConnectivity,'unknown');
});
test('no contiguous footprint cannot be called buildable',()=>{
    const defs={small:def(1,1)};
    const area=[{x:500,y:500,width:2,length:2}];
    const entities=[
      {cityentity_id:'small',x:500,y:500},{cityentity_id:'small',x:501,y:501}
    ];
    const idx=geometry.indexMap(area,entities,defs);
    assert.equal(idx.status,'geometry-indexed');
    assert.equal(geometry.probeFit(idx,def(2,2)).status,'geometry-no-fit');
    assert.equal(geometry.probeFit(idx,def(1,1)).status,'geometry-fit');
});
test('unrecorded footprint blocks exact free-space declaration',()=>{
    const idx=geometry.indexMap([{x:500,y:500,width:3,length:3}],
        [{cityentity_id:'unknown',x:500,y:500}],{});
    assert.equal(idx.status,'insufficient-evidence');
    assert.equal(idx.reason,'unknown-building-footprints');
    assert.equal(geometry.probeFit(idx,def(2,2)).status,'unknown');
});
test('overlapping footprints abort geometry instead of inventing free plots',()=>{
    const idx=geometry.indexMap([{x:500,y:500,width:3,length:3}],
      [{cityentity_id:'house',x:500,y:500},{cityentity_id:'house',x:501,y:501}],
      {house:def(2,2)});
    assert.equal(idx.reason,'overlapping-building-footprints');
});
test('roads connected to main building provide topology evidence, not road-level proof',()=>{
    const defs={main:def(2,2,'main_building'),road:def(1,1,'street')};
    const area=[{x:0,y:0,width:6,length:5}];
    const entities=[
        {cityentity_id:'main',x:0,y:0},
        {cityentity_id:'road',x:2,y:1},
        {cityentity_id:'road',x:3,y:1}
    ];
    const idx=geometry.indexMap(area,entities,defs);
    assert.equal(idx.connectedStreetTiles,2);
    const fit=geometry.probeFit(idx,def(1,1),10);
    assert.equal(fit.status,'geometry-fit');
    assert.equal(fit.roadLevelVerified,false);
    assert.equal(fit.actionable,false);
});
test('stray roads cannot be counted as connected to the main building',()=>{
    const defs={main:def(1,1,'main_building'),road:def(1,1,'street')};
    const idx=geometry.indexMap([{x:0,y:0,width:6,length:6}],
        [{cityentity_id:'main',x:0,y:0},{cityentity_id:'road',x:5,y:5}],defs);
    assert.equal(idx.connectedStreetTiles,0);
});
test('unknown map shape and excessive unlocked area fail closed',()=>{
    assert.equal(geometry.indexMap(null,[],{}).status,'insufficient-evidence');
    assert.equal(geometry.indexMap([{x:0,y:0,width:1000,length:1000}],[],{}).status,'insufficient-evidence');
});
test('anonymous summary does not contain any map coordinates or metadata identifiers',()=>{
    const d={named:def(2,2)};
    const idx=geometry.indexMap([{x:536,y:582,width:4,length:4}],
        [{cityentity_id:'named',x:536,y:582}],d);
    const json=JSON.stringify(geometry.summarize(idx));
    assert.equal(json.includes('536'),false);
    assert.equal(json.includes('582'),false);
    assert.equal(json.includes('named'),false);
});

test('geometry mismatch summarizes outside buildings without revealing coordinates',()=>{
    const definitions={
        main:def(2,2,'main_building'),
        house:def(2,2,'residential'),
        road:def(1,1,'street')
    };
    const areas=[{x:500,y:500,width:16,length:16},
        {x:516,y:500,width:4,length:4}];
    const buildings=[
        {cityentity_id:'main',x:500,y:500},
        {cityentity_id:'house',x:519,y:502},
        {cityentity_id:'road',x:525,y:510},
        {cityentity_id:'house',x:517,y:501}
    ];
    const index=geometry.indexMap(areas,buildings,definitions);
    assert.equal(index.reason,'buildings-outside-unlocked-areas');
    const summary=geometry.summarize(index);
    assert.equal(summary.baseAreaCount,1);
    assert.equal(summary.expansionAreaCount,1);
    assert.equal(summary.outsideGroups.road,1);
    assert.equal(summary.outsideGroups.main,0);
    assert.equal(summary.outsideGroups.other,1);
    assert.equal(summary.outsideGroups.partial,1);
    assert.equal(summary.outsideGroups.entire,1);
    const json=JSON.stringify(summary);
    for(const privateCoord of ['525','510','517'])
        assert.equal(json.includes(privateCoord),false);
    assert.equal(geometry.probeFit(index,def(2,2)).status,'unknown');
});

test('out-of-map impediments do not invalidate the player building footprint',()=>{
    const defs={house:def(2,2,'residential'),
        impediment:def(1,2,'impediment'),
        beyond:def(2,1,'off_grid')};
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:4}],
        [{cityentity_id:'house',x:0,y:0},
         {cityentity_id:'impediment',x:10,y:10},
         {cityentity_id:'beyond',x:12,y:10}],defs);
    assert.equal(idx.status,'geometry-indexed');
    const summary=geometry.summarize(idx);
    assert.equal(summary.occupiedTiles,4);
    assert.equal(summary.freeTiles,12);
    assert.equal(summary.ignoredOutsideObstacles,1);
    assert.equal(summary.ignoredOutsideOffGrid,1);
    assert.equal(summary.skippedOutsideTiles,4);
});
test('impediment inside the city still occupies buildable tile space',()=>{
    const defs={impediment:def(1,2,'impediment')};
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:4}],
        [{cityentity_id:'impediment',x:1,y:1}],defs);
    assert.equal(idx.status,'geometry-indexed');
    assert.equal(geometry.summarize(idx).freeTiles,14);
});
test('an ordinary building outside unlocked land remains a hard blocker',()=>{
    const defs={home:def(1,2,'residential'),obstacle:def(1,1,'impediment')};
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:4}],
        [{cityentity_id:'obstacle',x:9,y:9},
         {cityentity_id:'home',x:7,y:7}],defs);
    assert.equal(idx.status,'insufficient-evidence');
    assert.equal(idx.reason,'buildings-outside-unlocked-areas');
    assert.equal(idx.outsideGroups.other,1);
});
test('partly outside impediment blocks only tiles within unlocked land',()=>{
    const defs={obstacle:def(2,1,'impediment')};
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:4}],
        [{cityentity_id:'obstacle',x:3,y:2}],defs);
    assert.equal(idx.status,'geometry-indexed');
    assert.equal(geometry.summarize(idx).occupiedTiles,1);
    assert.equal(geometry.summarize(idx).skippedOutsideTiles,1);
});

test('two individually fitting footprints can still be impossible together',()=>{
    const defs={home:def(2,2)};
    const idx=geometry.indexMap([{x:0,y:0,width:3,length:2}],[],defs);
    assert.equal(geometry.probeFit(idx,def(2,2)).status,'geometry-fit');
    const together=geometry.probeSequence(idx,[def(2,2),def(2,2)]);
    assert.equal(together.status,'geometry-sequence-no-fit');
    assert.equal(together.actionable,false);
});
test('two small footprints are geometrically co-placeable on disjoint tiles',()=>{
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:2}],[],{});
    const result=geometry.probeSequence(idx,[def(2,2),def(2,2)]);
    assert.equal(result.status,'geometry-sequence-fit');
    assert.equal(result.buildings,2);
    assert.equal(result.roadLevelsVerified,false);
});
test('a documented demolition frees occupied land for a two-building sequence',()=>{
    const defs={house:def(2,2)};
    const e={cityentity_id:'house',x:0,y:0};
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:2}],[e],defs);
    assert.equal(geometry.probeSequence(idx,[def(2,2),def(2,2)]).status,
        'geometry-sequence-no-fit');
    const released=geometry.rectOfBuilding(e,defs);
    assert.equal(geometry.probeSequence(idx,[def(2,2),def(2,2)],[released]).status,
        'geometry-sequence-fit');
});
test('made-up demolished plots cannot create new unlocked area',()=>{
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:2}],[],{});
    const unknown=geometry.probeSequence(idx,[def(2,2),def(2,2)],
        [{x:9,y:9,width:2,length:2}]);
    assert.equal(unknown.status,'unknown');
    assert.equal(unknown.reason,'demolition-footprint-not-proven');
});
test('uncertain geometry stays unknown and does not claim available space',()=>{
    const idx={status:'insufficient-evidence'};
    assert.equal(geometry.probeSequence(idx,[def(2,2)]).status,'unknown');
    assert.equal(geometry.probeSequence(idx,[def(2,2),def(2,2),def(1,1)])
        .status,'unknown');
});

test('two released rectangles must not overlap each other',()=>{
    const defs={house:def(2,2)};
    const e={cityentity_id:'house',x:0,y:0};
    const idx=geometry.indexMap([{x:0,y:0,width:4,length:2}],[e],defs);
    const r=geometry.rectOfBuilding(e,defs);
    const result=geometry.probeSequence(idx,[def(2,2)],[r,{...r}]);
    assert.equal(result.status,'unknown');
    assert.equal(result.reason,'overlapping-demolition-footprints');
});
test('at most two verified sales may be used for a geometric scenario',()=>{
    const index=geometry.indexMap([{x:0,y:0,width:4,length:4}],[],{});
    const result=geometry.probeSequence(index,[def(1,1)],[
        {x:0,y:0,width:1,length:1},
        {x:1,y:0,width:1,length:1},
        {x:2,y:0,width:1,length:1}
    ]);
    assert.equal(result.status,'unknown');
    assert.equal(result.reason,'unverified-demolition-set');
});
