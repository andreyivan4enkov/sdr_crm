/** Заготовка: чтение телефона/заголовка со страницы объявления */
function pageContext() {
  const title = document.title?.trim() || "";
  const phoneMatch = document.body?.innerText?.match(/\+?7[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  return { title, phone: phoneMatch?.[0] || "", url: location.href };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "pageContext") {
    sendResponse(pageContext());
  }
});
