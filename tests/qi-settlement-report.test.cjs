const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'../js/web');
function moduleOf(name){
  return require(path.join(base,'qi-settlement-'+name,'js','qi-settlement-'+name+'.js'));
}
test('compact report exposes a parseable one-command JSON string',()=>{
 const handlers={};
 const context={
   FH:{ActiveMap:'main',World:'test',Player:{ID:1},Main:{CityEntities:{}},
       Storage:{getItem:()=>null,setItem:()=>{}},
       proxy:{addHandler:(name,method,handler)=>{
         (handlers[name] ||= []).push(typeof method==='function'?method:handler);
       }}},
   window:{location:{hostname:'test.example'}},
   QISettlementCore:moduleOf('core'),
   QISettlementStrategies:moduleOf('strategies'),
   QISettlementAdvisor:moduleOf('advisor'),
   QISettlementSimulator:moduleOf('simulator'),
   QISettlementGeometry:moduleOf('geometry'),
   QISettlementProduction:moduleOf('production'),
   QISettlementContracts:moduleOf('contracts'),
   QISettlementSequence:moduleOf('sequence'),
   QISettlementTiming:moduleOf('timing'),
   console:{log:()=>{}},$:(name)=>({length:0})
 };
 context.globalThis=context;
 vm.runInNewContext(fs.readFileSync(path.join(base,
     'qi-settlement-support/js/qi-settlement-support.js'),'utf8'),context);
 const output=context.QISettlementSupport.ShareReport();
 assert.equal(typeof output,'string');
 const parsed=JSON.parse(output);
 assert.equal(parsed.state.running,false);
 assert.equal(parsed.geometry.status,'missing-or-stale-state');
 assert.ok(output.length<14000);
});
