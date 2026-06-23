import L from "leaflet";
import Chart from "chart.js/auto";
import { LAYERS, BASEMAP, sourceUrl, MODE, CAMERA_3D } from "./config.js";
import { hideTreePanel } from "./map3d/index.js";

let map, overlayGroup, layerControl=null, chartObj=null, basemapLayers=[];
const status = () => document.getElementById("status");

export function initMap(){
  map = L.map("map", { center:[CAMERA_3D.lat, CAMERA_3D.lon], zoom:15 });
  overlayGroup = L.featureGroup().addTo(map);
  // tìm kiếm địa chỉ (OSM Nominatim)
  document.getElementById("q").addEventListener("keydown", async (e)=>{
    if(e.key!=="Enter") return; const t=e.target.value.trim(); if(!t) return;
    try{ const j=await (await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+encodeURIComponent(t))).json();
      if(j[0]){ map.setView([+j[0].lat,+j[0].lon],17); L.popup().setLatLng([+j[0].lat,+j[0].lon]).setContent(j[0].display_name).openOn(map); }
      else status().textContent="Không tìm thấy: "+t;
    }catch(err){ status().textContent="Lỗi tìm kiếm: "+err.message; }
  });
  return map;
}
export function showMap(){ document.getElementById("cesium").style.display="none";
  document.getElementById("map").style.display="block"; document.getElementById("side").style.display="block";
  hideTreePanel();
  if(map) map.invalidateSize(); }

function googleSat(){ return [
  L.tileLayer("https://mt0.google.com/vt/lyrs=s&hl=vi&x={x}&y={y}&z={z}",{maxZoom:21,attribution:"Imagery © Google"}),
  L.tileLayer("https://mt1.google.com/vt/lyrs=h&hl=vi&x={x}&y={y}&z={z}",{maxZoom:21}) ]; }
function osm(){ return [ L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}) ]; }
function setBasemap(kind){
  basemapLayers.forEach(l=>map.removeLayer(l));
  basemapLayers = (kind==="google-sat") ? googleSat() : osm();
  basemapLayers.forEach(l=>l.addTo(map));
}

function styleFor(ly, props){
  const r = ly.radius || 6;
  if(ly.categorical){ const c=ly.categorical.colors[props[ly.categorical.field]]||ly.categorical.default;
    return { _pt:true, radius:r, fillColor:c, color:"#fff", weight:2, fillOpacity:.92 }; }
  if(ly.geom==="point") return { _pt:true, radius:r, fillColor:ly.color, color:"#fff", weight:2, fillOpacity:.92 };
  if(ly.geom==="line"){
    // Dùng rong (m) từ GeoJSON nếu có, scale 1m ≈ 0.12px tại zoom 15
    let w = ly.weight || 3;
    if(props && props.rong){ w = Math.max(2, Math.round(props.rong * 0.13)); }
    return { color:ly.color, weight:w, opacity:.9, lineCap:"round", lineJoin:"round" };
  }
  return { fillColor:ly.color, color:"#555", weight:1, fillOpacity:.25 };
}
function popupHtml(title, props){
  const order = ["tenCty","loaiHinh","loHang","dienTich","dienThoai","tenDuong","rong","soHieu","chieuCao","namTrong","trangThai"];
  const labels = {tenCty:"Tên",loaiHinh:"Ngành",loHang:"Số lô",dienTich:"Diện tích (m²)",dienThoai:"SĐT",
                  tenDuong:"Đường",rong:"Rộng (m)",soHieu:"Số hiệu",chieuCao:"Chiều cao (m)",namTrong:"Năm trồng",trangThai:"Trạng thái"};
  const sorted = [...order.filter(k=>props[k]!=null&&props[k]!==""),
                  ...Object.keys(props).filter(k=>!order.includes(k)&&props[k]!=null&&props[k]!=="")];
  let rows="";
  sorted.slice(0,14).forEach(k=>{ rows+="<tr><td>"+(labels[k]||k)+"</td><td>"+props[k]+"</td></tr>"; });
  return "<b>"+(props.tenCty||props.tenDuong||props.tenLoai||title)+"</b><table>"+rows+"</table>";
}
async function addLayer(ly, legendAcc){
  try{
    const gj = await (await fetch(sourceUrl(ly))).json();
    if(gj.error) throw new Error(gj.error.message);
    const lyr = L.geoJSON(gj,{
      pointToLayer:(f,ll)=>L.circleMarker(ll, styleFor(ly,f.properties)),
      style:(f)=>{ const s=styleFor(ly,f.properties); return s._pt?{}:s; },
      onEachFeature:(f,l)=>{
        l.bindPopup(popupHtml(ly.title,f.properties));
        const label=f.properties.tenCty||f.properties.tenDuong;
        if(label) l.bindTooltip(label,{sticky:true,className:"map-tooltip"});
      }
    }).addTo(overlayGroup);
    layerControl.addOverlay(lyr, ly.title);
    if(ly.categorical){
      const items=Object.entries(ly.categorical.colors).map(([k,c])=>[k,{fillColor:c,_pt:true}]);
      items.push(["Khác",{fillColor:ly.categorical.default,_pt:true}]);
      legendAcc.push({title:ly.title, items});
    } else legendAcc.push({title:ly.title, items:[[ly.title,{fillColor:ly.color,_pt:ly.geom==="point"}]]});
    return { gj, cfg:ly };
  }catch(e){ console.warn("Bỏ qua",ly.title,e.message); }
}
function renderLegend(acc){
  const box=document.getElementById("legend"); box.innerHTML="";
  acc.forEach(g=>{ const h=document.createElement("div"); h.className="layergrp"; h.textContent=g.title; box.appendChild(h);
    g.items.slice(0,12).forEach(([label,s])=>{ const it=document.createElement("div"); it.className="item";
      const sw=document.createElement("span"); sw.className="sw"; sw.style.background=(s.fillColor||s.color||"#3388ff");
      if(!s._pt) sw.style.borderRadius="3px"; it.appendChild(sw); it.appendChild(document.createTextNode(label)); box.appendChild(it); }); });
}
function renderChart(layersInfo, pageTitle){
  document.getElementById("chartTitle").textContent="Thống kê — "+pageTitle;
  if(chartObj){ chartObj.destroy(); chartObj=null; }
  const li=layersInfo.find(x=>x&&x.cfg.categorical); if(!li) return;
  const f=li.cfg.categorical.field, c={};
  (li.gj.features||[]).forEach(ft=>{ const v=ft.properties[f]??"(trống)"; c[v]=(c[v]||0)+1; });
  const labels=Object.keys(c), data=labels.map(l=>c[l]);
  const colors=labels.map(l=>li.cfg.categorical.colors[l]||li.cfg.categorical.default);
  chartObj=new Chart(document.getElementById("chart"),{ type:"bar",
    data:{labels,datasets:[{data,backgroundColor:colors}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Số lượng theo "'+f+'"'}},scales:{x:{ticks:{font:{size:9}}}}} });
}

export async function load2D(page){
  showMap();
  document.querySelectorAll(".banner").forEach(b=>b.remove());
  status().textContent="Đang tải "+page.title+" ("+MODE+")…";
  overlayGroup.clearLayers(); map.removeLayer(overlayGroup); overlayGroup=L.featureGroup().addTo(map);
  if(layerControl) map.removeControl(layerControl);
  layerControl=L.control.layers(null,null,{collapsed:false}).addTo(map);
  setBasemap(BASEMAP[page.key]||"osm");
  const legendAcc=[], layersInfo=[];
  const list=(LAYERS[page.key]||[]).slice().reverse();
  for(const ly of list){ const r=await addLayer(ly,legendAcc); if(r) layersInfo.push(r); }
  legendAcc.reverse(); renderLegend(legendAcc); renderChart(layersInfo, page.title);
  try{ const b=overlayGroup.getBounds(); if(b.isValid()) map.fitBounds(b,{padding:[30,30]}); }catch(e){}
  status().textContent=page.title+": "+layersInfo.length+" lớp ("+MODE+")";
}
