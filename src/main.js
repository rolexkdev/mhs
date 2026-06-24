import "leaflet/dist/leaflet.css";
import "./style.css";
import { PAGES } from "./config.js";
import { initMap, load2D } from "./map2d.js";
import { load3D } from "./map3d/index.js";
import { mountAuthButton } from "./auth.js";

initMap();

const tabsEl=document.getElementById("tabs");
const btns=new Map();   // key → nút tab

/** Kích hoạt 1 trang theo key (tô đậm tab + nạp 2D/3D). */
function activate(key){
  const p=PAGES.find(x=>x.key===key)||PAGES[0];
  btns.forEach((b,k)=>b.classList.toggle("active",k===p.key));
  if(p.kind==="3d") load3D(); else load2D(p);
}

PAGES.forEach((p)=>{
  const b=document.createElement("button"); b.textContent=p.title;
  // Đổi hash → trình duyệt phát "hashchange" → activate. Mỗi trang có link #key
  // riêng nên reload/chia sẻ link giữ đúng trang. Bấm lại tab đang mở thì nạp lại.
  b.onclick=()=>{ if(location.hash.slice(1)===p.key) activate(p.key); else location.hash=p.key; };
  tabsEl.appendChild(b); btns.set(p.key,b);
});

// Nút đăng nhập (góc phải thanh tab) — đăng nhập để được lưu thay đổi lên Supabase.
mountAuthButton(tabsEl);

window.addEventListener("hashchange",()=>activate(location.hash.slice(1)));
activate(location.hash.slice(1));   // mở đúng trang theo URL khi tải lần đầu
