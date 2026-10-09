/*
 * Copyright (C) 2026 Forge Hammer
 * Licensed under AGPL - see LICENSE.md for details.
 *
 * Conservative read-only QI geometry analysis. A geometrical fit is
 * NOT a verified valid building placement: unmodeled obstructions,
 * road levels, shop unlock rules, and gameplay transitions may apply.
 */
(function(root) {
    'use strict';
    const cap=25000;
    const integer=n=>Number.isSafeInteger(n);
    const key=(x,y)=>x+','+y;
    const validRect=r=>r&&[r.x,r.y,r.width,r.length].every(integer)&&
        r.width>0&&r.length>0&&r.width*r.length<=cap;
    function rectOfBuilding(e,definitions) {
        const def=definitions?.[e?.cityentity_id];
        if(!def)return null;
        const dim=def?.components?.AllAge?.placement?.size;
        const w=dim?.x ?? def.width, h=dim?.y ?? def.length;
        if(![e.x,e.y,w,h].every(integer)||w<=0||h<=0||w*h>cap)return null;
        return {x:e.x,y:e.y,width:w,length:h,
            isStreet:def.type==='street',isMain:def.type==='main_building'};
    }
    function indexMap(areas,entities,definitions) {
        if(!Array.isArray(areas)||!areas.length||!Array.isArray(entities)||
            !definitions||typeof definitions!=='object')
            return {status:'insufficient-evidence',reason:'missing-rectangles-or-entities'};
        const usable=new Set(),occupied=new Set(),streets=new Set(),main=new Set();
        let ambiguous=0,invalidAreas=0,overlap=0;
        for(const a of areas){
            if(!validRect(a)){invalidAreas++;continue;}
            for(let dx=0;dx<a.width;dx++)
                for(let dy=0;dy<a.length;dy++){
                    usable.add(key(a.x+dx,a.y+dy));
                    if(usable.size>cap)
                        return {status:'insufficient-evidence',reason:'map-area-cap-exceeded'};
                }
        }
        if(invalidAreas||!usable.size)
            return {status:'insufficient-evidence',reason:'invalid-unlocked-areas'};
        for(const e of entities){
            const r=rectOfBuilding(e,definitions);
            if(!r){ambiguous++;continue;}
            for(let dx=0;dx<r.width;dx++)
                for(let dy=0;dy<r.length;dy++){
                    const tile=key(r.x+dx,r.y+dy);
                    if(occupied.has(tile))overlap++;
                    occupied.add(tile);
                    if(r.isStreet)streets.add(tile);
                    if(r.isMain)main.add(tile);
                }
        }
        if(ambiguous || overlap)
            return {status:'insufficient-evidence',
                reason:ambiguous?'unknown-building-footprints':'overlapping-building-footprints',
                unknownBuildings:ambiguous,overlapTiles:overlap};
        const inArea=[...occupied].filter(t=>usable.has(t)).length;
        if(inArea!==occupied.size) {
            const excluded={road:0,main:0,other:0,partial:0,entire:0};
            for(const e of entities) {
                const r=rectOfBuilding(e,definitions);
                if(!r)continue;
                let included=0;
                for(let dx=0;dx<r.width;dx++)
                    for(let dy=0;dy<r.length;dy++)
                        if(usable.has(key(r.x+dx,r.y+dy)))included++;
                if(included===r.width*r.length)continue;
                excluded[r.isStreet?'road':r.isMain?'main':'other']++;
                excluded[included>0?'partial':'entire']++;
            }
            return {status:'insufficient-evidence',reason:'buildings-outside-unlocked-areas',
                outsideTiles:occupied.size-inArea,
                outsideGroups:excluded,areaTiles:usable.size,buildingTiles:occupied.size,
                buildingsScanned:entities.length,
                baseAreaCount:areas.filter(a=>a.width===16&&a.length===16).length,
                expansionAreaCount:areas.filter(a=>a.width===4&&a.length===4).length};
        }
        const free=new Set([...usable].filter(x=>!occupied.has(x)));
        // Road connectivity is only evaluated if both street and main
        // footprints are known. We do not assume a specific road level.
        let connectedRoads=null;
        if(streets.size&&main.size) {
            connectedRoads=new Set();
            const pending=[];
            const adjacent=t=>{
                const [x,y]=t.split(',').map(Number);
                return [key(x-1,y),key(x+1,y),key(x,y-1),key(x,y+1)];
            };
            for(const tile of main)
                for(const n of adjacent(tile))
                    if(streets.has(n)&&!connectedRoads.has(n)){
                        connectedRoads.add(n);pending.push(n);
                    }
            for(let i=0;i<pending.length;i++)
                for(const n of adjacent(pending[i]))
                    if(streets.has(n)&&!connectedRoads.has(n)){
                        connectedRoads.add(n);pending.push(n);
                    }
        }
        return {
            status:'geometry-indexed',usable,occupied,free,streets,connectedRoads,
            areaCount:areas.length,totalTiles:usable.size,occupiedTiles:occupied.size,
            freeTiles:free.size,streetTiles:streets.size,
            connectedStreetTiles:connectedRoads?.size ?? null,
            unknownObstacleRule:true
        };
    }
    function probeFit(index,def,limit=3,remove=[]) {
        const dim=def?.components?.AllAge?.placement?.size;
        const w=dim?.x ?? def?.width,h=dim?.y ?? def?.length;
        if(index?.status!=='geometry-indexed'||![w,h].every(integer)||w<=0||h<=0)
            return {status:'unknown',positionsFound:0,roadConnectivity:'unknown'};
        const freed=new Set();
        for(const r of remove)for(let x=r.x;x<r.x+r.width;x++)
            for(let y=r.y;y<r.y+r.length;y++)freed.add(key(x,y));
        const free=new Set([...index.free,...freed]);
        const anchors=[],seen=new Set();
        for(const t of index.usable){
            const [x,y]=t.split(',').map(Number);
            if(!free.has(t)||seen.has(t))continue;
            let fits=true,roadNear=false,roadConnected=false;
            for(let dx=0;dx<w&&fits;dx++)
                for(let dy=0;dy<h;dy++){
                    const tile=key(x+dx,y+dy);
                    if(!free.has(tile)||!index.usable.has(tile)){fits=false;break;}
                }
            if(!fits)continue;
            // A candidate road contact does not guarantee street requirements.
            const contacts=[];
            for(let dx=0;dx<w;dx++){contacts.push(key(x+dx,y-1),key(x+dx,y+h));}
            for(let dy=0;dy<h;dy++){contacts.push(key(x-1,y+dy),key(x+w,y+dy));}
            roadNear=contacts.some(t=>index.streets.has(t));
            roadConnected=index.connectedRoads!==null &&
                contacts.some(t=>index.connectedRoads.has(t));
            anchors.push({roadNear,roadConnected});
            seen.add(t);
            if(anchors.length>=Math.max(1,Math.min(20,limit)))break;
        }
        const hasRoadEvidence=index.connectedRoads!==null;
        return {
            status:anchors.length?'geometry-fit':'geometry-no-fit',
            positionsFound:anchors.length,
            roadConnectivity:!hasRoadEvidence?'unknown':
                anchors.some(p=>p.roadConnected)?'adjacent-connected-road':
                anchors.some(p=>p.roadNear)?'adjacent-unconnected-road':'no-adjacent-road',
            roadLevelVerified:false,unmodeledObstaclesPossible:true,actionable:false
        };
    }
    function summarize(index) {
        if(index?.status!=='geometry-indexed')
            return {status:index?.status||'unknown',reason:index?.reason||'unknown'};
        return {status:index.status,areaCount:index.areaCount,
            totalTiles:index.totalTiles,occupiedTiles:index.occupiedTiles,
            freeTiles:index.freeTiles,streetTiles:index.streetTiles,
            connectedStreetTiles:index.connectedStreetTiles,
            roadTopologyKnown:index.connectedRoads!==null,
            unmodeledObstaclesPossible:true};
    }
    const api=Object.freeze({indexMap,probeFit,summarize,rectOfBuilding});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.QISettlementGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this);
