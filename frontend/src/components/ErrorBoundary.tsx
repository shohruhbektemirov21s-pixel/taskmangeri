/**
 * Render paytidagi xatoni ushlab qoladigan to'siq.
 *
 * Bunisiz React 19 da bitta komponentdagi xato butun daraxtni yechib
 * tashlaydi va odam OQ EKRAN ko'radi - sababi faqat konsolda qoladi, oddiy
 * foydalanuvchi esa uni ochmaydi. Bu yerda xato ushlanib, tushunarli xabar
 * va chiqish yo'li ko'rsatiladi.
 *
 * Ikki qavatda qo'yiladi. Tashqarisi (`main.tsx`) - butun ilova uchun oxirgi
 * to'siq. Ichkarisi (`Layout` ichidagi `Outlet` atrofida) - sahifa uchun:
 * bitta sahifa yiqilsa yon panel, qidiruv va bildirishnomalar joyida qoladi,
 * odam boshqa bo'limga o'tib ketaveradi.
 *
 * `key` sifatida manzil beriladi (`Layout` da) - boshqa sahifaga o'tilganda
 * to'siq o'zi tiklanadi, aks holda React xato holatini saqlab qolardi va
 * yangi sahifa ham ochilmasdi.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** "Sahifa" - ichki to'siq uchun; "Ilova" - tashqarisi uchun. */
  scope?: "page" | "app";
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Xatoni yutmaymiz: dasturchi konsolda qaysi komponentda yiqilganini
    // ko'ra olishi kerak.
    console.error("Sahifada xatolik:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const page = this.props.scope !== "app";

    return (
      <div className={page ? "content" : "auth-wrap"}>
        <div className="empty">
          <div className="ico">⚠️</div>
          <h3>Bu bo'limni ko'rsatib bo'lmadi</h3>
          <p>
            Kutilmagan xatolik yuz berdi. Sahifani qayta yuklab ko'ring —
            takrorlansa, iltimos, nima qilganingizni administratorga ayting.
          </p>
          {/* Xato matni kerak bo'ladi: odam uni nusxalab yuborishi mumkin. */}
          <pre className="pre-wrap mono error-detail">{error.message}</pre>
          <div className="row center" style={{ gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-primary" onClick={this.reset}>
              Qayta urinish
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Sahifani yangilash
            </button>
          </div>
        </div>
      </div>
    );
  }
}
