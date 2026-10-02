import { useEffect, useState } from "react";
import { Languages } from "lucide-react";

export type Language = "en" | "fr" | "ar";
export function preferredLanguage(): Language {
  const value = localStorage.getItem("dn_language");
  return value === "fr" || value === "ar" ? value : "en";
}
const translations: Record<string, [string, string]> = {
  Home: ["Accueil", "الرئيسية"], Explore: ["Explorer", "استكشف"], Settings: ["Paramètres", "الإعدادات"],
  "Your feeds": ["Vos fils", "خلاصاتك"], "Add feed": ["Ajouter un fil", "إضافة خلاصة"],
  "Top feeds": ["Fils populaires", "أفضل الخلاصات"], "Popular topics": ["Sujets populaires", "مواضيع شائعة"],
  "Welcome back,": ["Bon retour,", "مرحباً بعودتك،"],
  "Distilling to you what is important.": ["L’essentiel de l’actualité, pour vous.", "نختصر لك ما هو مهم."],
  "Find topics and feeds to follow.": ["Découvrez des sujets et des fils à suivre.", "اكتشف مواضيع وخلاصات لمتابعتها."],
  "Ranked by stars from readers.": ["Classés selon les étoiles des lecteurs.", "مرتبة حسب نجوم القراء."],
  "For you": ["Pour vous", "لك"], "See all": ["Tout voir", "عرض الكل"],
  "Profile": ["Profil", "الملف الشخصي"], "Account": ["Compte", "الحساب"],
  "Customize your experience.": ["Personnalisez votre expérience.", "خصص تجربتك."],
  "Sign in": ["Connexion", "تسجيل الدخول"], "Help & support": ["Aide et assistance", "المساعدة والدعم"],
  "Privacy": ["Confidentialité", "الخصوصية"], "Notifications": ["Notifications", "الإشعارات"],
  "Install app (PWA)": ["Installer l’application", "تثبيت التطبيق"],
  "Feed title": ["Titre du fil", "عنوان الخلاصة"], "Prompt": ["Vos intérêts", "اهتماماتك"],
  "Update rhythm": ["Fréquence", "وتيرة التحديث"], "Hourly": ["Toutes les heures", "كل ساعة"],
  "Daily": ["Chaque jour", "يومياً"], "Weekly": ["Chaque semaine", "أسبوعياً"],
  "Cancel": ["Annuler", "إلغاء"], "Create feed": ["Créer le fil", "إنشاء خلاصة"],
  "Save changes": ["Enregistrer", "حفظ التغييرات"], "Edit feed settings": ["Modifier le fil", "تعديل إعدادات الخلاصة"],
  "Pause feed": ["Suspendre", "إيقاف الخلاصة"], "Resume feed": ["Reprendre", "استئناف الخلاصة"],
  "Copy URL": ["Copier le lien", "نسخ الرابط"], "Delete feed": ["Supprimer", "حذف الخلاصة"],
  "Search topics, feeds, or keywords…": ["Rechercher des sujets, fils ou mots-clés…", "ابحث عن مواضيع أو خلاصات…"],
};
export function useLanguage() {
  const [language, setLanguage] = useState<Language>(preferredLanguage);
  useEffect(() => {
    const sync = () => setLanguage(preferredLanguage());
    window.addEventListener("dn-language", sync);
    return () => window.removeEventListener("dn-language", sync);
  }, []);
  return { language, t: (text: string) => language === "en" ? text : translations[text]?.[language === "fr" ? 0 : 1] ?? text };
}
export function LanguageControl({ onChange }: { onChange?: (language: Language) => void }) {
  const { language } = useLanguage();
  return <details className="language-control"><summary aria-label="Language"><Languages size={19}/><span>{({ en: "English", fr: "Français", ar: "العربية" })[language]}</span></summary>
    <div className="language-menu" role="group" aria-label="Language">{(["en", "fr", "ar"] as const).map(value => <button key={value} type="button" aria-pressed={language === value} onClick={event => {
      localStorage.setItem("dn_language", value);
      window.dispatchEvent(new Event("dn-language"));
      onChange?.(value);
      event.currentTarget.closest("details")?.removeAttribute("open");
    }}><Languages size={17}/>{({ en: "English", fr: "Français", ar: "العربية" })[value]}</button>)}</div>
  </details>;
}
