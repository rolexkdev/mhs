import "leaflet/dist/leaflet.css";
import "./style.css";
import { PAGES } from "./config.js";
import { initMap, load2D } from "./map2d.js";
import { load3D } from "./map3d.js";

initMap();

const tabsEl=document.getElementById("tabs");
PAGES.forEach((p,i)=>{
  const b=document.createElement("button"); b.textContent=p.title;
  b.onclick=()=>{ [...tabsEl.querySelectorAll("button")].forEach(x=>x.classList.remove("active")); b.classList.add("active");
    if(p.kind==="3d") load3D(); else load2D(p); };
  tabsEl.appendChild(b); if(i===0) b.classList.add("active");
});
load2D(PAGES[0]);
