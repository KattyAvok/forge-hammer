const test=require('node:test');
const assert=require('node:assert/strict');
const geometry=require('../js/web/qi-settlement-geometry/js/qi-settlement-geometry.js');
test('mismatched area summary keeps detail counts',()=>{
 const def={name:'House',type:'residential',components:{AllAge:{placement:{size:{x:2,y:2}}}}};
 const idx=geometry.indexMap([{x:0,y:0,width:16,length:16}],
 [{x:20,y:20,cityentity_id:'h'}],{h:def});
 const result=geometry.summarize(idx);
 assert.equal(result.status,'insufficient-evidence');
 assert.equal(result.outsideGroups.entire,1);
 assert.equal(result.baseAreaCount,1);
});
