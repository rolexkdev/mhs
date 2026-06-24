import { execSync, spawnSync } from "child_process";
import os from "os";
import path from "path";

const platform = os.platform(); // win32 | darwin | linux
const isWin = platform === "win32";
const isMac = platform === "darwin";
const isLinux = platform === "linux";

function hasCommand(cmd) {
  try {
    execSync(`${isWin ? "where" : "which"} ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  const result = spawnSync(cmd, { shell: true, stdio: "inherit" });
  return result.status === 0;
}

function addToPath(dir) {
  if (!process.env.PATH.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  }
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logError(message) {
  process.stderr.write(`${message}\n`);
}

// ─── RTK ────────────────────────────────────────────────────────────────────

function installRtk() {
  if (hasCommand("rtk")) {
    log("✅ rtk already installed");
    return;
  }
  log("📦 Installing rtk...");

  let ok = false;
  if (isWin) {
    // powershell luôn có trên Win, Git Bash cũng gọi được powershell
    ok = run(
      [
        'powershell -Command "',
        "$url = (Invoke-RestMethod https://api.github.com/repos/rtk-ai/rtk/releases/latest).assets",
        " | Where-Object { $_.name -like '*windows*msvc*.zip' }",
        " | Select-Object -First 1 -ExpandProperty browser_download_url;",
        "$dest = [System.IO.Path]::Combine($env:USERPROFILE, '.local', 'bin');",
        "New-Item -ItemType Directory -Force -Path $dest | Out-Null;",
        "Invoke-WebRequest $url -OutFile rtk.zip;",
        "Expand-Archive rtk.zip -DestinationPath $dest -Force;",
        'Remove-Item rtk.zip"',
      ].join(""),
    );
    if (ok) addToPath(path.join(os.homedir(), ".local", "bin"));
  } else {
    // Mac + Linux + WSL đều có curl
    ok = run(
      "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
    );
    if (ok) addToPath(path.join(os.homedir(), ".local", "bin"));
  }

  log(ok ? "✅ rtk installed" : "❌ rtk install failed");
}

// ─── UV ─────────────────────────────────────────────────────────────────────

function installUv() {
  if (hasCommand("uv")) {
    log("✅ uv already installed");
    return true;
  }
  log("📦 Installing uv...");

  let ok = false;
  if (isWin) {
    ok = run(
      'powershell -Command "irm https://astral.sh/uv/install.ps1 | iex"',
    );
  } else {
    // Mac + Linux + WSL
    ok = run("curl -LsSf https://astral.sh/uv/install.sh | sh");
  }

  if (ok) {
    // update PATH ngay để dùng được trong process này luôn
    addToPath(path.join(os.homedir(), ".local", "bin"));
    // Windows uv cài vào AppData
    if (isWin)
      addToPath(path.join(os.homedir(), "AppData", "Local", "uv", "bin"));
    return hasCommand("uv");
  }
  return false;
}

// ─── PYTHON ─────────────────────────────────────────────────────────────────

function installPython() {
  if (hasCommand("python3") || hasCommand("python")) {
    log("✅ python already installed");
    return true;
  }
  log("📦 Installing python...");

  if (isWin) {
    // thử winget trước (Win10 1709+)
    if (hasCommand("winget")) {
      if (run("winget install -e --id Python.Python.3.12 --silent")) {
        addToPath(
          path.join(
            os.homedir(),
            "AppData",
            "Local",
            "Programs",
            "Python",
            "Python312",
          ),
        );
        return true;
      }
    }
    // fallback: download installer thẳng qua powershell
    const ok = run(
      [
        'powershell -Command "',
        "Invoke-WebRequest https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe -OutFile python-installer.exe;",
        "Start-Process python-installer.exe",
        " -Args '/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1'",
        " -Wait;",
        'Remove-Item python-installer.exe"',
      ].join(""),
    );
    if (ok)
      addToPath(
        path.join(
          os.homedir(),
          "AppData",
          "Local",
          "Programs",
          "Python",
          "Python312",
        ),
      );
    return ok;
  }

  if (isMac) {
    // cài pyenv qua curl (không cần brew)
    const ok = run(
      "curl -fsSL https://pyenv.run | bash && " +
        'export PYENV_ROOT="$HOME/.pyenv" && ' +
        'export PATH="$PYENV_ROOT/bin:$PATH" && ' +
        "pyenv install 3.12 && pyenv global 3.12",
    );
    if (ok) addToPath(path.join(os.homedir(), ".pyenv", "shims"));
    return ok;
  }

  if (isLinux) {
    // apt (Ubuntu/Debian) hoặc yum (CentOS/RHEL)
    if (hasCommand("apt-get"))
      return run("sudo apt-get install -y python3 python3-pip");
    if (hasCommand("yum"))
      return run("sudo yum install -y python3 python3-pip");
    if (hasCommand("dnf"))
      return run("sudo dnf install -y python3 python3-pip");
    return false;
  }

  return false;
}

// ─── GRAPHIFY ────────────────────────────────────────────────────────────────

function installGraphify() {
  if (hasCommand("graphify")) {
    log("✅ graphify already installed");
    return;
  }
  log("📦 Installing graphify...");

  // ưu tiên uv vì tự bundle python, không cần python có sẵn
  if (installUv()) {
    const ok = run("uv tool install graphifyy");
    if (ok) {
      // graphify bin nằm ở uv tool bin dir
      addToPath(path.join(os.homedir(), ".local", "bin"));
      if (isWin)
        addToPath(path.join(os.homedir(), "AppData", "Local", "uv", "bin"));
      log("✅ graphify installed");
      return;
    }
  }

  // uv fail → fallback python
  if (installPython()) {
    const python = hasCommand("python3") ? "python3" : "python";
    const ok = run(`${python} -m pip install graphifyy`);
    log(ok ? "✅ graphify installed" : "❌ graphify install failed");
    return;
  }

  logError(
    "❌ Không cài được graphify. Cài tay: https://docs.astral.sh/uv/getting-started/installation",
  );
  process.exit(1);
}

function setupGitMergeDriver() {
  log("⚙️ Setting up git merge driver for graphify-out...");
  try {
    execSync("git config merge.ours.driver true", { stdio: "ignore" });
    log("✅ git merge driver configured");
  } catch (err) {
    logError("⚠️ failed to configure git merge driver: " + err.message);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

installRtk();
installGraphify();
setupGitMergeDriver();
