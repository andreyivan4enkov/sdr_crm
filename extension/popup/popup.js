/**
 * Для продакшена: соберите popup с @sdr-crm/api-client (createApiClient).
 * Сейчас — минимальная проверка связи с API.
 */
const $ = (id) => document.getElementById(id);

async function getOrigin() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getCrmOrigin" }, (res) => {
      resolve((res?.origin || "http://localhost:5173").replace(/\/$/, ""));
    });
  });
}

async function saveOrigin(origin) {
  await chrome.storage.sync.set({ crmOrigin: origin });
}

$("openCrm").addEventListener("click", async () => {
  const origin = $("origin").value.trim().replace(/\/$/, "");
  if (!origin) return;
  await saveOrigin(origin);
  chrome.tabs.create({ url: `${origin}/crm` });
});

$("check").addEventListener("click", async () => {
  const origin = $("origin").value.trim().replace(/\/$/, "");
  $("status").textContent = "Проверка…";
  try {
    const res = await fetch(`${origin}/api/health`, { credentials: "include" });
    const data = await res.json();
    if (data.ok) {
      $("status").textContent = `API OK · v${data.version}`;
      await saveOrigin(origin);
    } else {
      $("status").textContent = "API отвечает, но БД недоступна";
    }
  } catch {
    $("status").textContent = "Не удалось подключиться. Проверьте URL и host_permissions в manifest.json";
  }
});

getOrigin().then((origin) => {
  $("origin").value = origin;
  $("crmLink").href = `${origin}/crm`;
});
