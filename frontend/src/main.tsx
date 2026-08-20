/**
 * Kirish nuqtasi: avval so'zlar, keyin ilova.
 *
 * NEGA SHUNDAY TARTIB. Interfeys matnlari backenddan keladi (`src/i18n`), va
 * `tx()` faqat komponent ichida emas — modul darajasidagi jadvallarda ham
 * chaqiriladi (masalan `Dashboard.tsx` dagi davr nomlari). Bunday chaqiruv
 * modul birinchi import qilinganda, ya'ni bir marta bajariladi. Agar lug'at
 * o'sha paytda bo'sh bo'lsa, o'sha yozuvlar butun seans davomida kalit
 * ko'rinishida qolib ketardi.
 *
 * Shuning uchun bu fayl ilova modullarini STATIK import qilmaydi: lug'at
 * kelgach `bootstrap.tsx` dinamik yuklanadi va shundan keyingina qolgan
 * modullar baholanadi.
 */
import { loadTexts } from "./i18n";
import "./styles/app.css";

/**
 * Server javob bermasa - qisqa xabar.
 *
 * React ham bu yerda ishlatilmaydi: lug'atsiz ilovani ko'tarishning ma'nosi
 * yo'q. Shu ikki jumla - saytdagi yagona qattiq yozilgan matn.
 */
function showOffline() {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="card">
        <h2>Server bilan aloqa yo'q</h2>
        <p>Interfeys matnlarini yuklab bo'lmadi. Sahifani yangilab ko'ring.</p>
        <button class="btn btn-primary" id="tf-retry">Yangilash</button>
      </div>
    </div>`;
  document.getElementById("tf-retry")?.addEventListener("click", () => location.reload());
}

loadTexts().then((ok) => {
  if (ok) import("./bootstrap");
  else showOffline();
});
