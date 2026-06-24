/**
 * auth.js — Đăng nhập Supabase (email + mật khẩu) cho phép GHI dữ liệu.
 *
 * - Khách (chưa đăng nhập): vẫn XEM được bản đồ (RLS cho đọc công khai).
 * - Đã đăng nhập: được lưu thay đổi (RLS cho ghi với role authenticated).
 *
 * Tạo tài khoản: Supabase Dashboard → Authentication → Users → Add user.
 */
import { supabase } from "./supabase.js";

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((_event, session) => cb(session?.user || null));
}

export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

/** Gắn nút Đăng nhập/Đăng xuất vào 1 phần tử container. */
export function mountAuthButton(container) {
  const btn = document.createElement("button");
  btn.className = "auth-btn";
  container.appendChild(btn);

  const render = (user) => {
    btn.textContent = user ? `⏏ ${user.email}` : "🔑 Đăng nhập";
    btn.title = user ? "Đăng xuất" : "Đăng nhập để chỉnh sửa & lưu";
    btn.onclick = user ? () => signOut() : openLoginModal;
  };

  onAuthChange(render);
  currentUser().then(render);
}

function openLoginModal() {
  let m = document.getElementById("login-modal");
  if (!m) { m = document.createElement("div"); m.id = "login-modal"; document.body.appendChild(m); }
  m.innerHTML = `<div class="lm-box">
    <div class="lm-title">Đăng nhập</div>
    <input id="lm-email" type="email" placeholder="Email" autocomplete="username"/>
    <input id="lm-pass" type="password" placeholder="Mật khẩu" autocomplete="current-password"/>
    <div id="lm-err" class="lm-err"></div>
    <div class="lm-btns"><button id="lm-ok">Đăng nhập</button><button id="lm-cancel">Hủy</button></div>
  </div>`;
  m.style.display = "flex";

  const close = () => { m.style.display = "none"; };
  m.querySelector("#lm-cancel").onclick = close;
  m.querySelector("#lm-ok").onclick = async () => {
    const email = m.querySelector("#lm-email").value.trim();
    const pass = m.querySelector("#lm-pass").value;
    const { error } = await signIn(email, pass);
    if (error) m.querySelector("#lm-err").textContent = error.message;
    else close();
  };
  m.querySelector("#lm-email").focus();
}
